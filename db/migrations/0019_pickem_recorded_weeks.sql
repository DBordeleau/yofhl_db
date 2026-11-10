CREATE TABLE "league"."pickem_pairings" (
	"season_year" integer NOT NULL,
	"week" integer NOT NULL,
	"position" smallint NOT NULL,
	"away_franchise_id" integer NOT NULL,
	"home_franchise_id" integer NOT NULL,
	"winner_franchise_id" integer,
	"frozen_at" timestamp with time zone,
	CONSTRAINT "pickem_pairings_season_year_week_position_pk" PRIMARY KEY("season_year","week","position"),
	CONSTRAINT "pickem_pairings_matchup" CHECK ("league"."pickem_pairings"."away_franchise_id" <> "league"."pickem_pairings"."home_franchise_id"),
	CONSTRAINT "pickem_pairings_result" CHECK ("league"."pickem_pairings"."winner_franchise_id" is null
        or ("league"."pickem_pairings"."frozen_at" is not null and "league"."pickem_pairings"."winner_franchise_id" in ("league"."pickem_pairings"."away_franchise_id", "league"."pickem_pairings"."home_franchise_id")))
);
--> statement-breakpoint
CREATE TABLE "league"."pickem_weeks" (
	"season_year" integer NOT NULL,
	"week" integer NOT NULL,
	"lock" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickem_weeks_season_year_week_pk" PRIMARY KEY("season_year","week")
);
--> statement-breakpoint
ALTER TABLE "league"."pickem_pairings" ADD CONSTRAINT "pickem_pairings_away_franchise_id_franchises_id_fk" FOREIGN KEY ("away_franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."pickem_pairings" ADD CONSTRAINT "pickem_pairings_home_franchise_id_franchises_id_fk" FOREIGN KEY ("home_franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."pickem_pairings" ADD CONSTRAINT "pickem_pairings_winner_franchise_id_franchises_id_fk" FOREIGN KEY ("winner_franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."pickem_pairings" ADD CONSTRAINT "pickem_pairings_season_year_week_pickem_weeks_season_year_week_fk" FOREIGN KEY ("season_year","week") REFERENCES "league"."pickem_weeks"("season_year","week") ON DELETE no action ON UPDATE no action;