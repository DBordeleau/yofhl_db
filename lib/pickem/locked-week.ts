// A locked week (GLOSSARY.md, "Lock"): from the lock on, everyone sees how each matchup split and which entries
// took each side. A Pick'em pick counts only when it matches one of the week's pairings: the recorded pairing once
// settle has recorded the week, the live season's until then, so the breakdown is there from the lock itself. Once
// the week is final, each matchup's result is marked too.
import { sql } from 'drizzle-orm';
import type { LiveTeam } from '@/lib/fantrax/live-season';
import { cached, rows } from '@/lib/data/db';
import { franchiseOf, pairOf, pairOfMatchup, samePair, type LivePickemWeek, type PickemFranchise, type PickemMatchup } from './model';
import type { PickemPorts } from './ports';
import { pickemSeasonTag, type RecordedWeek } from './recorded-weeks';
import { liveWinners, type Winner } from './results';

/** A Pick'em entry as the breakdown shows it */
export interface PickemEntry {
    /** the franchise's identity in the season */
    franchise: PickemFranchise;
    /** the owner's name the site shows for the franchise, or null when it has none */
    owner: string | null;
}

/** Which side of a scored matchup won, or that it was tied */
export type PickemMatchupResult = 'away' | 'home' | 'tie';

/** One matchup of a locked week: the entries that picked each side, by franchise name */
export interface PickemMatchupBreakdown {
    matchup: PickemMatchup;
    away: PickemEntry[];
    home: PickemEntry[];
    /** null until the week is a final week */
    result: PickemMatchupResult | null;
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
    franchise: franchiseOf(team, team.franchiseId), owner: team.owner,
} satisfies PickemEntry] as const]));

/**
 * Recorded or live pairings as matchups between `entries`, each with its result from `winners` (in pairing order);
 * a pairing with a franchise `entries` doesn't know is left out.
 */
export function countedPairings(pairings: { away: number; home: number }[], entries: Map<number, PickemEntry>, winners: Winner[] | null) {
    const counted = pairings.flatMap((pairing, index) => {
        const away = entries.get(pairing.away), home = entries.get(pairing.home);
        return away && home ? [{ matchup: { away: away.franchise, home: home.franchise }, winner: winners?.[index] ?? null }] : [];
    });
    return { matchups: counted.map(item => item.matchup), winners: winners && counted.map(item => item.winner) };
}

/**
 * A locked week as it is scored: the pairings its Pick'em picks count against (its record once settle has written
 * one, else the live season's) and, once it is a final week, each one's result in `winners`, in matchup order.
 */
export interface ScoredWeek extends LivePickemWeek {
    /** null until the week is a final week */
    winners: Winner[] | null;
}

/** What scoring and the breakdown need of a locked week, whether from the live season or from the record alone */
export type CountedWeek = Pick<ScoredWeek, 'seasonYear' | 'week' | 'name' | 'lock' | 'matchups' | 'winners'>;

/** `live`, a locked week, as it is scored: frozen results once settle has frozen it, else the live season's */
export async function lockedWeek(ports: Pick<PickemPorts, 'liveSeason'>, live: LivePickemWeek, recorded: RecordedWeek | undefined,
    teams: LiveTeam[]): Promise<ScoredWeek> {
    const pairings = recorded?.pairings ?? live.matchups.map(({ away, home }) => ({ away: away.id, home: home.id, winner: null }));
    const winners = recorded?.frozen ? pairings.map(pairing => pairing.winner)
        : live.final ? await liveWinners(ports, live.week, pairings, teams) : null;
    return { ...live, lock: recorded?.lock ?? live.lock, ...countedPairings(pairings, entriesOf(teams), winners) };
}

const resultOf = (matchup: PickemMatchup, winner: Winner): PickemMatchupResult =>
    winner === matchup.away.id ? 'away' : winner === matchup.home.id ? 'home' : 'tie';

/** The breakdown of a locked week on `week`'s pairings, with each matchup's result once the week is scored */
export async function readBreakdown(week: CountedWeek, entries: Map<number, PickemEntry>): Promise<PickemMatchupBreakdown[]> {
    const picks = await readWeekPicks(week.seasonYear, week.week);
    const byName = (a: PickemEntry, b: PickemEntry) => a.franchise.name.localeCompare(b.franchise.name) || a.franchise.id - b.franchise.id;
    return week.matchups.map((matchup, index) => {
        const pair = pairOfMatchup(matchup);
        const on = picks.filter(pick => samePair(pairOf(pick.low, pick.high), pair));
        const side = (franchise: number) => on.filter(pick => pick.picked === franchise)
            .flatMap(pick => entries.get(pick.entry) ?? []).sort(byName);
        return { matchup, away: side(matchup.away.id), home: side(matchup.home.id), result: week.winners ? resultOf(matchup, week.winners[index]) : null };
    });
}
