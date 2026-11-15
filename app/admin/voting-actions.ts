'use server';

import { revalidatePath } from 'next/cache';
import type { AdminActionResult } from '@/components/admin/admin-action';
import { requireAdmin } from '@/lib/admin/auth';
import { awardVote } from '@/lib/award-vote/award-vote';
import type { MoveBallotLockRejection, OpenVotingRejection } from '@/lib/award-vote/create-award-vote';

// Thin wrappers: the award vote module decides; these map its reasons to what the admin reads.

const OPEN_REFUSALS: Record<OpenVotingRejection, string> = {
    rehearsal: 'A rehearsal can never be opened.',
    'not-prepared': 'Finish preparing the ballot first. Voting can only be opened once.',
    'lock-passed': 'Choose a ballot lock in the future.',
    'invalid-lock': 'Choose a ballot lock date and time.',
};

const MOVE_REFUSALS: Record<MoveBallotLockRejection, string> = {
    rehearsal: 'A rehearsal has no ballot lock.',
    'not-open': 'Voting is not open.',
    locked: 'The ballot lock has passed, so ballots have stopped changing.',
    'not-later': 'The new ballot lock must be later than the current one.',
    'invalid-lock': 'Choose a ballot lock date and time.',
};

// The admin opening a prepared award vote, with the ballot lock as an ISO time.
export async function openVoting(seasonYear: number, ballotLock: string): Promise<AdminActionResult> {
    await requireAdmin();
    if (!Number.isInteger(seasonYear) || typeof ballotLock !== 'string') return { error: 'Choose a valid season and ballot lock.' };
    try {
        const result = await awardVote.openVoting({ seasonYear, ballotLock });
        if (!result.ok) return { error: OPEN_REFUSALS[result.reason] };
        revalidatePath(`/admin/seasons/${seasonYear}`);
        return { message: 'Voting is open. Share the ballot link with the league.' };
    } catch (error) {
        console.error(`Opening the ${seasonYear} award vote failed:`, error);
        return { error: 'Could not open voting. Try again.' };
    }
}

// The admin moving the ballot lock later while voting is open.
export async function moveBallotLock(seasonYear: number, ballotLock: string): Promise<AdminActionResult> {
    await requireAdmin();
    if (!Number.isInteger(seasonYear) || typeof ballotLock !== 'string') return { error: 'Choose a valid season and ballot lock.' };
    try {
        const result = await awardVote.moveBallotLock({ seasonYear, ballotLock });
        if (!result.ok) return { error: MOVE_REFUSALS[result.reason] };
        revalidatePath(`/admin/seasons/${seasonYear}`);
        return { message: 'Ballot lock moved.' };
    } catch (error) {
        console.error(`Moving the ${seasonYear} ballot lock failed:`, error);
        return { error: 'Could not move the ballot lock. Try again.' };
    }
}
