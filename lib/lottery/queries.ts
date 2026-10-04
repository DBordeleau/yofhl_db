import { sql } from 'drizzle-orm';
import { FINALE_MS, INTRO_MS, REVEAL_MS, type LotteryEntry } from './model';

export const lotteryColumns = sql`id, title, starts_at as "startsAt", entries, version,
    is_current as "isCurrent", cancelled_at as "cancelledAt", winner_id as "winnerId", drawn_at as "drawnAt"`;

// Keep the saved order, names and odds; resolve artwork the same way as team pages.
export const lotteryLogosQuery = (entries: LotteryEntry[]) => sql`
    select (entry->>'id')::int as id, entry->>'name' as name,
           entry->>'abbreviation' as abbreviation, (entry->>'odds')::float8 as odds,
           coalesce(m.logo_url, t.logo_url, f.logo_url, entry->>'logo') as logo
    from jsonb_array_elements(${JSON.stringify(entries)}::jsonb) with ordinality as draw(entry, position)
    left join league.franchises f on f.id = (entry->>'id')::int
    left join league.team_management m on m.franchise_id = f.id
    left join lateral (select logo_url from league.team_seasons
                       where franchise_id = f.id order by season_year desc limit 1) t on true
    order by position`;

export const drawQuery = (id: string, version: number, winnerId: number) => sql`
    update league.draft_lotteries set winner_id = ${winnerId}, drawn_at = clock_timestamp()
    where id = ${id} and version = ${version} and winner_id is null
      and cancelled_at is null and starts_at <= clock_timestamp() returning id`;

export const editQuery = (id: string, version: number, title: string, startsAt: string, entries: LotteryEntry[]) => sql`
    update league.draft_lotteries set title = ${title}, starts_at = ${startsAt}::timestamptz,
        entries = ${JSON.stringify(entries)}::jsonb, version = version + 1
    where id = ${id} and version = ${version} and is_current = true
      and winner_id is null and cancelled_at is null and starts_at > clock_timestamp()
    returning ${lotteryColumns}`;

export const cancelQuery = (id: string, version: number) => sql`
    update league.draft_lotteries set cancelled_at = clock_timestamp(), is_current = false, version = version + 1
    where id = ${id} and version = ${version} and is_current = true and winner_id is null
      and starts_at > clock_timestamp() returning id`;

export const archiveCompletedQuery = () => sql`
    update league.draft_lotteries set is_current = false
    where is_current = true and winner_id is not null and
    starts_at + (${INTRO_MS + FINALE_MS} + greatest(0,
        (select max(position)::int from jsonb_array_elements(entries) with ordinality as draw(entry, position)
         where entry->>'odds' is not null) - 2) * ${REVEAL_MS}) * interval '1 millisecond' <= clock_timestamp()`;
