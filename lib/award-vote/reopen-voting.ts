// Reopening: the admin letting owners back in after scoring, with a new ballot lock still ahead by the database
// clock. The vote returns to open; every draft and submitted ballot stays as it was and editable until the new ballot
// lock, and the tallies stay stored, unread, until scoring again replaces them. The snapshot stays frozen (prepare,
// rookie changes and retrying lookups all require prepared). Refused for a rehearsal (rehearsal.ts).
import { sql } from 'drizzle-orm';
import { changeBallotLock, type BallotLockChangeResult } from './ballot-lock';
import type { AwardVoteState } from './model';
import type { AwardVotePorts } from './ports';
import type { RehearsalRefusal } from './rehearsal';

export interface ReopenVotingInput {
    seasonYear: number;
    /** the new ballot lock, as an ISO 8601 time */
    ballotLock: string;
}

export type ReopenVotingRejection = RehearsalRefusal
    /** not scored: still open, published, or never opened */
    | 'not-scored'
    | 'lock-passed'
    | 'invalid-lock';

export type ReopenVotingResult = BallotLockChangeResult<ReopenVotingRejection>;

export function createReopenVoting({ db }: AwardVotePorts) {
    async function refusal(seasonYear: number, ballotLock: string): Promise<ReopenVotingRejection | null> {
        const [vote] = await db.rows<{ state: AwardVoteState; ahead: boolean }>(sql`
            select state, ${ballotLock}::timestamptz > clock_timestamp() as ahead from league.award_votes where season_year = ${seasonYear}`);
        if (!vote || vote.state !== 'scored') return 'not-scored';
        return vote.ahead ? null : 'lock-passed';
    }

    return async function reopenVoting(input: ReopenVotingInput): Promise<ReopenVotingResult> {
        return changeBallotLock(db, input, {
            refusal,
            write: (seasonYear, ballotLock) => sql`
                update league.award_votes set state = 'open', ballot_lock = ${ballotLock}::timestamptz, updated_at = now()
                where season_year = ${seasonYear} and state = 'scored' and not rehearsal and ${ballotLock}::timestamptz > clock_timestamp()
                returning 1`,
            fallback: 'not-scored',
        });
    };
}
