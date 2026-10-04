-- IF NOT EXISTS: the migrator creates the schema first to hold its own log table
CREATE SCHEMA IF NOT EXISTS "league";
--> statement-breakpoint
CREATE TABLE "league"."award_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" smallint NOT NULL,
	CONSTRAINT "award_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "league"."awards" (
	"season_year" integer NOT NULL,
	"award_type_id" integer NOT NULL,
	"player_id" text NOT NULL,
	"team_season_id" integer,
	CONSTRAINT "awards_season_year_award_type_id_player_id_pk" PRIMARY KEY("season_year","award_type_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "league"."championship_rosters" (
	"season_year" integer NOT NULL,
	"player_id" text NOT NULL,
	CONSTRAINT "championship_rosters_season_year_player_id_pk" PRIMARY KEY("season_year","player_id")
);
--> statement-breakpoint
CREATE TABLE "league"."franchises" (
	"id" integer PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"logo_url" text,
	"first_season" integer NOT NULL,
	"folded_after_season" integer
);
--> statement-breakpoint
CREATE TABLE "league"."matchups" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_year" integer NOT NULL,
	"stage" text NOT NULL,
	"round" smallint NOT NULL,
	"bracket" text NOT NULL,
	"slot" smallint NOT NULL,
	"away_team_season_id" integer NOT NULL,
	"home_team_season_id" integer NOT NULL,
	"away_score" numeric(8, 2) NOT NULL,
	"home_score" numeric(8, 2) NOT NULL,
	"winner_team_season_id" integer,
	"score_adjusted" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "league"."owners" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "owners_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "league"."player_seasons" (
	"player_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"team_season_id" integer,
	"nhl_team" text,
	"positions" text[] NOT NULL,
	"fpts" numeric(8, 2) NOT NULL,
	"fpg" numeric(6, 2) NOT NULL,
	CONSTRAINT "player_seasons_player_id_season_year_pk" PRIMARY KEY("player_id","season_year")
);
--> statement-breakpoint
CREATE TABLE "league"."players" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league"."seasons" (
	"year" integer PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"playoff_status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league"."team_seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_year" integer NOT NULL,
	"franchise_id" integer NOT NULL,
	"owner_id" integer,
	"name" text NOT NULL,
	"fantrax_name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"logo_url" text,
	"division" smallint NOT NULL,
	"division_rank" smallint NOT NULL,
	"wins" smallint NOT NULL,
	"losses" smallint NOT NULL,
	"ties" smallint NOT NULL,
	"fpts_for" numeric(8, 2) NOT NULL,
	"fpts_against" numeric(8, 2) NOT NULL,
	CONSTRAINT "team_seasons_season_franchise" UNIQUE("season_year","franchise_id"),
	CONSTRAINT "team_seasons_season_abbreviation" UNIQUE("season_year","abbreviation")
);
--> statement-breakpoint
ALTER TABLE "league"."awards" ADD CONSTRAINT "awards_season_year_seasons_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."seasons"("year") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."awards" ADD CONSTRAINT "awards_award_type_id_award_types_id_fk" FOREIGN KEY ("award_type_id") REFERENCES "league"."award_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."awards" ADD CONSTRAINT "awards_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "league"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."awards" ADD CONSTRAINT "awards_team_season_id_team_seasons_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "league"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."championship_rosters" ADD CONSTRAINT "championship_rosters_season_year_seasons_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."seasons"("year") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."championship_rosters" ADD CONSTRAINT "championship_rosters_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "league"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."matchups" ADD CONSTRAINT "matchups_season_year_seasons_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."seasons"("year") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."matchups" ADD CONSTRAINT "matchups_away_team_season_id_team_seasons_id_fk" FOREIGN KEY ("away_team_season_id") REFERENCES "league"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."matchups" ADD CONSTRAINT "matchups_home_team_season_id_team_seasons_id_fk" FOREIGN KEY ("home_team_season_id") REFERENCES "league"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."matchups" ADD CONSTRAINT "matchups_winner_team_season_id_team_seasons_id_fk" FOREIGN KEY ("winner_team_season_id") REFERENCES "league"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."player_seasons" ADD CONSTRAINT "player_seasons_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "league"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."player_seasons" ADD CONSTRAINT "player_seasons_season_year_seasons_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."seasons"("year") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."player_seasons" ADD CONSTRAINT "player_seasons_team_season_id_team_seasons_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "league"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."team_seasons" ADD CONSTRAINT "team_seasons_season_year_seasons_year_fk" FOREIGN KEY ("season_year") REFERENCES "league"."seasons"("year") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."team_seasons" ADD CONSTRAINT "team_seasons_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league"."team_seasons" ADD CONSTRAINT "team_seasons_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "league"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matchups_season" ON "league"."matchups" USING btree ("season_year","stage","round");--> statement-breakpoint
CREATE INDEX "player_seasons_season_fpts" ON "league"."player_seasons" USING btree ("season_year","fpts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "player_seasons_team_season" ON "league"."player_seasons" USING btree ("team_season_id");