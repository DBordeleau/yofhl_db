// The ballot as a signed-in owner reads it: the season's open award vote (never a prepared one, never a rehearsal),
// its ballot lock and whether it has passed, every award with candidates and its candidate lists from the frozen
// snapshot, the owner's own franchise's ballot (and no other's), and which franchises have submitted. Never cached.
import { sql } from 'drizzle-orm';
import { shareCandidateLists, type OwnerBallotAward } from './ballot';
import { readBallotAwards } from './ballot-snapshot';
import { readBallotStatus, type BallotStatus } from './ballot-status';
import type { BallotRankings, PlayerCandidate } from './model';
import { isoTime } from './iso-time';
import type { AwardVotePorts } from './ports';

export interface ReadOwnerBallotInput {
    /** the season, or the latest season with voting open */
    seasonYear?: number;
}

/** the owner's own franchise's ballot */
export interface OwnBallot {
    /** the working copy, each award's ranks filled out to its depth; empty before the first save */
    draft: BallotRankings;
    /** the ballot as last submitted, or null when it never was */
    submitted: BallotRankings | null;
    submittedAt: string | null;
}

export type OwnerBallotView =
    | { status: 'signed-out' }
    /** no award vote is open (for the season asked about) */
    | { status: 'no-vote' }
    | {
        status: 'ballot';
        seasonYear: number;
        ballotLock: string;
        /** whether the ballot lock has passed, by the database clock */
        locked: boolean;
        /** the awards the ballot ranks, in ballot order */
        awards: OwnerBallotAward[];
        /** each award's candidates, at its `list`; awards with the same candidates share one */
        lists: PlayerCandidate[][];
        /** the active franchise the owner manages, or null for none */
        team: { franchiseId: number; name: string; abbreviation: string; logo: string | null } | null;
        /** the franchise's ballot, or null without a franchise */
        ballot: OwnBallot | null;
        ballotStatus: BallotStatus[];
    };

export function createReadOwnerBallot({ db, ownerSession }: AwardVotePorts) {
    return async function readOwnerBallot({ seasonYear }: ReadOwnerBallotInput): Promise<OwnerBallotView> {
        const signedIn = await ownerSession.currentOwnerTeam();
        if (!signedIn) return { status: 'signed-out' };
        const [vote] = await db.rows<{ seasonYear: number; ballotLock: string; locked: boolean }>(sql`
            select season_year as "seasonYear", ${isoTime(sql`ballot_lock`)} as "ballotLock",
                   clock_timestamp() >= ballot_lock as locked
            from league.award_votes
            where state = 'open' and not rehearsal ${seasonYear === undefined ? sql`` : sql`and season_year = ${seasonYear}`}
            order by season_year desc limit 1`);
        if (!vote) return { status: 'no-vote' };

        const { team } = signedIn;
        const [own] = team ? await db.rows<OwnBallot>(sql`
            select draft, submitted, ${isoTime(sql`submitted_at`)} as "submittedAt"
            from league.award_vote_ballots where season_year = ${vote.seasonYear} and franchise_id = ${team.id}`) : [];
        return {
            status: 'ballot',
            seasonYear: vote.seasonYear,
            ballotLock: vote.ballotLock,
            locked: vote.locked,
            ...shareCandidateLists(await readBallotAwards(db, vote.seasonYear)),
            team: team && { franchiseId: team.id, name: team.name, abbreviation: team.abbreviation, logo: team.logo },
            ballot: team && {
                draft: own?.draft ?? {},
                submitted: own?.submitted ?? null,
                submittedAt: own?.submittedAt ?? null,
            },
            ballotStatus: await readBallotStatus(db, vote.seasonYear),
        };
    };
}
