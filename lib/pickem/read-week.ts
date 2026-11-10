// Read a Pick'em week for whoever is asking. Visibility is decided here, on the server: the asker's own Pick'em
// picks are the only ones a read returns.
import { rows } from '@/lib/data/db';
import { getOwnedTeam } from '@/lib/owner/teams';
import { isLocked, loadLivePickem } from './live-weeks';
import { entriesOf, lockedWeek, readBreakdown, type PickemMatchupBreakdown } from './locked-week';
import { pairOfMatchup, samePair, type LivePickemWeek, type PickemMatchup, type PickemPick } from './model';
import type { PickemPorts } from './ports';
import { entryPicksQuery } from './queries';

/**
 * Who a read is for: nobody (a public, cacheable read) or whoever the owner session says is signed in (never
 * cached).
 */
export type Asker = 'nobody' | 'session';

/** The asker's own part of a week */
export type YourPickem =
    | { status: 'signed-out' }
    | { status: 'no-team' }
    /** the entry's Pick'em picks on the week's pairings; a pick on a pair that no longer meets is left out */
    | { status: 'entry'; franchiseId: number; picks: PickemPick[] };

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
    /** every matchup's entries on each side, from the lock on, to any caller; null before the lock */
    breakdown: PickemMatchupBreakdown[] | null;
}

export interface ReadWeekInput {
    now: number;
    /** the season being played when omitted */
    seasonYear?: number;
    /** the next week to lock when omitted; 'last-locked' for the most recently locked week */
    week?: number | 'last-locked';
    asker: Asker;
}

export type ReadWeekResult =
    | { status: 'week'; week: PickemWeek }
    /** Pick'em is off, the season or week has no Pick'em, or no week is left to lock */
    | { status: 'no-week' }
    | { status: 'unavailable' };

export function createReadWeek(ports: PickemPorts) {
    async function yours(week: LivePickemWeek): Promise<YourPickem> {
        const owner = await ports.ownerSession.currentOwner();
        if (!owner) return { status: 'signed-out' };
        const team = await getOwnedTeam(owner.uid);
        if (!team) return { status: 'no-team' };
        const saved = await rows<{ low: number; high: number; picked: number }>(entryPicksQuery(week.seasonYear, week.week, team.id));
        const pairs = week.matchups.map(pairOfMatchup);
        const picks = saved.map(pick => ({ matchup: [pick.low, pick.high] as [number, number], picked: pick.picked }))
            .filter(pick => pairs.some(pair => samePair(pair, pick.matchup)));
        return { status: 'entry', franchiseId: team.id, picks };
    }

    return async function readWeek(input: ReadWeekInput): Promise<ReadWeekResult> {
        if (!ports.launch) return { status: 'no-week' };
        const live = await loadLivePickem(ports, input.now);
        if (!live) return { status: 'unavailable' };
        if (input.seasonYear !== undefined && input.seasonYear !== live.seasonYear) return { status: 'no-week' };
        const found = input.week === undefined ? live.weeks.find(item => !isLocked(item, input.now))
            : input.week === 'last-locked' ? live.weeks.findLast(item => isLocked(item, input.now))
            : live.weeks.find(item => item.week === input.week);
        if (!found) return { status: 'no-week' };
        const locked = isLocked(found, input.now);
        const entries = entriesOf(live.teams);
        const week = locked ? await lockedWeek(found, entries) : found;
        return { status: 'week', week: {
            ...week, phase: locked ? 'locked' : 'open',
            yours: input.asker === 'session' ? await yours(week) : null,
            breakdown: locked ? await readBreakdown(week, entries) : null,
        } };
    };
}
