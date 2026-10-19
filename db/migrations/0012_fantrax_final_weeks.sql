CREATE TABLE "league"."fantrax_final_weeks" (
	"league_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"period" integer NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fantrax_final_weeks_league_id_season_year_period_pk" PRIMARY KEY("league_id","season_year","period")
);
