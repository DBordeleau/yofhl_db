// The header's nudge to cast a ballot: for a franchise taking part (voting-franchises.ts) with no submitted ballot
// while an award vote is open (never a rehearsal) and its ballot lock has not passed by the database clock. The owner session's header answer reads it,
// so it imports nothing that leads back to the owner session.
import { sql } from 'drizzle-orm';
import { isoTime } from './iso-time';
import type { AwardVoteDatabase } from './ports';
import { votingFranchise } from './voting-franchises';

export interface ReadBallotNudgeInput {
    /** the active franchise the signed-in owner manages */
    franchiseId: number;
}

/** the award vote a franchise has yet to submit a ballot in */
export interface BallotNudge {
    seasonYear: number;
    ballotLock: string;
}

export function createReadBallotNudge({ db }: { db: AwardVoteDatabase }) {
    return async function readBallotNudge({ franchiseId }: ReadBallotNudgeInput): Promise<BallotNudge | null> {
        const [vote] = await db.rows<BallotNudge>(sql`
            select v.season_year as "seasonYear", ${isoTime(sql`v.ballot_lock`)} as "ballotLock"
            from league.award_votes v
            where v.state = 'open' and not v.rehearsal and clock_timestamp() < v.ballot_lock
              and ${votingFranchise(sql`${franchiseId}::int`, sql`v.season_year`)}
              and not exists (select 1 from league.award_vote_ballots b
                              where b.season_year = v.season_year and b.franchise_id = ${franchiseId}::int and b.submitted is not null)
            order by v.season_year desc limit 1`);
        return vote ?? null;
    };
}
