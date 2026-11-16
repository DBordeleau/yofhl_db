// Opening voting: the admin turning a season's prepared award vote into an open one with its ballot lock, which
// owners then cast ballots until. It needs a finished prepare and a ballot lock still ahead by the database clock.
// Opening freezes the snapshot: prepare, rookie changes and retrying lookups all require the vote to be prepared.
// Refused for a rehearsal (rehearsal.ts).
import { sql } from 'drizzle-orm';
import { changeBallotLock, type BallotLockChangeResult } from './ballot-lock';
import type { AwardVoteState } from './model';
import type { AwardVotePorts } from './ports';
import type { RehearsalRefusal } from './rehearsal';

export interface OpenVotingInput {
    seasonYear: number;
    /** the ballot lock, as an ISO 8601 time */
    ballotLock: string;
}

export type OpenVotingRejection = RehearsalRefusal
    /** no finished prepare, or voting has already opened */
    | 'not-prepared'
    | 'lock-passed'
    | 'invalid-lock';

export type OpenVotingResult = BallotLockChangeResult<OpenVotingRejection>;

export function createOpenVoting({ db }: AwardVotePorts) {
    /** why opening `seasonYear` with `ballotLock` is refused now, or null when it isn't */
    async function refusal(seasonYear: number, ballotLock: string): Promise<OpenVotingRejection | null> {
        const [vote] = await db.rows<{ state: AwardVoteState; finished: boolean; ahead: boolean }>(sql`
            select state, prepared_at is not null as finished, ${ballotLock}::timestamptz > clock_timestamp() as ahead
            from league.award_votes where season_year = ${seasonYear}`);
        if (!vote || vote.state !== 'prepared' || !vote.finished) return 'not-prepared';
        return vote.ahead ? null : 'lock-passed';
    }

    return async function openVoting(input: OpenVotingInput): Promise<OpenVotingResult> {
        return changeBallotLock(db, input, {
            refusal,
            write: (seasonYear, ballotLock) => sql`
                update league.award_votes
                set state = 'open', ballot_lock = ${ballotLock}::timestamptz, opened_at = clock_timestamp(), updated_at = now()
                where season_year = ${seasonYear} and state = 'prepared' and not rehearsal and prepared_at is not null
                    and ${ballotLock}::timestamptz > clock_timestamp()
                returning 1`,
            fallback: 'not-prepared',
        });
    };
}
