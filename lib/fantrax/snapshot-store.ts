import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { rows } from '@/lib/data/db';
import type { CurrentSeasonData } from './fantrax-client';
import { FANTRAX_LEAGUE_ID } from './config';
import { DAY, FANTRAX_CURRENT_TAG, FANTRAX_TAG } from './cache-policy';

const getSavedSnapshot = (leagueId: string) => unstable_cache(async () => (await rows<{ data: CurrentSeasonData }>(sql`
    select data from league.fantrax_snapshots where league_id = ${leagueId}
`))[0]?.data ?? null, ['fantrax-saved-snapshot-v2', leagueId], {
    revalidate: DAY, tags: [FANTRAX_TAG, FANTRAX_CURRENT_TAG],
})();

// The league ID defaults stay until every caller reads it from league.fantrax_teams (#61).
export async function getSavedCurrentSeason(leagueId = FANTRAX_LEAGUE_ID) {
    const saved = await getSavedSnapshot(leagueId);
    return saved && Date.now() - Date.parse(saved.source.fetchedAt) < DAY * 1000 ? saved : null;
}

export function saveSnapshotQuery(data: CurrentSeasonData, leagueId = FANTRAX_LEAGUE_ID) {
    return sql`insert into league.fantrax_snapshots as stored (league_id, data)
        values (${leagueId}, ${JSON.stringify(data)}::jsonb)
        on conflict (league_id) do update set data = excluded.data
        where excluded.data #>> '{source,fetchedAt}' >= stored.data #>> '{source,fetchedAt}'`;
}
