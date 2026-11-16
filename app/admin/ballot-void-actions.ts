'use server';

import { revalidatePath } from 'next/cache';
import type { AdminActionResult } from '@/components/admin/admin-action';
import { requireAdmin } from '@/lib/admin/auth';
import { awardVote } from '@/lib/award-vote/award-vote';
import type { RestoreBallotRejection, VoidBallotRejection } from '@/lib/award-vote/create-award-vote';
import { VOID_REASON_LENGTH } from '@/lib/award-vote/model';

// Thin wrappers: the award vote module decides; these map its reasons to what the admin reads.

const VOID_REFUSALS: Record<VoidBallotRejection, string> = {
    rehearsal: 'A rehearsal has no ballots.',
    'not-locked': 'Ballots can only be voided once the ballot lock has passed.',
    published: 'The award vote is published, so its ballots can no longer change.',
    'no-ballot': 'That franchise has no submitted ballot.',
    'invalid-reason': `Write a reason, up to ${VOID_REASON_LENGTH} characters.`,
    'already-void': 'That ballot is already void.',
};

const RESTORE_REFUSALS: Record<RestoreBallotRejection, string> = {
    rehearsal: 'A rehearsal has no ballots.',
    published: 'The award vote is published, so its ballots can no longer change.',
    'no-ballot': 'That franchise has no submitted ballot.',
    'not-void': 'That ballot already counts.',
};

const valid = (seasonYear: number, franchiseId: number) => Number.isInteger(seasonYear) && Number.isInteger(franchiseId);

// The admin voiding a franchise's submitted ballot with a reason.
export async function voidBallot(seasonYear: number, franchiseId: number, reason: string): Promise<AdminActionResult> {
    await requireAdmin();
    if (!valid(seasonYear, franchiseId)) return { error: 'Choose a valid season and ballot.' };
    try {
        const result = await awardVote.voidBallot({ seasonYear, franchiseId, reason });
        if (!result.ok) return { error: VOID_REFUSALS[result.reason] };
        revalidatePath(`/admin/seasons/${seasonYear}`);
        return { message: 'Ballot voided. It adds nothing to any tally.' };
    } catch (error) {
        console.error(`Voiding franchise ${franchiseId}'s ${seasonYear} ballot failed:`, error);
        return { error: 'Could not void the ballot. Try again.' };
    }
}

// The admin restoring a void ballot, so it counts again.
export async function restoreBallot(seasonYear: number, franchiseId: number): Promise<AdminActionResult> {
    await requireAdmin();
    if (!valid(seasonYear, franchiseId)) return { error: 'Choose a valid season and ballot.' };
    try {
        const result = await awardVote.restoreBallot({ seasonYear, franchiseId });
        if (!result.ok) return { error: RESTORE_REFUSALS[result.reason] };
        revalidatePath(`/admin/seasons/${seasonYear}`);
        return { message: 'Ballot restored. It counts again.' };
    } catch (error) {
        console.error(`Restoring franchise ${franchiseId}'s ${seasonYear} ballot failed:`, error);
        return { error: 'Could not restore the ballot. Try again.' };
    }
}
