CREATE TABLE "league"."award_vote_candidates" (
	"season_year" integer NOT NULL,
	"award" text NOT NULL,
	"player_id" text NOT NULL,
	"team_season_id" integer,
	CONSTRAINT "award_vote_candidates_season_year_award_player_id_pk" PRIMARY KEY("season_year","award","player_id"),
	CONSTRAINT "award_vote_candidates_award" CHECK ("league"."award_vote_candidates"."award" in ('wayne-gretzky', 'le-magnifique', 'bobby-orr', 'hasek', 'teemu-selanne', 'danny-briere'))
);
--> statement-breakpoint
CREATE TABLE "league"."award_vote_players" (
	"season_year" integer NOT NULL,
	"player_id" text NOT NULL,
	"name" text NOT NULL,
	"positions" text[] NOT NULL,
	"nhl_team" text,
	"age" smallint,
	CONSTRAINT "award_vote_players_season_year_player_id_pk" PRIMARY KEY("season_year","player_id")
);
--> statement-breakpoint
CREATE TABLE "league"."award_vote_stats" (
	"season_year" integer NOT NULL,
	"player_id" text NOT NULL,
	"stat_set" text NOT NULL,
	"line" jsonb NOT NULL,
	CONSTRAINT "award_vote_stats_season_year_player_id_stat_set_pk" PRIMARY KEY("season_year","player_id","stat_set")
);
--> statement-breakpoint
CREATE TABLE "league"."award_votes" (
	"season_year" integer PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'prepared' NOT NULL,
	"rehearsal" boolean DEFAULT false NOT NULL,
	"ballot_lock" timestamp with time zone,
	"prepare_progress" jsonb NOT NULL,
	"prepared_at" timestamp with time zone,
	"rookie_adjustments" jsonb DEFAULT '{"added":[],"removed":[]}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "award_votes_state" CHECK ("league"."award_votes"."state" in ('prepared', 'open', 'scored', 'published')),
	CONSTRAINT "award_votes_rehearsal_prepared" CHECK (not "league"."award_votes"."rehearsal" or "league"."award_votes"."state" = 'prepared')
);
--> statement-breakpoint
ALTER TABLE "league"."award_vote_candidates" ADD CONSTRAINT "award_vote_candidates_team_season_id_team_seasons_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "league"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."award_vote_candidates" ADD CONSTRAINT "award_vote_candidates_player" FOREIGN KEY ("season_year","player_id") REFERENCES "league"."award_vote_players"("season_year","player_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."award_vote_players" ADD CONSTRAINT "award_vote_players_season_year_award_votes_season_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."award_votes"("season_year") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."award_vote_stats" ADD CONSTRAINT "award_vote_stats_player" FOREIGN KEY ("season_year","player_id") REFERENCES "league"."award_vote_players"("season_year","player_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."award_votes" ADD CONSTRAINT "award_votes_season_year_seasons_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."seasons"("year") ON DELETE no action ON UPDATE no action;