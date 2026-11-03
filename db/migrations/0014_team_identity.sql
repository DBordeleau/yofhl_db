-- Team identity (ADR 0001). Plain views: Postgres inlines them, so they store nothing,
-- need no refresh and show an owner's rename immediately.

-- one row per franchise per season: the name, abbreviation and logo of that team season
CREATE VIEW "league"."season_teams" AS
SELECT t.id AS team_season_id,
       t.franchise_id,
       t.season_year,
       t.name,
       t.abbreviation,
       coalesce(t.logo_url, f.logo_url) AS logo
FROM league.team_seasons t
JOIN league.franchises f ON f.id = t.franchise_id;
--> statement-breakpoint

-- one row per franchise: the owner's name and logo, then the latest team season's, then the franchise's own
CREATE VIEW "league"."current_teams" AS
SELECT f.id,
       coalesce(m.name, t.name, f.display_name) AS name,
       coalesce(t.abbreviation, left(coalesce(m.name, t.name, f.display_name), 3)) AS abbreviation,
       coalesce(m.logo_url, t.logo_url, f.logo_url) AS logo,
       f.folded_after_season IS NOT NULL AS defunct,
       t.id AS latest_team_season_id
FROM league.franchises f
LEFT JOIN league.team_management m ON m.franchise_id = f.id
LEFT JOIN LATERAL (
    SELECT ts.id, ts.name, ts.abbreviation, ts.logo_url
    FROM league.team_seasons ts
    WHERE ts.franchise_id = f.id
    ORDER BY ts.season_year DESC
    LIMIT 1
) t ON true;
