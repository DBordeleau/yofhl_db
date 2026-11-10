// The Pick'em leaderboard (GLOSSARY.md): a season's entries ranked by correct Pick'em picks, then by fewer wrong
// ones; entries level on both share the place. Computed on read from Pick'em picks and results; nothing aggregated
// is stored.
import { sql } from 'drizzle-orm';
import { cached, rows } from '@/lib/data/db';
import { isLocked, loadLivePickem } from './live-weeks';
import { entriesOf, lockedWeek, type PickemEntry, type ScoredWeek } from './locked-week';
import { pairOf, pairOfMatchup, samePair } from './model';
import type { PickemPorts } from './ports';
import { pickemSeasonTag, readRecordedSeason } from './recorded-weeks';
import { outcomeOf } from './results';

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
}

export interface ReadLeaderboardInput {
    now: number;
    /** the season being played when omitted */
    seasonYear?: number;
}

export type ReadLeaderboardResult =
    | { status: 'leaderboard'; leaderboard: PickemLeaderboard }
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
export function rankEntries(weeks: ScoredWeek[], picks: SeasonPick[], entries: Map<number, PickemEntry>): PickemLeaderboardEntry[] {
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

export function createReadLeaderboard(ports: PickemPorts) {
    return async function readLeaderboard(input: ReadLeaderboardInput): Promise<ReadLeaderboardResult> {
        if (!ports.launch) return { status: 'no-season' };
        const live = await loadLivePickem(ports, input.now);
        if (!live) return { status: 'unavailable' };
        if (input.seasonYear !== undefined && input.seasonYear !== live.seasonYear) return { status: 'no-season' };
        const locked = live.weeks.filter(week => isLocked(week, input.now));
        const recorded = await readRecordedSeason(live.seasonYear);
        const [weeks, picks] = await Promise.all([
            Promise.all(locked.map(week => lockedWeek(ports, week, recorded.find(item => item.week === week.week), live.teams))),
            locked.length ? readLockedPicks(live.seasonYear, locked.map(week => week.week)) : [],
        ]);
        return { status: 'leaderboard', leaderboard: { seasonYear: live.seasonYear, entries: rankEntries(weeks, picks, entriesOf(live.teams)) } };
    };
}
