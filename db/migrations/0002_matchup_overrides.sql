CREATE TABLE "league"."matchup_overrides" (
	"season_year" integer NOT NULL,
	"round" smallint NOT NULL,
	"franchise_a" integer NOT NULL,
	"franchise_b" integer NOT NULL,
	"winner_franchise_id" integer,
	"bracket" text,
	"note" text,
	CONSTRAINT "matchup_overrides_season_year_round_franchise_a_franchise_b_pk" PRIMARY KEY("season_year","round","franchise_a","franchise_b")
);
--> statement-breakpoint
ALTER TABLE "league"."matchup_overrides" ADD CONSTRAINT "matchup_overrides_season_year_seasons_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."seasons"("year") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."matchup_overrides" ADD CONSTRAINT "matchup_overrides_franchise_a_franchises_id_fk" FOREIGN KEY ("franchise_a") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."matchup_overrides" ADD CONSTRAINT "matchup_overrides_franchise_b_franchises_id_fk" FOREIGN KEY ("franchise_b") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."matchup_overrides" ADD CONSTRAINT "matchup_overrides_winner_franchise_id_franchises_id_fk" FOREIGN KEY ("winner_franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;