-- A season's champion is the winner of its Final: the championship bracket's last round, when that round is a
-- single game. The season sync stores each playoff round as it is played, so a season whose last stored round
-- still has two games (the Quarterfinals or Semifinals) has no champion or runner-up yet and stays unpublished.
-- Every imported season ends in a one-game Final, so its result is unchanged. franchise_records reads
-- season_results, so it is dropped and recreated as it was (0001_views.sql).
DROP MATERIALIZED VIEW "league"."franchise_records";
--> statement-breakpoint
DROP MATERIALIZED VIEW "league"."season_results";
--> statement-breakpoint
CREATE MATERIALIZED VIEW "league"."season_results" AS
SELECT s.year AS season_year,
       f.winner_team_season_id AS champion_team_season_id,
       CASE
           WHEN f.winner_team_season_id IS NULL THEN NULL
           WHEN f.winner_team_season_id = f.home_team_season_id THEN f.away_team_season_id
           ELSE f.home_team_season_id
       END AS runner_up_team_season_id,
       f.id AS final_matchup_id
FROM league.seasons s
LEFT JOIN LATERAL (
    SELECT m.*
    FROM league.matchups m
    WHERE m.season_year = s.year AND m.stage = 'playoff' AND m.bracket = 'championship'
    ORDER BY m.round DESC, m.slot
    LIMIT 1
) f ON (
    SELECT count(*) FROM league.matchups o
    WHERE o.season_year = s.year AND o.stage = 'playoff' AND o.bracket = 'championship' AND o.round = f.round
) = 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "season_results_season" ON "league"."season_results" ("season_year");
--> statement-breakpoint
CREATE MATERIALIZED VIEW "league"."franchise_records" AS
SELECT f.id AS franchise_id,
       count(ts.id)::int AS seasons,
       coalesce(sum(ts.wins), 0)::int AS wins,
       coalesce(sum(ts.losses), 0)::int AS losses,
       coalesce(sum(ts.ties), 0)::int AS ties,
       coalesce(sum(ts.fpts_for), 0) AS fpts_for,
       coalesce(sum(ts.fpts_against), 0) AS fpts_against,
       coalesce(array_agg(ts.season_year ORDER BY ts.season_year)
                FILTER (WHERE ts.id = sr.champion_team_season_id), '{}') AS championships,
       coalesce(array_agg(ts.season_year ORDER BY ts.season_year)
                FILTER (WHERE ts.id IN (sr.champion_team_season_id, sr.runner_up_team_season_id)), '{}') AS finals
FROM league.franchises f
LEFT JOIN league.team_seasons ts ON ts.franchise_id = f.id
LEFT JOIN league.season_results sr ON sr.season_year = ts.season_year
GROUP BY f.id;
--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_records_franchise" ON "league"."franchise_records" ("franchise_id");
