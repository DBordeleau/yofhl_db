CREATE TABLE "league"."award_vote_daily_points" (
	"season_year" integer NOT NULL,
	"player_id" text NOT NULL,
	"day" date NOT NULL,
	"points" numeric(8, 2) NOT NULL,
	CONSTRAINT "award_vote_daily_points_season_year_player_id_day_pk" PRIMARY KEY("season_year","player_id","day")
);
--> statement-breakpoint
ALTER TABLE "league"."award_vote_daily_points" ADD CONSTRAINT "award_vote_daily_points_season_year_award_votes_season_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."award_votes"("season_year") ON DELETE cascade ON UPDATE no action;