-- Fantrax names a season by the year it starts in; past the adapter every season is
-- stored by its season year, the year it ends in (GLOSSARY.md). 2026 here is the 2026–27 season.
UPDATE "league"."fantrax_final_weeks" SET "season_year" = 2027 WHERE "season_year" = 2026;
--> statement-breakpoint
UPDATE "league"."fantrax_snapshots" SET "data" = jsonb_set("data", '{source,info,seasonYear}', '2027'::jsonb)
WHERE "data" #>> '{source,info,seasonYear}' = '2026';
