CREATE TABLE "league"."fantrax_teams" (
	"season_year" integer NOT NULL,
	"fantrax_league_id" text NOT NULL,
	"fantrax_team_id" text NOT NULL,
	"franchise_id" integer NOT NULL,
	CONSTRAINT "fantrax_teams_season_year_fantrax_team_id_pk" PRIMARY KEY("season_year","fantrax_team_id"),
	CONSTRAINT "fantrax_teams_one_team_per_franchise" UNIQUE("season_year","franchise_id")
);
--> statement-breakpoint
ALTER TABLE "league"."fantrax_teams" ADD CONSTRAINT "fantrax_teams_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;