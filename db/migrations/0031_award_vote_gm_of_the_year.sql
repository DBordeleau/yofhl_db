CREATE TABLE "league"."award_vote_team_seasons" (
	"season_year" integer NOT NULL,
	"team_season_id" integer NOT NULL,
	"franchise_id" integer NOT NULL,
	"summary" jsonb NOT NULL,
	CONSTRAINT "award_vote_team_seasons_season_year_team_season_id_pk" PRIMARY KEY("season_year","team_season_id")
);
--> statement-breakpoint
CREATE TABLE "league"."award_vote_team_tallies" (
	"season_year" integer NOT NULL,
	"award" text NOT NULL,
	"team_season_id" integer NOT NULL,
	"points" integer NOT NULL,
	"votes" integer[] NOT NULL,
	"place" smallint NOT NULL,
	CONSTRAINT "award_vote_team_tallies_season_year_award_team_season_id_pk" PRIMARY KEY("season_year","award","team_season_id"),
	CONSTRAINT "award_vote_team_tallies_award" CHECK ("league"."award_vote_team_tallies"."award" in ('gm-of-the-year')),
	CONSTRAINT "award_vote_team_tallies_place" CHECK ("league"."award_vote_team_tallies"."place" >= 1),
	CONSTRAINT "award_vote_team_tallies_votes" CHECK (cardinality("league"."award_vote_team_tallies"."votes") between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "league"."award_vote_team_seasons" ADD CONSTRAINT "award_vote_team_seasons_season_year_award_votes_season_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."award_votes"("season_year") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."award_vote_team_seasons" ADD CONSTRAINT "award_vote_team_seasons_team_season_id_team_seasons_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "league"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."award_vote_team_seasons" ADD CONSTRAINT "award_vote_team_seasons_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."award_vote_team_tallies" ADD CONSTRAINT "award_vote_team_tallies_season_year_award_votes_season_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."award_votes"("season_year") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."award_vote_team_tallies" ADD CONSTRAINT "award_vote_team_tallies_team_season_id_team_seasons_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "league"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "award_vote_team_tallies_team_season" ON "league"."award_vote_team_tallies" USING btree ("team_season_id","place");