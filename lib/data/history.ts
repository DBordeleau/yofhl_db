import { sql } from 'drizzle-orm';
import { cached, rows } from './db';
import { leagueTags } from './cache-tags';
import type { DraftSelection, SeasonDraftSelection, FranchiseHonors, HistoryKind, HistoryPage, HistoryScope } from '@/lib/history/model';
import { visibleTransactionEvents } from '@/lib/history/visibility';
import { draftRegretEligible, type DraftDevelopmentFacts } from '@/lib/draft/development';

// Draft and transaction rows show each team's season identity, not the name Fantrax recorded.
// The recorded name stands in only where the franchise has no team season that year.
const seasonTeamJson = (season: string, franchise: string, recorded: string) => sql.raw(`jsonb_build_object('id', ${franchise},
    'name', coalesce(${season}.name, ${recorded}), 'abbreviation', ${season}.abbreviation, 'logo', ${season}.logo)`);

export const getFranchiseHonors = cached(async (id: number): Promise<FranchiseHonors> => {
    const [primeMinisters, awards] = await Promise.all([
        rows<FranchiseHonors['primeMinisters'][number]>(sql`
            select t.season_year as year, t.fpts_for::float8 as points
            from league.team_seasons t
            where t.franchise_id = ${id}
              and not exists (select 1 from league.team_seasons other
                  where other.season_year = t.season_year and other.franchise_id <> t.franchise_id and other.fpts_for >= t.fpts_for)
            order by t.season_year desc`),
        rows<FranchiseHonors['awards'][number]>(sql`
            select a.season_year as year, at.name, at.label, at.description, p.id as "playerId", p.name as player
            from league.awards a
            join league.team_seasons t on t.id = a.team_season_id
            join league.award_types at on at.id = a.award_type_id
            join league.players p on p.id = a.player_id
            where t.franchise_id = ${id}
            order by a.season_year desc, at.sort_order, p.name`),
    ]);
    return { primeMinisters, awards };
}, 'franchise-honors', [leagueTags.awards]);

export const getFranchiseDraft = cached((id: number) => rows<DraftSelection>(sql`
    select d.season_year as year, d.overall, d.round, d.pick, d.player_id as "playerId",
           coalesce(p.name, d.player_name) as player, d.positions,
           ps.fpts::float8 as points, ps.fpg::float8 as fpg
    from league.draft_picks d
    left join league.players p on p.id = d.player_id
    left join league.player_seasons ps on ps.player_id = d.player_id and ps.season_year = d.season_year
    where d.franchise_id = ${id}
    order by d.season_year desc, d.overall`), 'franchise-draft');

type SeasonDraftRow = Omit<SeasonDraftSelection, 'regretEligible'> & { draftedOn: string; developmentFacts: DraftDevelopmentFacts | null };
const getSeasonDraftRows = cached((year: number) => rows<SeasonDraftRow>(sql`
    select d.season_year as year, d.overall, d.round, d.pick, d.player_id as "playerId",
           coalesce(p.name, d.player_name) as player, d.positions, d.drafted_on::text as "draftedOn", d.development_facts as "developmentFacts",
           d.franchise_id as "franchiseId", coalesce(st.name, d.team_name) as "teamName",
           st.abbreviation as "teamAbbreviation", st.logo as "teamLogo",
           ps.fpts::float8 as points, ps.fpg::float8 as fpg
    from league.draft_picks d
    left join league.players p on p.id = d.player_id
    left join league.player_seasons ps on ps.player_id = d.player_id and ps.season_year = d.season_year
    left join league.season_teams st on st.franchise_id = d.franchise_id and st.season_year = d.season_year
    where d.season_year = ${year}
    order by d.overall`), 'season-draft-v3-development');

export async function getSeasonDraft(year: number): Promise<SeasonDraftSelection[]> {
    return (await getSeasonDraftRows(year)).map(({ draftedOn, developmentFacts, ...pick }) => ({
        ...pick, regretEligible: draftRegretEligible({ ...pick, draftedOn }, developmentFacts),
    }));
}

export const getHistorySeasons = cached(async (scope: HistoryScope) => {
    const found = await rows<{ year: number }>(sql`
        select distinct e.season_year as year from league.transaction_events e
        join league.transaction_assets a on a.event_id = e.id
        where ${visibleTransactionEvents} and (
            (${scope.playerId ?? null}::text is not null and a.player_id = ${scope.playerId ?? null})
            or (${scope.franchiseId ?? null}::int is not null and (a.from_franchise_id = ${scope.franchiseId ?? null} or a.to_franchise_id = ${scope.franchiseId ?? null})))
        union
        select distinct d.season_year as year from league.draft_picks d
        where (${scope.playerId ?? null}::text is not null and d.player_id = ${scope.playerId ?? null})
           or (${scope.franchiseId ?? null}::int is not null and d.franchise_id = ${scope.franchiseId ?? null})
        order by year desc`);
    return found.map((s) => s.year);
}, 'history-seasons-v2');

export const getHistory = cached(async (scope: HistoryScope, kind: HistoryKind = 'all', season: number | null = null, page: number = 1): Promise<HistoryPage> => {
    const pageSize = 10;
    const offset = (page - 1) * pageSize;
    const player = scope.playerId ?? null;
    const franchise = scope.franchiseId ?? null;
    const [result] = await rows<{ total: number; events: HistoryPage['events'] }>(sql`
        with feed as (
            select e.id, e.kind, e.season_year as season, e.occurred_on as date, e.occurred_at as sort_time,
                   null::int as round, null::int as overall
            from league.transaction_events e
            where ${visibleTransactionEvents} and (${kind} = 'all' or e.kind = ${kind})
              and (${season}::int is null or e.season_year = ${season})
              and exists (select 1 from league.transaction_assets a where a.event_id = e.id
                  and ((${player}::text is not null and a.player_id = ${player})
                    or (${franchise}::int is not null and (a.from_franchise_id = ${franchise} or a.to_franchise_id = ${franchise}))))
            union all
            select 'draft:' || d.season_year || ':' || d.overall, 'draft', d.season_year, d.drafted_on,
                   d.drafted_on::timestamp at time zone 'America/New_York', d.round, d.overall
            from league.draft_picks d
            where ${kind} in ('all', 'draft') and d.player_id is not null
              and (${season}::int is null or d.season_year = ${season})
              and ((${player}::text is not null and d.player_id = ${player})
                or (${franchise}::int is not null and d.franchise_id = ${franchise}))
        ), selected as (
            select * from feed order by sort_time desc, id desc limit ${pageSize} offset ${offset}
        ), visible as (
            select s.id, s.kind, s.season, to_char(s.date, 'YYYY-MM-DD') as date, s.round, s.overall, s.sort_time,
                case when s.kind = 'draft' then (
                    select jsonb_build_array(jsonb_build_object(
                        'id', s.id, 'playerId', d.player_id, 'label', coalesce(p.name, d.player_name), 'assetKind', 'player', 'action', 'draft', 'from', null,
                        'to', case when d.franchise_id is not null then ${seasonTeamJson('st', 'd.franchise_id', 'd.team_name')} end))
                    from league.draft_picks d
                    left join league.players p on p.id = d.player_id
                    left join league.season_teams st on st.franchise_id = d.franchise_id and st.season_year = d.season_year
                    where d.season_year = s.season and d.overall = s.overall
                ) else (
                    select jsonb_agg(jsonb_build_object(
                        'id', a.id, 'playerId', a.player_id, 'label', a.label, 'assetKind', a.asset_kind, 'action', a.action,
                        'from', case when a.from_franchise_id is not null then ${seasonTeamJson('fs', 'a.from_franchise_id', 'a.from_name')} end,
                        'to', case when a.to_franchise_id is not null then ${seasonTeamJson('ts', 'a.to_franchise_id', 'a.to_name')} end
                    ) order by a.source_row)
                    from league.transaction_assets a
                    left join league.season_teams fs on fs.franchise_id = a.from_franchise_id and fs.season_year = s.season
                    left join league.season_teams ts on ts.franchise_id = a.to_franchise_id and ts.season_year = s.season
                    where a.event_id = s.id
                      and (s.kind <> 'free_agent' or ${player}::text is null or a.player_id = ${player})
                ) end as assets
            from selected s
        )
        select (select count(*)::int from feed) as total,
               coalesce((select jsonb_agg(to_jsonb(v) - 'sort_time' order by v.sort_time desc, v.id desc) from visible v), '[]'::jsonb) as events`);
    return { ...result, page, pages: Math.max(1, Math.ceil(result.total / pageSize)) };
}, 'transaction-history-v3');
