CREATE TABLE "league"."pickem_picks" (
	"season_year" integer NOT NULL,
	"week" integer NOT NULL,
	"entry_franchise_id" integer NOT NULL,
	"low_franchise_id" integer NOT NULL,
	"high_franchise_id" integer NOT NULL,
	"picked_franchise_id" integer NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickem_picks_season_year_week_entry_franchise_id_low_franchise_id_high_franchise_id_pk" PRIMARY KEY("season_year","week","entry_franchise_id","low_franchise_id","high_franchise_id"),
	CONSTRAINT "pickem_picks_matchup" CHECK ("league"."pickem_picks"."low_franchise_id" < "league"."pickem_picks"."high_franchise_id"
        and "league"."pickem_picks"."picked_franchise_id" in ("league"."pickem_picks"."low_franchise_id", "league"."pickem_picks"."high_franchise_id"))
);
--> statement-breakpoint
ALTER TABLE "league"."pickem_picks" ADD CONSTRAINT "pickem_picks_entry_franchise_id_franchises_id_fk" FOREIGN KEY ("entry_franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."pickem_picks" ADD CONSTRAINT "pickem_picks_low_franchise_id_franchises_id_fk" FOREIGN KEY ("low_franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."pickem_picks" ADD CONSTRAINT "pickem_picks_high_franchise_id_franchises_id_fk" FOREIGN KEY ("high_franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."pickem_picks" ADD CONSTRAINT "pickem_picks_picked_franchise_id_franchises_id_fk" FOREIGN KEY ("picked_franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;