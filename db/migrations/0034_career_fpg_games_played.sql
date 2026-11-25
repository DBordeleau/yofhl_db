ALTER TABLE "league"."player_seasons" ADD COLUMN "games_played" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "league"."player_seasons" ADD CONSTRAINT "player_seasons_games_played" CHECK ("league"."player_seasons"."games_played" >= 0);--> statement-breakpoint
-- Careers count every season with games played (GLOSSARY.md), FPts of any sign included: career FPts is their sum,
-- career FP/G is career FPts ÷ their games played, and seasons, first and last season, positions and all-time
-- rank all use the same seasons. Until each season is reimported (and the season sync has run for the season being
-- played), its player seasons have no games played and count toward nothing. See docs/adr/0010.
DROP MATERIALIZED VIEW "league"."player_careers";--> statement-breakpoint
CREATE MATERIALIZED VIEW "league"."player_careers" AS
WITH played AS (
    SELECT * FROM league.player_seasons WHERE games_played > 0
),
careers AS (
    SELECT player_id,
           sum(fpts) AS total_fpts,
           round(sum(fpts) / sum(games_played), 2) AS fpg,
           count(*)::int AS seasons,
           min(season_year) AS first_season,
           max(season_year) AS last_season
    FROM played
    GROUP BY player_id
),
player_positions AS (
    SELECT player_id,
           array_agg(pos ORDER BY array_position(ARRAY['C', 'LW', 'RW', 'D', 'G'], pos)) AS positions
    FROM (SELECT DISTINCT played.player_id, p.pos FROM played, unnest(played.positions) AS p(pos)) d
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
       careers.total_fpts,
       careers.fpg,
       careers.seasons,
       careers.first_season,
       careers.last_season,
       coalesce(player_positions.positions, '{}') AS positions,
       coalesce(rings.championships, 0) AS championships,
       coalesce(trophies.awards, 0) AS awards,
       (rank() OVER (ORDER BY careers.total_fpts DESC))::int AS all_time_rank,
       latest_team.team_season_id AS latest_team_season_id
FROM league.players p
JOIN careers ON careers.player_id = p.id
LEFT JOIN player_positions ON player_positions.player_id = p.id
LEFT JOIN rings ON rings.player_id = p.id
LEFT JOIN trophies ON trophies.player_id = p.id
LEFT JOIN latest_team ON latest_team.player_id = p.id;
--> statement-breakpoint
CREATE UNIQUE INDEX "player_careers_player" ON "league"."player_careers" ("player_id");
--> statement-breakpoint
CREATE INDEX "player_careers_rank" ON "league"."player_careers" ("all_time_rank");
