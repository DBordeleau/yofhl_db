// A season's award vote as the admin sees it: whether the season may have one (or only a rehearsal), its state,
// whether preparing has finished, the ballot lock once open, and once preparing has finished, the ballot exactly as
// owners will see it, read only from the frozen snapshot, and which ballots are void and why (never their rankings,
// so the admin can restore one before a reopened vote's new ballot lock). Admin only: it returns rehearsals.
import { sql } from 'drizzle-orm';
import { readBallotAwards, readTeamBallotAward } from './ballot-snapshot';
import { readBallotStatus, type BallotStatus } from './ballot-status';
import type { AwardVoteState, BallotAward, PrepareProgress, TeamBallotAward } from './model';
import { isoTime } from './iso-time';
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
    /** when the ballots were last scored, or null before scoring */
    scoredAt: string | null;
    /** when the winners were published, or null before publishing */
    publishedAt: string | null;
}

export interface AwardVotePreview {
    /** whether the season may have a live award vote or only a rehearsal, or null for neither (and no panel) */
    kind: AwardVoteKind | null;
    /** null for a season never prepared */
    vote: AwardVoteSummary | null;
    /** the ballot's individual awards in order, or null until a prepare has finished */
    ballot: BallotAward[] | null;
    /** GM of the Year, the ballot's last award, with every team season taking part; null until a prepare has finished */
    gmOfTheYear: TeamBallotAward | null;
    /** which franchises have submitted a ballot, without their rankings; null before voting opens */
    ballotStatus: BallotStatus[] | null;
    /** every void ballot's franchise and reason, without its rankings; null before voting opens */
    voidBallots: VoidBallot[] | null;
}

/** a void ballot, as the admin's summary names it */
export interface VoidBallot {
    franchise: BallotStatus['franchise'];
    voidReason: string;
}

export function createReadPreview({ db }: AwardVotePorts) {
    return async function readPreview({ seasonYear }: ReadPreviewInput): Promise<AwardVotePreview> {
        const [vote] = await db.rows<Omit<AwardVoteSummary, 'seasonYear' | 'prepareStartedAt'> & { progress: PrepareProgress }>(sql`
            select state, rehearsal, prepare_progress as progress, ${isoTime(sql`prepared_at`)} as "preparedAt",
                   ${isoTime(sql`ballot_lock`)} as "ballotLock", ${isoTime(sql`opened_at`)} as "openedAt",
                   ${isoTime(sql`scored_at`)} as "scoredAt", ${isoTime(sql`published_at`)} as "publishedAt"
            from league.award_votes where season_year = ${seasonYear}`);
        const kind = await awardVoteKind(db, seasonYear);
        if (!vote) return { kind, vote: null, ballot: null, gmOfTheYear: null, ballotStatus: null, voidBallots: null };
        const { progress, ...times } = vote;
        const summary: AwardVoteSummary = { seasonYear, prepareStartedAt: progress.startedAt, ...times };
        if (summary.preparedAt === null) return { kind, vote: summary, ballot: null, gmOfTheYear: null, ballotStatus: null, voidBallots: null };
        const opened = vote.state !== 'prepared';
        return {
            kind, vote: summary, ballot: await readBallotAwards(db, seasonYear), gmOfTheYear: await readTeamBallotAward(db, seasonYear),
            ballotStatus: opened ? await readBallotStatus(db, seasonYear) : null,
            voidBallots: opened ? await readVoidBallots(db, seasonYear) : null,
        };
    };
}

async function readVoidBallots(db: AwardVotePorts['db'], seasonYear: number): Promise<VoidBallot[]> {
    const found = await db.rows<BallotStatus['franchise'] & { voidReason: string }>(sql`
        select c.id, c.name, c.abbreviation, c.logo, b.void_reason as "voidReason"
        from league.award_vote_ballots b
        join league.current_teams c on c.id = b.franchise_id
        where b.season_year = ${seasonYear} and b.void_reason is not null
        order by c.name, c.id`);
    return found.map(({ voidReason, ...franchise }) => ({ franchise, voidReason }));
}
