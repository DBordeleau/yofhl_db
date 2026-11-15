// Opening voting: the admin turning a season's prepared award vote into an open one with its ballot lock, which
// owners then cast ballots until. It needs a finished prepare and a ballot lock still ahead by the database clock.
// Opening freezes the snapshot: prepare, rookie changes and retrying lookups all require the vote to be prepared.
// Refused for a rehearsal (rehearsal.ts).
import { sql } from 'drizzle-orm';
import type { AwardVoteState } from './model';
import type { AwardVotePorts } from './ports';
import { rehearsalRefusal, type RehearsalRefusal } from './rehearsal';

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

export type OpenVotingResult = { ok: true } | { ok: false; reason: OpenVotingRejection };

/** a ballot lock as an ISO time, or null when `value` isn't a time */
export function ballotLockTime(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 40) return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
}

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
        const { seasonYear } = input;
        const rehearsal = await rehearsalRefusal(db, seasonYear);
        if (rehearsal) return { ok: false, reason: rehearsal };
        const ballotLock = ballotLockTime(input.ballotLock);
        if (!ballotLock) return { ok: false, reason: 'invalid-lock' };
        const refused = await refusal(seasonYear, ballotLock);
        if (refused) return { ok: false, reason: refused };

        const opened = await db.rows(sql`
            update league.award_votes
            set state = 'open', ballot_lock = ${ballotLock}::timestamptz, opened_at = clock_timestamp(), updated_at = now()
            where season_year = ${seasonYear} and state = 'prepared' and not rehearsal and prepared_at is not null
                and ${ballotLock}::timestamptz > clock_timestamp()
            returning 1`);
        if (opened.length) return { ok: true };
        // something changed since the check: say what
        return { ok: false, reason: (await refusal(seasonYear, ballotLock)) ?? 'not-prepared' };
    };
}
