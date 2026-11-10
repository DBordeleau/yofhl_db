// Pick'em's own record of each locked week (ADR 0005): its lock and the pairings its Pick'em picks count against.
// Settle writes a week once its lock has passed; reads prefer the record to the live season from then on.
import { sql } from 'drizzle-orm';
import { cached, rows } from '@/lib/data/db';
import type { LivePickemWeek } from './model';

/** Expires every cached Pick'em read of a season: settle expires it after recording a week */
export const pickemSeasonTag = (seasonYear: number) => `pickem-season-${seasonYear}`;

/** A recorded pairing, by franchise, in the live season's order */
export interface RecordedPairing {
    away: number;
    home: number;
}

export interface RecordedWeek {
    /** ISO timestamp */
    lock: string;
    pairings: RecordedPairing[];
}

const isoOf = (column: ReturnType<typeof sql>) => sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const recordedWeekQuery = (seasonYear: number, week: number) => sql`
    select ${isoOf(sql`w.lock`)} as lock,
           coalesce((select json_agg(json_build_object('away', p.away_franchise_id, 'home', p.home_franchise_id) order by p.position)
                     from league.pickem_pairings p
                     where p.season_year = w.season_year and p.week = w.week), '[]') as pairings
    from league.pickem_weeks w
    where w.season_year = ${seasonYear}::int and w.week = ${week}::int`;

/** A week's record, or null while it is not recorded. Cached: only settle changes it, and it expires the tag. */
export const readRecordedWeek = cached(async (seasonYear: number, week: number): Promise<RecordedWeek | null> => {
    const [found] = await rows<RecordedWeek>(recordedWeekQuery(seasonYear, week));
    return found ?? null;
}, 'pickem-recorded-week', seasonYear => [pickemSeasonTag(seasonYear)]);

export const recordedWeekNumbersQuery = (seasonYear: number) => sql`
    select week from league.pickem_weeks where season_year = ${seasonYear}::int`;

// One statement per week (ADR 0002): the week and its pairings go in together or not at all. A week already
// recorded is left as it is, and a lock the database clock has not reached yet records nothing.
export const recordWeekQuery = (week: LivePickemWeek) => {
    const pairings = week.matchups.map((matchup, position) => ({ position, away: matchup.away.id, home: matchup.home.id }));
    return sql`
    with recorded as (
        insert into league.pickem_weeks (season_year, week, lock)
        select ${week.seasonYear}::int, ${week.week}::int, ${week.lock}::timestamptz
        where clock_timestamp() >= ${week.lock}::timestamptz
        on conflict (season_year, week) do nothing
        returning season_year, week
    ),
    pairings as (
        insert into league.pickem_pairings (season_year, week, position, away_franchise_id, home_franchise_id)
        select recorded.season_year, recorded.week, p.position, p.away, p.home
        from recorded, jsonb_to_recordset(${JSON.stringify(pairings)}::jsonb) as p(position smallint, away int, home int)
        returning 1
    )
    select count(*)::int as recorded from recorded`;
};
