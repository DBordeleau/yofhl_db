import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { rows } from '@/lib/data/db';
import type { CurrentSeasonData } from './data';
import { FANTRAX_LEAGUE_ID } from './config';
import { DAY, FANTRAX_CURRENT_TAG, FANTRAX_TAG } from './cache-policy';

const getSavedSnapshot = unstable_cache(async () => (await rows<{ data: CurrentSeasonData }>(sql`
    select data from league.fantrax_snapshots where league_id = ${FANTRAX_LEAGUE_ID}
`))[0]?.data ?? null, ['fantrax-saved-snapshot', FANTRAX_LEAGUE_ID], {
    revalidate: DAY, tags: [FANTRAX_TAG, FANTRAX_CURRENT_TAG],
});

export async function getSavedCurrentSeason() {
    const saved = await getSavedSnapshot();
    return saved && Date.now() - Date.parse(saved.source.fetchedAt) < DAY * 1000 ? saved : null;
}

export function saveSnapshotQuery(data: CurrentSeasonData) {
    return sql`insert into league.fantrax_snapshots as stored (league_id, data)
        values (${FANTRAX_LEAGUE_ID}, ${JSON.stringify(data)}::jsonb)
        on conflict (league_id) do update set data = excluded.data
        where excluded.data #>> '{source,fetchedAt}' >= stored.data #>> '{source,fetchedAt}'`;
}
