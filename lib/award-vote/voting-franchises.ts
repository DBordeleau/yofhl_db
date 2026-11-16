// Which franchises take part in a season's award vote: those that played the season (have a team season for it)
// and had not folded by its award vote. Who may cast a ballot, who must submit before scoring is allowed early, who
// the submission status and the header nudge cover, and who the public ballots page lists all use this one rule.
//
// "Not folded by the vote" is `folded_after_season` unset or after the vote's season. While a live award vote runs
// that is the same as the franchise being active (no franchise has played a later season yet); it also keeps a
// franchise that folds in a later season on the published ballots page for good.
import { sql, type SQL } from 'drizzle-orm';

/** whether the franchise `franchiseId` (an SQL expression) takes part in `seasonYear`'s award vote */
export function votingFranchise(franchiseId: SQL, seasonYear: number | SQL): SQL {
    const year = typeof seasonYear === 'number' ? sql`${seasonYear}::int` : seasonYear;
    return sql`exists (
        select 1 from league.franchises vf
        join league.team_seasons vt on vt.franchise_id = vf.id and vt.season_year = ${year}
        where vf.id = ${franchiseId} and (vf.folded_after_season is null or vf.folded_after_season > ${year}))`;
}
