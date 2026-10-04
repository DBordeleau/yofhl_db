CREATE TABLE "league"."draft_lotteries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"entries" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"cancelled_at" timestamp with time zone,
	"winner_id" integer,
	"drawn_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "league"."draft_lotteries" ADD CONSTRAINT "draft_lotteries_winner_id_franchises_id_fk" FOREIGN KEY ("winner_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_current_draft_lottery" ON "league"."draft_lotteries" USING btree ("is_current") WHERE "league"."draft_lotteries"."is_current" = true;