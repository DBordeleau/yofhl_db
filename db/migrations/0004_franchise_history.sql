CREATE TABLE "league"."draft_picks" (
	"season_year" integer NOT NULL,
	"overall" integer NOT NULL,
	"round" integer NOT NULL,
	"pick" integer NOT NULL,
	"franchise_id" integer,
	"team_name" text,
	"player_id" text,
	"player_name" text,
	"positions" text NOT NULL,
	"drafted_on" date NOT NULL,
	"source_time" text NOT NULL,
	"source_file" text NOT NULL,
	CONSTRAINT "draft_picks_season_year_overall_pk" PRIMARY KEY("season_year","overall")
);
--> statement-breakpoint
CREATE TABLE "league"."transaction_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"player_id" text,
	"label" text NOT NULL,
	"asset_kind" text NOT NULL,
	"action" text NOT NULL,
	"from_franchise_id" integer,
	"to_franchise_id" integer,
	"from_name" text,
	"to_name" text,
	"source_row" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league"."transaction_events" (
	"id" text PRIMARY KEY NOT NULL,
	"season_year" integer NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"occurred_on" date NOT NULL,
	"source_file" text NOT NULL,
	"source_time" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league"."draft_picks" ADD CONSTRAINT "draft_picks_season_year_seasons_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."seasons"("year") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."draft_picks" ADD CONSTRAINT "draft_picks_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."draft_picks" ADD CONSTRAINT "draft_picks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "league"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."transaction_assets" ADD CONSTRAINT "transaction_assets_event_id_transaction_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "league"."transaction_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."transaction_assets" ADD CONSTRAINT "transaction_assets_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "league"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."transaction_assets" ADD CONSTRAINT "transaction_assets_from_franchise_id_franchises_id_fk" FOREIGN KEY ("from_franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."transaction_assets" ADD CONSTRAINT "transaction_assets_to_franchise_id_franchises_id_fk" FOREIGN KEY ("to_franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."transaction_events" ADD CONSTRAINT "transaction_events_season_year_seasons_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."seasons"("year") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_picks_player" ON "league"."draft_picks" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "draft_picks_franchise" ON "league"."draft_picks" USING btree ("franchise_id","season_year");--> statement-breakpoint
CREATE INDEX "transaction_assets_event" ON "league"."transaction_assets" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "transaction_assets_player" ON "league"."transaction_assets" USING btree ("player_id","event_id");--> statement-breakpoint
CREATE INDEX "transaction_assets_from" ON "league"."transaction_assets" USING btree ("from_franchise_id","event_id");--> statement-breakpoint
CREATE INDEX "transaction_assets_to" ON "league"."transaction_assets" USING btree ("to_franchise_id","event_id");--> statement-breakpoint
CREATE INDEX "transaction_events_date" ON "league"."transaction_events" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transaction_events_season_kind" ON "league"."transaction_events" USING btree ("season_year","kind");