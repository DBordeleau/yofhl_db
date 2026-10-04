CREATE TABLE "league"."owner_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"resets_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league"."team_management" (
	"franchise_id" integer PRIMARY KEY NOT NULL,
	"name" text,
	"logo_url" text,
	"owner_uid" text,
	"owner_email" text,
	"invite_hash" text,
	"invite_expires_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "team_management_owner_uid_unique" UNIQUE("owner_uid"),
	CONSTRAINT "team_management_invite_hash_unique" UNIQUE("invite_hash")
);
--> statement-breakpoint
ALTER TABLE "league"."team_management" ADD CONSTRAINT "team_management_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "league"."franchises"("id") ON DELETE no action ON UPDATE no action;