-- Player IDs are stored bare (02b81), not the way Fantrax's CSVs wrap them (*02b81*): see
-- docs/adr/0006-player-ids-are-stored-bare.md. Every player and every reference to one is rewritten here.
-- If two players would end up with the same ID, the migration stops before changing anything.
DO $$
DECLARE collisions text;
BEGIN
    SELECT string_agg(ids, '; ') INTO collisions FROM (
        SELECT string_agg(id, ' and ' ORDER BY position('*' in id) = 0, id) AS ids
        FROM league.players GROUP BY replace(id, '*', '') HAVING count(*) > 1
    ) collided;
    IF collisions IS NOT NULL THEN
        RAISE EXCEPTION 'Player IDs that are the same once their asterisks are stripped: %. Nothing was changed; decide by hand which player each one is.', collisions;
    END IF;
END $$;
--> statement-breakpoint
INSERT INTO "league"."players" ("id", "name") SELECT replace("id", '*', ''), "name" FROM "league"."players" WHERE "id" LIKE '%*%';--> statement-breakpoint
UPDATE "league"."player_seasons" SET "player_id" = replace("player_id", '*', '') WHERE "player_id" LIKE '%*%';--> statement-breakpoint
UPDATE "league"."awards" SET "player_id" = replace("player_id", '*', '') WHERE "player_id" LIKE '%*%';--> statement-breakpoint
UPDATE "league"."championship_rosters" SET "player_id" = replace("player_id", '*', '') WHERE "player_id" LIKE '%*%';--> statement-breakpoint
UPDATE "league"."draft_picks" SET "player_id" = replace("player_id", '*', '') WHERE "player_id" LIKE '%*%';--> statement-breakpoint
UPDATE "league"."transaction_assets" SET "player_id" = replace("player_id", '*', '') WHERE "player_id" LIKE '%*%';--> statement-breakpoint
DELETE FROM "league"."players" WHERE "id" LIKE '%*%';--> statement-breakpoint
ALTER TABLE "league"."players" ADD CONSTRAINT "players_id_bare" CHECK (position('*' in "league"."players"."id") = 0);--> statement-breakpoint
REFRESH MATERIALIZED VIEW "league"."season_results";--> statement-breakpoint
REFRESH MATERIALIZED VIEW "league"."player_careers";--> statement-breakpoint
REFRESH MATERIALIZED VIEW "league"."franchise_records";
