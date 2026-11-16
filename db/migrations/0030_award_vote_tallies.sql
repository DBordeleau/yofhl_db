CREATE TABLE "league"."award_vote_tallies" (
	"season_year" integer NOT NULL,
	"award" text NOT NULL,
	"player_id" text NOT NULL,
	"points" integer NOT NULL,
	"votes" integer[] NOT NULL,
	"place" smallint NOT NULL,
	CONSTRAINT "award_vote_tallies_season_year_award_player_id_pk" PRIMARY KEY("season_year","award","player_id"),
	CONSTRAINT "award_vote_tallies_award" CHECK ("league"."award_vote_tallies"."award" in ('wayne-gretzky', 'le-magnifique', 'bobby-orr', 'hasek', 'teemu-selanne', 'danny-briere')),
	CONSTRAINT "award_vote_tallies_place" CHECK ("league"."award_vote_tallies"."place" >= 1),
	CONSTRAINT "award_vote_tallies_votes" CHECK (cardinality("league"."award_vote_tallies"."votes") between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "league"."award_vote_tallies" ADD CONSTRAINT "award_vote_tallies_season_year_award_votes_season_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."award_votes"("season_year") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "award_vote_tallies_player" ON "league"."award_vote_tallies" USING btree ("player_id","place");--> statement-breakpoint
ALTER TABLE "league"."award_votes" ADD CONSTRAINT "award_votes_scored" CHECK ("league"."award_votes"."state" not in ('scored', 'published') or "league"."award_votes"."scored_at" is not null);