CREATE TABLE "league"."season_sync_status" (
	"season_year" integer PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"changed_player_seasons" integer DEFAULT 0 NOT NULL,
	"changed_team_seasons" integer DEFAULT 0 NOT NULL,
	"changed_playoff_games" integer DEFAULT 0 NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"frozen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "league"."season_sync_status" ADD CONSTRAINT "season_sync_status_season_year_seasons_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."seasons"("year") ON DELETE no action ON UPDATE no action;