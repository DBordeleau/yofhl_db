CREATE TABLE "league"."pickem_completed_seasons" (
	"season_year" integer PRIMARY KEY NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
