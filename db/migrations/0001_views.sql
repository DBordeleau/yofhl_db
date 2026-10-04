-- Derived views. Refresh them (refreshViews in scripts/db/lib/connect.ts) after any import or curated edit.
-- season_results must refresh before franchise_records, which reads it.

-- one row per season: the winner and loser of the championship bracket's last game
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
) f ON true;
--> statement-breakpoint
CREATE UNIQUE INDEX "season_results_season" ON "league"."season_results" ("season_year");
--> statement-breakpoint

-- career totals and all-time rank, using the same rule as the leaderboard: seasons with FPts > 0
CREATE MATERIALIZED VIEW "league"."player_careers" AS
WITH scoring AS (
    SELECT player_id,
           sum(fpts) AS total_fpts,
           round(avg(fpg), 2) AS fpg,
           count(*)::int AS seasons,
           min(season_year) AS first_season,
           max(season_year) AS last_season
    FROM league.player_seasons
    WHERE fpts > 0
    GROUP BY player_id
),
player_positions AS (
    SELECT player_id,
           array_agg(pos ORDER BY array_position(ARRAY['C', 'LW', 'RW', 'D', 'G'], pos)) AS positions
    FROM (
        SELECT DISTINCT ps.player_id, p.pos
        FROM league.player_seasons ps, unnest(ps.positions) AS p(pos)
        WHERE ps.fpts > 0
    ) d
    GROUP BY player_id
),
rings AS (
    SELECT player_id, count(*)::int AS championships FROM league.championship_rosters GROUP BY player_id
),
trophies AS (
    SELECT player_id, count(*)::int AS awards FROM league.awards GROUP BY player_id
),
latest_team AS (
    SELECT DISTINCT ON (player_id) player_id, team_season_id
    FROM league.player_seasons
    WHERE team_season_id IS NOT NULL
    ORDER BY player_id, season_year DESC
)
SELECT p.id AS player_id,
       p.name,
       scoring.total_fpts,
       scoring.fpg,
       scoring.seasons,
       scoring.first_season,
       scoring.last_season,
       player_positions.positions,
       coalesce(rings.championships, 0) AS championships,
       coalesce(trophies.awards, 0) AS awards,
       (rank() OVER (ORDER BY scoring.total_fpts DESC))::int AS all_time_rank,
       latest_team.team_season_id AS latest_team_season_id
FROM league.players p
JOIN scoring ON scoring.player_id = p.id
JOIN player_positions ON player_positions.player_id = p.id
LEFT JOIN rings ON rings.player_id = p.id
LEFT JOIN trophies ON trophies.player_id = p.id
LEFT JOIN latest_team ON latest_team.player_id = p.id;
--> statement-breakpoint
CREATE UNIQUE INDEX "player_careers_player" ON "league"."player_careers" ("player_id");
--> statement-breakpoint
CREATE INDEX "player_careers_rank" ON "league"."player_careers" ("all_time_rank");
--> statement-breakpoint

-- all-time regular-season record plus championship and finals seasons per franchise
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
