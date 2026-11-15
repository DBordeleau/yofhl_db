CREATE TABLE "league"."award_vote_ballots" (
	"season_year" integer NOT NULL,
	"franchise_id" integer NOT NULL,
	"draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft_saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted" jsonb,
	"submitted_at" timestamp with time zone,
	"submitted_by_uid" text,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	CONSTRAINT "award_vote_ballots_season_year_franchise_id_pk" PRIMARY KEY("season_year","franchise_id"),
	CONSTRAINT "award_vote_ballots_submitted" CHECK (("league"."award_vote_ballots"."submitted" is null) = ("league"."award_vote_ballots"."submitted_at" is null) and ("league"."award_vote_ballots"."submitted" is null) = ("league"."award_vote_ballots"."submitted_by_uid" is null)),
	CONSTRAINT "award_vote_ballots_void" CHECK (("league"."award_vote_ballots"."void_reason" is null) = ("league"."award_vote_ballots"."voided_at" is null) and ("league"."award_vote_ballots"."void_reason" is null or "league"."award_vote_ballots"."submitted" is not null))
);
--> statement-breakpoint
ALTER TABLE "league"."award_votes" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "league"."award_votes" ADD COLUMN "scored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "league"."award_votes" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "league"."award_vote_ballots" ADD CONSTRAINT "award_vote_ballots_season_year_award_votes_season_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."award_votes"("season_year") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."award_vote_ballots" ADD CONSTRAINT "award_vote_ballots_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."award_votes" ADD CONSTRAINT "award_votes_opened" CHECK ("league"."award_votes"."state" = 'prepared' or ("league"."award_votes"."ballot_lock" is not null and "league"."award_votes"."opened_at" is not null and "league"."award_votes"."prepared_at" is not null));