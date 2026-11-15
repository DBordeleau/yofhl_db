// Moving the ballot lock: the admin giving owners more time while voting is open. The new ballot lock must be later
// than the current one, and the current one must not have passed by the database clock: once it has, ballots have
// stopped changing, and letting owners back in is reopening (after scoring). Refused for a rehearsal (rehearsal.ts).
import { sql } from 'drizzle-orm';
import type { AwardVoteState } from './model';
import { ballotLockTime } from './open-voting';
import type { AwardVotePorts } from './ports';
import { rehearsalRefusal, type RehearsalRefusal } from './rehearsal';

export interface MoveBallotLockInput {
    seasonYear: number;
    /** the new ballot lock, as an ISO 8601 time */
    ballotLock: string;
}

export type MoveBallotLockRejection = RehearsalRefusal
    | 'not-open'
    /** the ballot lock has passed */
    | 'locked'
    /** the new ballot lock is not later than the current one */
    | 'not-later'
    | 'invalid-lock';

export type MoveBallotLockResult = { ok: true } | { ok: false; reason: MoveBallotLockRejection };

export function createMoveBallotLock({ db }: AwardVotePorts) {
    async function refusal(seasonYear: number, ballotLock: string): Promise<MoveBallotLockRejection | null> {
        const [vote] = await db.rows<{ state: AwardVoteState; locked: boolean; later: boolean }>(sql`
            select state, clock_timestamp() >= ballot_lock as locked, ${ballotLock}::timestamptz > ballot_lock as later
            from league.award_votes where season_year = ${seasonYear}`);
        if (!vote || vote.state !== 'open') return 'not-open';
        if (vote.locked) return 'locked';
        return vote.later ? null : 'not-later';
    }

    return async function moveBallotLock(input: MoveBallotLockInput): Promise<MoveBallotLockResult> {
        const { seasonYear } = input;
        const rehearsal = await rehearsalRefusal(db, seasonYear);
        if (rehearsal) return { ok: false, reason: rehearsal };
        const ballotLock = ballotLockTime(input.ballotLock);
        if (!ballotLock) return { ok: false, reason: 'invalid-lock' };
        const refused = await refusal(seasonYear, ballotLock);
        if (refused) return { ok: false, reason: refused };

        const moved = await db.rows(sql`
            update league.award_votes set ballot_lock = ${ballotLock}::timestamptz, updated_at = now()
            where season_year = ${seasonYear} and state = 'open' and not rehearsal
                and clock_timestamp() < ballot_lock and ${ballotLock}::timestamptz > ballot_lock
            returning 1`);
        if (moved.length) return { ok: true };
        return { ok: false, reason: (await refusal(seasonYear, ballotLock)) ?? 'not-open' };
    };
}
