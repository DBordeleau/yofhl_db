import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { rows } from '@/lib/data/db';
import { FANTRAX_LEAGUE_ID } from './config';
import { finalWeeksTag } from './cache-policy';

export function getManualFinalPeriods(seasonYear: number): Promise<number[]> {
    return unstable_cache(async () => (await rows<{ period: number }>(sql`
        select period from league.fantrax_final_weeks
        where league_id = ${FANTRAX_LEAGUE_ID} and season_year = ${seasonYear} order by period
    `)).map(row => row.period), ['fantrax-manual-finals', FANTRAX_LEAGUE_ID, String(seasonYear)], {
        revalidate: false, tags: [finalWeeksTag(seasonYear)],
    })();
}

export function finalWeekQuery(seasonYear: number, period: number, final: boolean) {
    return final ? sql`
        insert into league.fantrax_final_weeks (league_id, season_year, period)
        values (${FANTRAX_LEAGUE_ID}, ${seasonYear}, ${period}) on conflict do nothing
    ` : sql`
        delete from league.fantrax_final_weeks
        where league_id = ${FANTRAX_LEAGUE_ID} and season_year = ${seasonYear} and period = ${period}
    `;
}
