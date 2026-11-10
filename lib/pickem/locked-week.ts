// A locked week (GLOSSARY.md, "Lock"): from the lock on, everyone sees how each matchup split and which entries
// took each side. A Pick'em pick counts only when it matches one of the week's pairings: the recorded pairing once
// settle has recorded the week, the live season's until then, so the breakdown is there from the lock itself.
import { sql } from 'drizzle-orm';
import type { LiveTeam } from '@/lib/fantrax/live-season';
import { cached, rows } from '@/lib/data/db';
import { pairOf, pairOfMatchup, samePair, type LivePickemWeek, type PickemFranchise, type PickemMatchup } from './model';
import { pickemSeasonTag, readRecordedWeek } from './recorded-weeks';

/** A Pick'em entry as the breakdown shows it */
export interface PickemEntry {
    /** the franchise's identity in the season */
    franchise: PickemFranchise;
    /** the owner's name the site shows for the franchise, or null when it has none */
    owner: string | null;
}

/** One matchup of a locked week: the entries that picked each side, by franchise name */
export interface PickemMatchupBreakdown {
    matchup: PickemMatchup;
    away: PickemEntry[];
    home: PickemEntry[];
}

const weekPicksQuery = (seasonYear: number, week: number) => sql`
    select entry_franchise_id as entry, low_franchise_id as low, high_franchise_id as high, picked_franchise_id as picked
    from league.pickem_picks
    where season_year = ${seasonYear}::int and week = ${week}::int`;

// Nothing can change a week's Pick'em picks after its lock, so they are cached until settle expires the season.
const readWeekPicks = cached(async (seasonYear: number, week: number) =>
    rows<{ entry: number; low: number; high: number; picked: number }>(weekPicksQuery(seasonYear, week)),
'pickem-locked-week-picks', seasonYear => [pickemSeasonTag(seasonYear)]);

/** every entry the live season knows, by franchise */
export const entriesOf = (teams: LiveTeam[]) => new Map(teams.flatMap(team => team.franchiseId === null ? [] : [[team.franchiseId, {
    franchise: { id: team.franchiseId, name: team.name, abbreviation: team.abbreviation, logo: team.logo }, owner: team.owner,
} satisfies PickemEntry] as const]));

/** A locked week as its Pick'em picks count against it: its record once settle has written one, else `live` */
export async function lockedWeek(live: LivePickemWeek, entries: Map<number, PickemEntry>): Promise<LivePickemWeek> {
    const recorded = await readRecordedWeek(live.seasonYear, live.week);
    if (!recorded) return live;
    return { ...live, lock: recorded.lock, matchups: recorded.pairings.flatMap(({ away, home }) => {
        const awayEntry = entries.get(away), homeEntry = entries.get(home);
        return awayEntry && homeEntry ? [{ away: awayEntry.franchise, home: homeEntry.franchise }] : [];
    }) };
}

/** The breakdown of a locked week on `week`'s pairings */
export async function readBreakdown(week: LivePickemWeek, entries: Map<number, PickemEntry>): Promise<PickemMatchupBreakdown[]> {
    const picks = await readWeekPicks(week.seasonYear, week.week);
    const byName = (a: PickemEntry, b: PickemEntry) => a.franchise.name.localeCompare(b.franchise.name) || a.franchise.id - b.franchise.id;
    return week.matchups.map(matchup => {
        const pair = pairOfMatchup(matchup);
        const on = picks.filter(pick => samePair(pairOf(pick.low, pick.high), pair));
        const side = (franchise: number) => on.filter(pick => pick.picked === franchise)
            .flatMap(pick => entries.get(pick.entry) ?? []).sort(byName);
        return { matchup, away: side(matchup.away.id), home: side(matchup.home.id) };
    });
}
