// GM of the Year's candidates and their summaries (GLOSSARY.md, "GM of the Year"), captured from the archive when a
// prepare writes its candidates: every team season taking part in the vote (voting-franchises.ts), each with its
// record, FPts for and playoff finish beside the franchise's season before. Rosters are frozen from the Final to the
// draft, so there are no offseason moves to summarise.
//
// A playoff finish comes from the championship bracket: the champion and runner-up from the season's result, and
// otherwise the furthest round the team season played in, counted back from the Final. Consolation games don't count.
import { sql, type SQL } from 'drizzle-orm';
import { votingFranchise } from './voting-franchises';

/** the PlayoffFinish of team season `t` (an alias of league.team_seasons) */
function playoffFinish(t: SQL): SQL {
    return sql`(select case
            when ${t}.id = r.champion_team_season_id then 'champion'
            when ${t}.id = r.runner_up_team_season_id then 'finalist'
            when reached.round is null then 'missed'
            when reached.round = reached.final_round then 'finalist'
            when reached.round = reached.final_round - 1 then 'semifinalist'
            else 'quarterfinalist' end
        from (select 1) one
        left join league.season_results r on r.season_year = ${t}.season_year
        cross join lateral (
            select max(m.round) filter (where ${t}.id in (m.away_team_season_id, m.home_team_season_id)) as round, max(m.round) as final_round
            from league.matchups m
            where m.season_year = ${t}.season_year and m.stage = 'playoff' and m.bracket = 'championship'
        ) reached)`;
}

/** team season `t`'s TeamSeasonLine as jsonb */
const seasonLine = (t: SQL) => sql`jsonb_build_object('wins', ${t}.wins, 'losses', ${t}.losses, 'ties', ${t}.ties,
    'fptsFor', ${t}.fpts_for, 'playoffFinish', ${playoffFinish(t)})`;

/** the team seasons taking part in `seasonYear`'s award vote */
const takingPart = (seasonYear: number) => sql`select t.id from league.team_seasons t
    where t.season_year = ${seasonYear}::int and ${votingFranchise(sql`t.franchise_id`, seasonYear)}`;

/**
 * The writes (CTE bodies, run when `claim` returns a row) of `seasonYear`'s GM of the Year candidates and their
 * summaries, replacing any a rerun of the candidates step (a rookie change, a retried lookup) finds: those taking part
 * are upserted and the rest deleted, so the two touch disjoint rows (docs/adr/0002).
 */
export function writeTeamSeasons(seasonYear: number): SQL[] {
    return [
        sql`insert into league.award_vote_team_seasons (season_year, team_season_id, franchise_id, summary)
            select ${seasonYear}::int, t.id, t.franchise_id,
                   jsonb_build_object('season', ${seasonLine(sql`t`)}, 'previous', case when p.id is null then null else ${seasonLine(sql`p`)} end)
            from league.team_seasons t
            left join league.team_seasons p on p.franchise_id = t.franchise_id and p.season_year = t.season_year - 1
            where t.id in (${takingPart(seasonYear)}) and exists (select 1 from claim)
            on conflict (season_year, team_season_id) do update set franchise_id = excluded.franchise_id, summary = excluded.summary`,
        sql`delete from league.award_vote_team_seasons c
            where c.season_year = ${seasonYear}::int and c.team_season_id not in (${takingPart(seasonYear)}) and exists (select 1 from claim)`,
    ];
}
