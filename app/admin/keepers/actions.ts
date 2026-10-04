'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin/auth';
import { requireSameOrigin } from '@/lib/owner/auth';
import { rows } from '@/lib/data/db';
import { reviewRookieQuery } from '@/lib/keepers/queries';

export async function reviewRookie(form: FormData): Promise<{ error?: string }> {
    try {
        await requireSameOrigin(); await requireAdmin();
        const franchiseId = Number(form.get('franchiseId'));
        const version = Number(form.get('version'));
        const rookieId = form.get('rookieId');
        const status = form.get('status');
        const note = String(form.get('note') ?? '').trim();
        if (!Number.isSafeInteger(franchiseId) || franchiseId < 1 || !Number.isSafeInteger(version) || version < 1 ||
            typeof rookieId !== 'string' || !rookieId || rookieId.length > 64 ||
            !['approved', 'rejected'].includes(String(status)) || note.length > 500) return { error: 'Invalid review. Reload and try again.' };
        if (status === 'rejected' && !note) return { error: 'Add a reason so the owner knows what to correct.' };
        const result = await rows(reviewRookieQuery({ franchiseId, version, rookieId, status: status as 'approved' | 'rejected', note }));
        if (!result.length) return { error: 'The owner changed this list or it was already reviewed. Reload before reviewing it.' };
        revalidatePath('/admin/keepers'); revalidatePath('/owner/keepers');
        return {};
    } catch { return { error: 'Could not confirm this review. Reload and check its status.' }; }
}
