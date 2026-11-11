// Read a Pick'em week for whoever is asking. Visibility is decided here, on the server: the asker's own Pick'em
// picks are the only ones a read returns.
import { rows } from '@/lib/data/db';
import { isLocked } from './live-weeks';
import { entriesOf, lockedWeek, readBreakdown, type CountedWeek, type PickemMatchupBreakdown, type ScoredWeek } from './locked-week';
import { pairOfMatchup, samePair, type LeagueStanding, type MatchupPair, type PickemMatchup, type PickemPick } from './model';
import type { PickemPorts } from './ports';
import { entryPicksQuery } from './queries';
import { pastWeekName, readSeasonEntries, recordedWeek } from './past-season';
import { readRecordedSeason } from './recorded-weeks';
import { outcomeOf, type PickemPickOutcome } from './results';
import { askedSeason } from './seasons';
import { weekOptions, type PickemWeekOption } from './week-switcher';
import { readWhosIn, type PickemWhoIsIn } from './whos-in';

/**
 * Who a read is for: nobody (a public, cacheable read) or whoever the owner session says is signed in (never
 * cached).
 */
export type Asker = 'nobody' | 'session';

/** One of the asker's Pick'em picks; `outcome` only once the week is scored */
export interface YourPickemPick extends PickemPick {
    outcome?: PickemPickOutcome;
}

/** The asker's own part of a week */
export type YourPickem =
    | { status: 'signed-out' }
    | { status: 'no-team' }
    /** the entry's Pick'em picks on the week's pairings; a pick on a pair that no longer meets is left out */
    | { status: 'entry'; franchiseId: number; picks: YourPickemPick[] };

export interface PickemWeek {
    seasonYear: number;
    week: number;
    /** "Week 5" */
    name: string;
    /** ISO timestamp */
    lock: string;
    phase: 'open' | 'locked';
    matchups: PickemMatchup[];
    /** null when asked for nobody */
    yours: YourPickem | null;
    /** every active franchise and whether it is in, for the next week to lock only; null for any other week */
    whosIn: PickemWhoIsIn[] | null;
    /** every matchup's entries on each side and, once scored, its result, from the lock on, to any caller; null before the lock */
    breakdown: PickemMatchupBreakdown[] | null;
    /** the league standings as they are now, by franchise id, for an open week only: they say nothing of a week already played */
    leagueStandings: Record<number, LeagueStanding> | null;
}

export interface ReadWeekInput {
    now: number;
    /** the season being played when omitted */
    seasonYear?: number;
    /**
     * the next week to lock when omitted (a past season's last week, since none is left to lock); 'last-locked' for
     * the most recently locked week
     */
    week?: number | 'last-locked';
    asker: Asker;
}

export type ReadWeekResult =
    /**
     * `weeks` is the season's switcher: every Pick'em week of the season, from its first week on. `beingPlayed`:
     * whether the season is the one being played, the live season's.
     */
    | { status: 'week'; week: PickemWeek; weeks: PickemWeekOption[]; beingPlayed: boolean }
    /** Pick'em is off, the season or week has no Pick'em, or no week is left to lock */
    | { status: 'no-week' }
    | { status: 'unavailable' };

export function createReadWeek(ports: PickemPorts) {
    async function yours(week: CountedWeek): Promise<YourPickem> {
        const signedIn = await ports.ownerSession.currentOwnerTeam();
        if (!signedIn) return { status: 'signed-out' };
        const { team } = signedIn;
        if (!team) return { status: 'no-team' };
        const saved = await rows<{ low: number; high: number; picked: number }>(entryPicksQuery(week.seasonYear, week.week, team.id));
        const pairs = week.matchups.map(pairOfMatchup);
        const picks = saved.flatMap((pick): YourPickemPick[] => {
            const matchup: MatchupPair = [pick.low, pick.high];
            const index = pairs.findIndex(pair => samePair(pair, matchup));
            if (index < 0) return [];
            return [week.winners ? { matchup, picked: pick.picked, outcome: outcomeOf(pick.picked, week.winners[index]) } : { matchup, picked: pick.picked }];
        });
        return { status: 'entry', franchiseId: team.id, picks };
    }

    // A past season's week from Pick'em's own record alone: every week of it is locked.
    async function readPastWeek(input: ReadWeekInput, seasonYear: number): Promise<ReadWeekResult> {
        const [recorded, entries] = await Promise.all([readRecordedSeason(seasonYear), readSeasonEntries(seasonYear)]);
        const found = typeof input.week === 'number' ? recorded.find(item => item.week === input.week) : recorded.at(-1);
        if (!found) return { status: 'no-week' };
        const week = recordedWeek(seasonYear, found, entries);
        return { status: 'week', beingPlayed: false, week: {
            seasonYear, week: week.week, name: week.name, lock: week.lock, matchups: week.matchups, phase: 'locked',
            yours: input.asker === 'session' ? await yours(week) : null,
            whosIn: null,
            breakdown: await readBreakdown(week, entries),
            leagueStandings: null,
        }, weeks: recorded.map(item => ({ week: item.week, name: pastWeekName(item.week), lock: item.lock, phase: 'locked' })) };
    }

    return async function readWeek(input: ReadWeekInput): Promise<ReadWeekResult> {
        const season = await askedSeason(ports, input.now, input.seasonYear);
        if (season.kind === 'none') return { status: 'no-week' };
        if (season.kind === 'unavailable') return { status: 'unavailable' };
        if (season.kind === 'past') return readPastWeek(input, season.seasonYear);
        const { live } = season;
        const found = input.week === undefined ? live.weeks.find(item => !isLocked(item, input.now))
            : input.week === 'last-locked' ? live.weeks.findLast(item => isLocked(item, input.now))
            : live.weeks.find(item => item.week === input.week);
        if (!found) return { status: 'no-week' };
        const nextToLock = live.weeks.find(item => !isLocked(item, input.now));
        const locked = isLocked(found, input.now);
        const entries = entriesOf(live.teams);
        const recorded = locked ? (await readRecordedSeason(live.seasonYear)).find(item => item.week === found.week) : undefined;
        const week: ScoredWeek = locked ? await lockedWeek(ports, found, recorded, live.teams) : { ...found, winners: null };
        return { status: 'week', beingPlayed: true, week: {
            seasonYear: week.seasonYear, week: week.week, name: week.name, lock: week.lock, matchups: week.matchups,
            phase: locked ? 'locked' : 'open',
            yours: input.asker === 'session' ? await yours(week) : null,
            whosIn: found === nextToLock ? await readWhosIn(week) : null,
            breakdown: locked ? await readBreakdown(week, entries) : null,
            leagueStandings: locked ? null : live.leagueStandings,
        }, weeks: weekOptions(live.weeks, input.now) };
    };
}
