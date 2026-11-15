ALTER TABLE "league"."player_seasons" ADD COLUMN "goals" integer;--> statement-breakpoint
ALTER TABLE "league"."player_seasons" ADD COLUMN "assists" integer;--> statement-breakpoint
ALTER TABLE "league"."player_seasons" ADD COLUMN "shots" integer;--> statement-breakpoint
ALTER TABLE "league"."player_seasons" ADD COLUMN "hits" integer;--> statement-breakpoint
ALTER TABLE "league"."player_seasons" ADD COLUMN "blocks" integer;--> statement-breakpoint
ALTER TABLE "league"."season_sync_status" ADD COLUMN "changed_skater_categories" integer DEFAULT 0 NOT NULL;