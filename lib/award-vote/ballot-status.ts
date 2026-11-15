// Which franchises have submitted a ballot in a season's award vote: every active franchise, as it is named now,
// with its owner's name and whether its ballot is submitted. It says nothing about any ranking, so every signed-in
// owner and the admin may read it; its callers check who asks.
import { sql } from 'drizzle-orm';
import type { AwardVoteDatabase } from './ports';

export interface BallotStatus {
    franchise: { id: number; name: string; abbreviation: string; logo: string | null };
    /** the owner's name the site shows for the franchise, or null when it has none */
    owner: string | null;
    submitted: boolean;
}

export async function readBallotStatus(db: AwardVoteDatabase, seasonYear: number): Promise<BallotStatus[]> {
    const found = await db.rows<BallotStatus['franchise'] & { owner: string | null; submitted: boolean }>(sql`
        select c.id, c.name, c.abbreviation, c.logo, o.name as owner,
               exists (select 1 from league.award_vote_ballots b
                       where b.season_year = ${seasonYear} and b.franchise_id = c.id and b.submitted is not null) as submitted
        from league.current_teams c
        left join league.team_seasons t on t.id = c.latest_team_season_id
        left join league.owners o on o.id = t.owner_id
        where not c.defunct
        order by c.name, c.id`);
    return found.map(({ owner, submitted, ...franchise }) => ({ franchise, owner, submitted }));
}
