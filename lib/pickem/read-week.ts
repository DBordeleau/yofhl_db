// Read a Pick'em week for whoever is asking. Visibility is decided here, on the server: the asker's own Pick'em
// picks are the only ones a read returns.
import { rows } from '@/lib/data/db';
import { getOwnedTeam } from '@/lib/owner/teams';
import { isLocked, loadLivePickem } from './live-weeks';
import { pairOfMatchup, samePair, type LivePickemWeek, type PickemMatchup, type PickemPick } from './model';
import type { PickemPorts } from './ports';
import { entryPicksQuery } from './queries';
import { weekOptions, type PickemWeekOption } from './week-switcher';
import { readWhosIn, type PickemWhoIsIn } from './whos-in';

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
    /** every active franchise and whether it is in, for the next week to lock only; null for any other week */
    whosIn: PickemWhoIsIn[] | null;
}

export interface ReadWeekInput {
    now: number;
    /** the season being played when omitted */
    seasonYear?: number;
    /** the next week to lock when omitted */
    week?: number;
    asker: Asker;
}

export type ReadWeekResult =
    /** `weeks` is the season's switcher: every Pick'em week of the season, from its first week on */
    | { status: 'week'; week: PickemWeek; weeks: PickemWeekOption[] }
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
        const week = input.week === undefined
            ? live.weeks.find(item => !isLocked(item, input.now))
            : live.weeks.find(item => item.week === input.week);
        if (!week) return { status: 'no-week' };
        const nextToLock = live.weeks.find(item => !isLocked(item, input.now));
        return { status: 'week', week: {
            ...week, phase: isLocked(week, input.now) ? 'locked' : 'open',
            yours: input.asker === 'session' ? await yours(week) : null,
            whosIn: week === nextToLock ? await readWhosIn(week) : null,
        }, weeks: weekOptions(live.weeks, input.now) };
    };
}
