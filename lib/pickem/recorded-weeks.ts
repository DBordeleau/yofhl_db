// Pick'em's own record of each locked week (ADR 0005): its lock and the pairings its Pick'em picks count against.
// Settle writes a week once its lock has passed, and its results once its correction window has closed; reads
// prefer the record to the live season from then on.
import { sql } from 'drizzle-orm';
import { cached, rows } from '@/lib/data/db';
import type { LivePickemWeek } from './model';

/** Expires every cached Pick'em read of a season: settle expires it after recording or freezing a week */
export const pickemSeasonTag = (seasonYear: number) => `pickem-season-${seasonYear}`;

/** A recorded pairing, by franchise, in the live season's order */
export interface RecordedPairing {
    position: number;
    away: number;
    home: number;
    /** the frozen result: the winning franchise, or null for a tie (or while the week is not frozen) */
    winner: number | null;
}

export interface RecordedWeek {
    week: number;
    /** ISO timestamp */
    lock: string;
    pairings: RecordedPairing[];
    /** whether settle has frozen the week's results */
    frozen: boolean;
}

const isoOf = (column: ReturnType<typeof sql>) => sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Every recorded week of a season, in week order. Settle reads it uncached, straight from the database. */
export const recordedSeasonQuery = (seasonYear: number) => sql`
    select w.week, ${isoOf(sql`w.lock`)} as lock,
           coalesce((select json_agg(json_build_object('position', p.position, 'away', p.away_franchise_id,
                                                       'home', p.home_franchise_id, 'winner', p.winner_franchise_id) order by p.position)
                     from league.pickem_pairings p
                     where p.season_year = w.season_year and p.week = w.week), '[]') as pairings,
           coalesce((select bool_and(p.frozen_at is not null)
                     from league.pickem_pairings p
                     where p.season_year = w.season_year and p.week = w.week), false) as frozen
    from league.pickem_weeks w
    where w.season_year = ${seasonYear}::int
    order by w.week`;

/** A season's recorded weeks. Cached: only settle changes them, and it expires the tag. */
export const readRecordedSeason = cached(async (seasonYear: number): Promise<RecordedWeek[]> =>
    rows<RecordedWeek>(recordedSeasonQuery(seasonYear)),
'pickem-recorded-season', seasonYear => [pickemSeasonTag(seasonYear)]);

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

// One statement per week (ADR 0002): every pairing's result is written together, and only where none is frozen
// yet, so a frozen result is never written again and a second run changes nothing.
export const freezeWeekQuery = (seasonYear: number, week: number, results: { position: number; winner: number | null }[]) => sql`
    with frozen as (
        update league.pickem_pairings p
        set winner_franchise_id = r.winner, frozen_at = clock_timestamp()
        from jsonb_to_recordset(${JSON.stringify(results)}::jsonb) as r(position smallint, winner int)
        where p.season_year = ${seasonYear}::int and p.week = ${week}::int and p.position = r.position and p.frozen_at is null
        returning 1
    )
    select count(*)::int as frozen from frozen`;
