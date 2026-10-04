import { sql } from 'drizzle-orm';
import { CALDER_SEASON, KEEPER_DEADLINE, KEEPER_SEASON, type KeeperPlayer, type KeeperSelection } from './model';

const fields = sql`franchise_id as "franchiseId", season_year as "seasonYear", roster,
    kept_ids as "keptIds", rookie_id as "rookieId", rookie_declared as "rookieDeclared", rookie_season as "rookieSeason",
    rookie_reviews as "rookieReviews", version, submitted_at as "submittedAt", submitted_by as "submittedBy"`;
export const keeperSubmissionsQuery = () => sql`select ${fields} from league.keeper_submissions where season_year = ${KEEPER_SEASON}`;
export const keeperSubmissionQuery = (franchiseId: number) => sql`select ${fields} from league.keeper_submissions
    where season_year = ${KEEPER_SEASON} and franchise_id = ${franchiseId}`;

// The database clock, ownership and revision are checked in the write itself.
// Owner edits cannot erase prior rookie decisions, even after switching rookies.
export const saveKeepersQuery = (input: { franchiseId: number; uid: string; version: number; roster: KeeperPlayer[]; selection: KeeperSelection }) => sql`
    insert into league.keeper_submissions (season_year, franchise_id, roster, kept_ids, rookie_id, rookie_declared, rookie_season, submitted_by)
    select ${KEEPER_SEASON}, f.id, ${JSON.stringify(input.roster)}::jsonb, ${JSON.stringify(input.selection.keptIds)}::jsonb,
        ${input.selection.rookieId}, ${input.selection.rookieDeclared}, ${input.selection.rookieSeason ?? null}, ${input.uid}
    from league.franchises f join league.team_management m on m.franchise_id = f.id
    where f.id = ${input.franchiseId} and f.folded_after_season is null and m.owner_uid = ${input.uid}
      and clock_timestamp() < ${KEEPER_DEADLINE}::timestamptz
      and (${input.version} = 0 or exists (select 1 from league.keeper_submissions
          where season_year = ${KEEPER_SEASON} and franchise_id = f.id and version = ${input.version}))
    on conflict (season_year, franchise_id) do update set
        roster = excluded.roster, kept_ids = excluded.kept_ids, rookie_id = excluded.rookie_id,
        rookie_declared = excluded.rookie_declared, rookie_season = excluded.rookie_season, submitted_by = excluded.submitted_by,
        submitted_at = clock_timestamp(), version = league.keeper_submissions.version + 1
    where league.keeper_submissions.version = ${input.version}
      and clock_timestamp() < ${KEEPER_DEADLINE}::timestamptz
      and not (coalesce(league.keeper_submissions.rookie_reviews -> ${input.selection.rookieId ?? ''} ->> 'status', '') = 'rejected'
          and coalesce(league.keeper_submissions.rookie_reviews -> ${input.selection.rookieId ?? ''} ->> 'calderSeason', '') = ${String(CALDER_SEASON)})
    returning ${fields}`;

export const reviewRookieQuery = (input: { franchiseId: number; version: number; rookieId: string; status: 'approved' | 'rejected'; note: string }) => sql`
    update league.keeper_submissions set
        rookie_reviews = jsonb_set(rookie_reviews, array[${input.rookieId}]::text[],
            jsonb_build_object('status', ${input.status}::text, 'note', ${input.note}::text, 'reviewedAt', clock_timestamp(), 'calderSeason', ${CALDER_SEASON}::integer)),
        version = version + 1
    where season_year = ${KEEPER_SEASON} and franchise_id = ${input.franchiseId}
      and version = ${input.version} and rookie_id = ${input.rookieId} and rookie_season = ${CALDER_SEASON}
    returning ${fields}`;
