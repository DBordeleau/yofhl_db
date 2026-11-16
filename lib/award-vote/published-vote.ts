// What the public sees of award votes: only a published one, never a rehearsal. Shared by the public reads here and
// the site's award lists (lib/data/league.ts, lib/data/history.ts), so the rule is written once.
import { sql } from 'drizzle-orm';

/** the award vote `v` is published and not a rehearsal: the only award votes the public reads see */
export const publishedVote = sql`v.state = 'published' and not v.rehearsal`;

/**
 * a subquery of every team award an award vote has decided: `(award, season_year, team_season_id)` for each team
 * season at place 1 of a published vote's tally (co-winners each a row)
 */
export const publishedTeamAwardWinners = sql`(select tally.award, tally.season_year, tally.team_season_id
    from league.award_vote_team_tallies tally
    join league.award_votes v on v.season_year = tally.season_year
    where tally.place = 1 and ${publishedVote})`;
