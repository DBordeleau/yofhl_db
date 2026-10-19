import { revalidateTag } from 'next/cache';
import { rows } from '@/lib/data/db';
import { FANTRAX_CURRENT_TAG } from './cache-policy';
import { captureCurrentSeason } from './data';
import { saveSnapshotQuery } from './snapshot-store';

export async function refreshCurrentSeason() {
    const data = await captureCurrentSeason();
    await rows(saveSnapshotQuery(data));
    revalidateTag(FANTRAX_CURRENT_TAG);
    return { fetchedAt: data.source.fetchedAt, seasonYear: data.source.info.seasonYear };
}
