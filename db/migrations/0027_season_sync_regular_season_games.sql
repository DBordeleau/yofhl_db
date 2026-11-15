CREATE TABLE "league"."weeks" (
	"season_year" integer NOT NULL,
	"week" smallint NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "weeks_season_year_week_pk" PRIMARY KEY("season_year","week")
);
--> statement-breakpoint
ALTER TABLE "league"."season_sync_status" ADD COLUMN "changed_regular_season_games" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "league"."season_sync_status" ADD COLUMN "changed_weeks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "league"."weeks" ADD CONSTRAINT "weeks_season_year_seasons_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."seasons"("year") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."matchups" ADD CONSTRAINT "matchups_one_game_per_pairing" UNIQUE("season_year","stage","round","away_team_season_id","home_team_season_id");