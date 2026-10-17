'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/admin/auth';
import { getStudioPlayers } from '@/lib/data/coachs-corner';
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

export async function lookupPlayers(names: string[]) {
    await requireAdmin();
    return getStudioPlayers(names.map(String).slice(0, 20));
}
