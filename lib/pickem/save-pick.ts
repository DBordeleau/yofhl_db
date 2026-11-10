// Save or clear a Pick'em pick: the owner preamble (with the lock as its closed gate), the pairing checked
// against the live season, then one statement that rechecks the owner and the lock against the database clock.
import { rows } from '@/lib/data/db';
import { TooManyAttemptsError, type OwnerPreambleRejection } from '@/lib/owner/create-owner-session';
import { isLocked, loadLivePickem } from './live-weeks';
import { pairOf, pairOfMatchup, samePair } from './model';
import type { PickemPorts } from './ports';
import { clearPickQuery, savePickQuery } from './queries';

/** Pick'em saves share their own limit, high enough to fill out a whole season in one sitting */
const PICKEM_ACTION = { name: 'pickem', attempts: 300 };

export type SavePickRejection = OwnerPreambleRejection
    /** Pick'em is off, or the week is not a Pick'em week of the season being played (a playoff round, say) */
    | 'not-open'
    | 'locked'
    | 'no-such-matchup'
    | 'not-in-matchup'
    | 'rate-limited';

export interface SavePickInput {
    now: number;
    seasonYear: number;
    week: number;
    /** the matchup's two franchises, in either order */
    matchup: [number, number];
    /** the franchise picked to win, or null to clear the pick */
    picked: number | null;
}

export type SavePickResult = { ok: true } | { ok: false; reason: SavePickRejection };

const refuse = (reason: SavePickRejection): SavePickResult => ({ ok: false, reason });
const isFranchiseId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

export function createSavePick(ports: PickemPorts) {
    return async function savePick(input: SavePickInput): Promise<SavePickResult> {
        if (!ports.launch) return refuse('not-open');
        const live = await loadLivePickem(ports, input.now);
        if (!live) throw new Error("The live season is unavailable, so Pick'em cannot check the pairing.");
        const week = live.seasonYear === input.seasonYear ? live.weeks.find(item => item.week === input.week) : undefined;
        const closed = () => !week ? 'not-open' as const : isLocked(week, input.now) ? 'locked' as const : null;
        let start;
        try { start = await ports.ownerSession.ownerPreamble(PICKEM_ACTION, closed); }
        catch (error) {
            if (error instanceof TooManyAttemptsError) return refuse('rate-limited');
            throw error;
        }
        if (!start.ok) return start;
        if (!week) return refuse('not-open');

        const { matchup, picked } = input;
        if (!Array.isArray(matchup) || matchup.length !== 2 || !matchup.every(isFranchiseId)) return refuse('no-such-matchup');
        const pair = pairOf(matchup[0], matchup[1]);
        if (!week.matchups.some(item => samePair(pairOfMatchup(item), pair))) return refuse('no-such-matchup');
        if (picked !== null && !pair.includes(picked)) return refuse('not-in-matchup');

        const target = { seasonYear: live.seasonYear, week: week.week, entryFranchiseId: start.team.id, uid: start.actor.uid, matchup: pair, lock: week.lock };
        const [entry] = await rows<{ open: boolean }>(picked === null ? clearPickQuery(target) : savePickQuery(target, picked));
        if (!entry) return refuse('no-team');
        return entry.open ? { ok: true } : refuse('locked');
    };
}
