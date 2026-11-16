// Moving the ballot lock: the admin giving owners more time while voting is open, even once the current ballot lock
// has passed ("locked" is never stored: it is open with the lock past). The new ballot lock must be later than the
// current one and still ahead by the database clock. After scoring, letting owners back in is reopening. Refused for a
// rehearsal (rehearsal.ts).
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
    /** the new ballot lock is not later than the current one */
    | 'not-later'
    /** the new ballot lock is not ahead by the database clock */
    | 'lock-passed'
    | 'invalid-lock';

export type MoveBallotLockResult = { ok: true } | { ok: false; reason: MoveBallotLockRejection };

export function createMoveBallotLock({ db }: AwardVotePorts) {
    async function refusal(seasonYear: number, ballotLock: string): Promise<MoveBallotLockRejection | null> {
        const [vote] = await db.rows<{ state: AwardVoteState; later: boolean; ahead: boolean }>(sql`
            select state, ${ballotLock}::timestamptz > ballot_lock as later, ${ballotLock}::timestamptz > clock_timestamp() as ahead
            from league.award_votes where season_year = ${seasonYear}`);
        if (!vote || vote.state !== 'open') return 'not-open';
        if (!vote.later) return 'not-later';
        return vote.ahead ? null : 'lock-passed';
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
                and ${ballotLock}::timestamptz > ballot_lock and ${ballotLock}::timestamptz > clock_timestamp()
            returning 1`);
        if (moved.length) return { ok: true };
        return { ok: false, reason: (await refusal(seasonYear, ballotLock)) ?? 'not-open' };
    };
}
