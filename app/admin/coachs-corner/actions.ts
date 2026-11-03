'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/admin/auth';
import { getPlayerSnapshot } from '@/lib/data/coachs-corner';
import { playerIssues, type PlayerIssue } from '@/lib/coachs-corner/player-snapshot';
import type { PlayerRef } from '@/lib/coachs-corner/script';
import type { StudioPlayer } from '@/lib/coachs-corner/teams';
import { deleteEpisodeRecord, publicationEffects, saveEpisodeRecord, unpublishEpisodeRecord, type EpisodeInput, type EpisodeWrite } from '@/lib/coachs-corner/publishing';

const afterWrite = (change: EpisodeWrite | undefined) => {
    if (!change) return;
    const effects = publicationEffects(change);
    effects.tags.forEach(tag => revalidateTag(tag));
    effects.paths.forEach(path => revalidatePath(path));
};

export async function saveEpisode(input: EpisodeInput): Promise<{ id: number; slug: string } | { error: string }> {
    await requireAdmin();
    const result = await saveEpisodeRecord(input);
    if ('error' in result) return result;
    afterWrite(result);
    return { id: result.id, slug: result.slug };
}

export async function unpublishEpisode(id: number) {
    await requireAdmin();
    afterWrite(await unpublishEpisodeRecord(id));
}

export async function deleteEpisode(id: number) {
    await requireAdmin();
    afterWrite(await deleteEpisodeRecord(id));
}

/** The editor's player preview: the snapshot Publish would store for the script's stats season and refs, and what's wrong with it. */
export async function lookupPlayers(season: number | null, refs: PlayerRef[]): Promise<{ players: StudioPlayer[]; issues: PlayerIssue[] }> {
    await requireAdmin();
    const stats = Number.isSafeInteger(season) ? season : null;
    const cited = (Array.isArray(refs) ? refs : []).filter(ref => typeof ref?.name === 'string')
        .map(ref => (typeof ref.id === 'string' ? { name: ref.name, id: ref.id } : { name: ref.name }));
    const { players, diagnostics } = await getPlayerSnapshot(stats, cited);
    return { players, issues: playerIssues(stats, diagnostics) };
}
