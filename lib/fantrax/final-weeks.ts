import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { rows } from '@/lib/data/db';
import { FANTRAX_LEAGUE_ID } from './config';
import { finalWeeksTag } from './cache-policy';

// The league ID defaults stay until every caller reads it from league.fantrax_teams (#61).
export function getManualFinalPeriods(seasonYear: number, leagueId = FANTRAX_LEAGUE_ID): Promise<number[]> {
    return unstable_cache(async () => (await rows<{ period: number }>(sql`
        select period from league.fantrax_final_weeks
        where league_id = ${leagueId} and season_year = ${seasonYear} order by period
    `)).map(row => row.period), ['fantrax-manual-finals', leagueId, String(seasonYear)], {
        revalidate: false, tags: [finalWeeksTag(seasonYear)],
    })();
}

export function finalWeekQuery(seasonYear: number, period: number, final: boolean, leagueId = FANTRAX_LEAGUE_ID) {
    return final ? sql`
        insert into league.fantrax_final_weeks (league_id, season_year, period)
        values (${leagueId}, ${seasonYear}, ${period}) on conflict do nothing
    ` : sql`
        delete from league.fantrax_final_weeks
        where league_id = ${leagueId} and season_year = ${seasonYear} and period = ${period}
    `;
}
