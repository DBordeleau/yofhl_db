// The Pick'em leaderboard (GLOSSARY.md): a season's entries ranked by correct Pick'em picks, then by fewer wrong
// ones; entries level on both share the place. Computed on read from Pick'em picks and results; nothing aggregated
// is stored.
import { sql } from 'drizzle-orm';
import { cached, rows } from '@/lib/data/db';
import { isLocked } from './live-weeks';
import { entriesOf, lockedWeek, type CountedWeek, type PickemEntry } from './locked-week';
import { pairOf, pairOfMatchup, samePair } from './model';
import type { PickemPorts } from './ports';
import { readSeasonEntries, recordedWeek } from './past-season';
import { pickemSeasonTag, readRecordedSeason } from './recorded-weeks';
import { outcomeOf } from './results';
import { askedSeason, winnersOf } from './seasons';

/** One entry's place on the Pick'em leaderboard */
export interface PickemLeaderboardEntry extends PickemEntry {
    /** shared by entries level on correct and wrong Pick'em picks */
    rank: number;
    correct: number;
    wrong: number;
    /** correct over correct plus wrong, from 0 to 1; null when both are zero */
    percentage: number | null;
}

export interface PickemLeaderboard {
    seasonYear: number;
    /** every entry with a Pick'em pick in a locked week, best first */
    entries: PickemLeaderboardEntry[];
    /** every entry in first place once the season's Pick'em is complete (more than one for joint winners); empty before */
    winners: PickemLeaderboardEntry[];
}

export interface ReadPickemLeaderboardInput {
    now: number;
    /** the season being played when omitted */
    seasonYear?: number;
}

export type ReadPickemLeaderboardResult =
    /**
     * `beingPlayed`: whether this is the season being played, the live season's. `seasons`: every season with a
     * Pick'em, newest first.
     */
    | { status: 'leaderboard'; leaderboard: PickemLeaderboard; beingPlayed: boolean; seasons: number[] }
    /** Pick'em is off, or the season has no Pick'em */
    | { status: 'no-season' }
    | { status: 'unavailable' };

interface SeasonPick { week: number; entry: number; low: number; high: number; picked: number }

const lockedPicksQuery = (seasonYear: number, weeks: number[]) => sql`
    select week, entry_franchise_id as entry, low_franchise_id as low, high_franchise_id as high, picked_franchise_id as picked
    from league.pickem_picks
    where season_year = ${seasonYear}::int
      and week in (select value::int from jsonb_array_elements_text(${JSON.stringify(weeks)}::jsonb))`;

// Only locked weeks' Pick'em picks are read, and nothing changes them, so they are cached until settle expires the
// season; a week locking changes the weeks asked for, and so the entry read.
const readLockedPicks = cached(async (seasonYear: number, weeks: number[]) => rows<SeasonPick>(lockedPicksQuery(seasonYear, weeks)),
    'pickem-locked-picks', seasonYear => [pickemSeasonTag(seasonYear)]);

/** Each entry's record over `weeks`; an entry is there once it has a Pick'em pick on one of their pairings */
export function rankEntries(weeks: Pick<CountedWeek, 'week' | 'matchups' | 'winners'>[], picks: SeasonPick[], entries: Map<number, PickemEntry>): PickemLeaderboardEntry[] {
    const records = new Map<number, { correct: number; wrong: number }>();
    for (const week of weeks) {
        const pairs = week.matchups.map(pairOfMatchup);
        for (const pick of picks) {
            if (pick.week !== week.week) continue;
            const index = pairs.findIndex(pair => samePair(pair, pairOf(pick.low, pick.high)));
            if (index < 0) continue;
            const record = records.get(pick.entry) ?? { correct: 0, wrong: 0 };
            records.set(pick.entry, record);
            if (!week.winners) continue;
            const outcome = outcomeOf(pick.picked, week.winners[index]);
            if (outcome === 'correct') record.correct++;
            if (outcome === 'wrong') record.wrong++;
        }
    }
    const ranked = [...records].flatMap(([franchise, record]) => {
        const entry = entries.get(franchise);
        return entry ? [{ ...entry, ...record }] : [];
    }).sort((a, b) => b.correct - a.correct || a.wrong - b.wrong
        || a.franchise.name.localeCompare(b.franchise.name) || a.franchise.id - b.franchise.id);
    return ranked.map((entry, index) => {
        const first = ranked.findIndex(other => other.correct === entry.correct && other.wrong === entry.wrong);
        const decided = entry.correct + entry.wrong;
        return { rank: (first < 0 ? index : first) + 1, ...entry, percentage: decided ? entry.correct / decided : null };
    });
}

export function createReadPickemLeaderboard(ports: PickemPorts) {
    return async function readPickemLeaderboard(input: ReadPickemLeaderboardInput): Promise<ReadPickemLeaderboardResult> {
        const season = await askedSeason(ports, input.now, input.seasonYear);
        if (season.kind === 'none') return { status: 'no-season' };
        if (season.kind === 'unavailable') return { status: 'unavailable' };
        const seasonYear = season.kind === 'live' ? season.live.seasonYear : season.seasonYear;
        const recorded = await readRecordedSeason(seasonYear);
        const picksOf = (numbers: number[]) => numbers.length ? readLockedPicks(seasonYear, numbers) : Promise.resolve([]);
        let weeks: Pick<CountedWeek, 'week' | 'matchups' | 'winners'>[], picks: SeasonPick[], entries: Map<number, PickemEntry>;
        if (season.kind === 'live') {
            const { live } = season;
            const locked = live.weeks.filter(week => isLocked(week, input.now));
            entries = entriesOf(live.teams);
            [weeks, picks] = await Promise.all([
                Promise.all(locked.map(week => lockedWeek(ports, week, recorded.find(item => item.week === week.week), live.teams))),
                picksOf(locked.map(week => week.week)),
            ]);
        } else {
            entries = await readSeasonEntries(seasonYear);
            weeks = recorded.map(week => recordedWeek(seasonYear, week, entries));
            picks = await picksOf(weeks.map(week => week.week));
        }
        const ranked = rankEntries(weeks, picks, entries);
        return {
            status: 'leaderboard', beingPlayed: season.kind === 'live', seasons: season.seasons,
            leaderboard: { seasonYear, entries: ranked, winners: winnersOf(ranked, season.complete) },
        };
    };
}
