CREATE TABLE "league"."keeper_submissions" (
	"season_year" integer NOT NULL,
	"franchise_id" integer NOT NULL,
	"roster" jsonb NOT NULL,
	"kept_ids" jsonb NOT NULL,
	"rookie_id" text,
	"rookie_declared" boolean DEFAULT false NOT NULL,
	"rookie_reviews" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by" text NOT NULL,
	CONSTRAINT "keeper_submissions_season_year_franchise_id_pk" PRIMARY KEY("season_year","franchise_id")
);
--> statement-breakpoint
ALTER TABLE "league"."keeper_submissions" ADD CONSTRAINT "keeper_submissions_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;