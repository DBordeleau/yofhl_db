-- Stored awards are keyed by the award's catalogue ID ('hasek', lib/awards.ts), not a row in an award table, and the
-- award table is dropped: see docs/adr/0009-awards-are-catalogue-ids.md. Each row's ID comes from its award's name,
-- using the six names the catalogue defines. If any stored award has another name, the migration stops before
-- changing anything; add the award to the catalogue or fix the row by hand first.
DO $$
DECLARE unknown text;
BEGIN
    SELECT string_agg(DISTINCT t.name, ', ' ORDER BY t.name) INTO unknown
    FROM league.awards a JOIN league.award_types t ON t.id = a.award_type_id
    WHERE t.name NOT IN ('Wayne Gretzky Award', 'Le Magnifique', 'Bobby Orr Award', 'Hasek Trophy', 'Danny Briere Award', 'Teemu Trophy');
    IF unknown IS NOT NULL THEN
        RAISE EXCEPTION 'Stored awards with no award catalogue match: %. Nothing was changed.', unknown;
    END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "league"."awards" ADD COLUMN "award" text;--> statement-breakpoint
UPDATE "league"."awards" a SET "award" = CASE t.name
    WHEN 'Wayne Gretzky Award' THEN 'wayne-gretzky'
    WHEN 'Le Magnifique' THEN 'le-magnifique'
    WHEN 'Bobby Orr Award' THEN 'bobby-orr'
    WHEN 'Hasek Trophy' THEN 'hasek'
    WHEN 'Danny Briere Award' THEN 'danny-briere'
    WHEN 'Teemu Trophy' THEN 'teemu-selanne'
END
FROM "league"."award_types" t WHERE t.id = a.award_type_id;--> statement-breakpoint
ALTER TABLE "league"."awards" ALTER COLUMN "award" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "league"."awards" DROP CONSTRAINT "awards_season_year_award_type_id_player_id_pk";--> statement-breakpoint
ALTER TABLE "league"."awards" DROP CONSTRAINT "awards_award_type_id_award_types_id_fk";--> statement-breakpoint
ALTER TABLE "league"."awards" DROP COLUMN "award_type_id";--> statement-breakpoint
ALTER TABLE "league"."awards" ADD CONSTRAINT "awards_season_year_award_player_id_pk" PRIMARY KEY("season_year","award","player_id");--> statement-breakpoint
DROP TABLE "league"."award_types";--> statement-breakpoint
REFRESH MATERIALIZED VIEW "league"."player_careers";
