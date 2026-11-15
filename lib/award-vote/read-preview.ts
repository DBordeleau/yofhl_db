// A season's award vote as the admin sees it: whether the season may have one (or only a rehearsal), its state,
// whether preparing has finished, the ballot lock once open, and once preparing has finished, the ballot exactly as
// owners will see it, read only from the frozen snapshot. Admin only: it returns rehearsals.
import { sql } from 'drizzle-orm';
import { readBallotAwards } from './ballot-snapshot';
import { readBallotStatus, type BallotStatus } from './ballot-status';
import type { AwardVoteState, BallotAward, PrepareProgress } from './model';
import type { AwardVotePorts } from './ports';
import { awardVoteKind, type AwardVoteKind } from './rehearsal';

export interface ReadPreviewInput {
    seasonYear: number;
}

export interface AwardVoteSummary {
    seasonYear: number;
    state: AwardVoteState;
    rehearsal: boolean;
    /** when the latest prepare started */
    prepareStartedAt: string;
    /** when the latest prepare finished, or null while it is unfinished */
    preparedAt: string | null;
    /** the ballot lock, or null before opening */
    ballotLock: string | null;
    /** when voting opened, or null before opening */
    openedAt: string | null;
}

export interface AwardVotePreview {
    /** whether the season may have a live award vote or only a rehearsal, or null for neither (and no panel) */
    kind: AwardVoteKind | null;
    /** null for a season never prepared */
    vote: AwardVoteSummary | null;
    /** the ballot's awards in order, or null until a prepare has finished */
    ballot: BallotAward[] | null;
    /** which franchises have submitted a ballot, without their rankings; null before voting opens */
    ballotStatus: BallotStatus[] | null;
}

const isoOrNull = (ms: number | null) => ms === null ? null : new Date(ms).toISOString();

export function createReadPreview({ db }: AwardVotePorts) {
    return async function readPreview({ seasonYear }: ReadPreviewInput): Promise<AwardVotePreview> {
        const [vote] = await db.rows<{
            state: AwardVoteState; rehearsal: boolean; progress: PrepareProgress; preparedAt: number | null; ballotLock: number | null; openedAt: number | null;
        }>(sql`
            select state, rehearsal, prepare_progress as progress, (extract(epoch from prepared_at) * 1000)::float8 as "preparedAt",
                   (extract(epoch from ballot_lock) * 1000)::float8 as "ballotLock", (extract(epoch from opened_at) * 1000)::float8 as "openedAt"
            from league.award_votes where season_year = ${seasonYear}`);
        const kind = await awardVoteKind(db, seasonYear);
        if (!vote) return { kind, vote: null, ballot: null, ballotStatus: null };
        const summary: AwardVoteSummary = {
            seasonYear, state: vote.state, rehearsal: vote.rehearsal, prepareStartedAt: vote.progress.startedAt,
            preparedAt: isoOrNull(vote.preparedAt), ballotLock: isoOrNull(vote.ballotLock), openedAt: isoOrNull(vote.openedAt),
        };
        if (summary.preparedAt === null) return { kind, vote: summary, ballot: null, ballotStatus: null };
        return {
            kind, vote: summary, ballot: await readBallotAwards(db, seasonYear),
            ballotStatus: vote.state === 'prepared' ? null : await readBallotStatus(db, seasonYear),
        };
    };
}
