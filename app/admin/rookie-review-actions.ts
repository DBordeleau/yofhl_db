'use server';

import { revalidatePath } from 'next/cache';
import type { AdminActionResult } from '@/components/admin/admin-action';
import { requireAdmin } from '@/lib/admin/auth';
import { awardVote } from '@/lib/award-vote/award-vote';
import type { AdjustRookieRejection } from '@/lib/award-vote/create-award-vote';

const REFUSALS: Record<AdjustRookieRejection, string> = {
    'not-prepared': 'Voting has opened, so the rookie list can no longer change.',
    'unknown-player': 'That player isn’t in this ballot. Prepare again and retry.',
};

// The admin adding a player to the Teemu Trophy's rookies, or removing one, before voting opens.
export async function adjustRookie(seasonYear: number, playerId: string, change: 'add' | 'remove'): Promise<AdminActionResult> {
    await requireAdmin();
    if (!Number.isInteger(seasonYear) || typeof playerId !== 'string' || !playerId || (change !== 'add' && change !== 'remove')) return { error: 'Choose a valid player.' };
    try {
        const result = await awardVote.adjustRookie({ seasonYear, playerId, change });
        if (!result.ok) return { error: REFUSALS[result.reason] };
        revalidatePath(`/admin/seasons/${seasonYear}`);
        return { message: change === 'add' ? 'Added to the rookies.' : 'Removed from the rookies.' };
    } catch (error) {
        console.error(`Changing the ${seasonYear} rookie list failed:`, error);
        return { error: 'Could not change the rookie list. Try again.' };
    }
}
