CREATE TABLE "league"."coachs_corner_episodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"season" integer,
	"week" integer,
	"script" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coachs_corner_episodes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "coachs_corner_published" ON "league"."coachs_corner_episodes" USING btree ("published_at");