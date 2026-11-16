'use server';

import { revalidatePath } from 'next/cache';
import type { AdminActionResult } from '@/components/admin/admin-action';
import { requireAdmin } from '@/lib/admin/auth';
import { awardVote } from '@/lib/award-vote/award-vote';
import type { MoveBallotLockRejection, OpenVotingRejection, PublishRejection, RefreshArchiveRejection, ReopenVotingRejection, ScoreBallotsRejection } from '@/lib/award-vote/create-award-vote';

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
    'not-later': 'The new ballot lock must be later than the current one.',
    'lock-passed': 'Choose a ballot lock in the future.',
    'invalid-lock': 'Choose a ballot lock date and time.',
};

const SCORE_REFUSALS: Record<ScoreBallotsRejection, string> = {
    rehearsal: 'A rehearsal is never scored.',
    'not-open': 'Only an open award vote can be scored.',
    'still-voting': 'Some franchises have not submitted yet. Score once they all have, or once the ballot lock has passed.',
};

const REOPEN_REFUSALS: Record<ReopenVotingRejection, string> = {
    rehearsal: 'A rehearsal is never reopened.',
    'not-scored': 'Only a scored award vote can be reopened.',
    'lock-passed': 'Choose a ballot lock in the future.',
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

// The admin scoring the submitted ballots into each award's tally.
export async function scoreBallots(seasonYear: number): Promise<AdminActionResult> {
    await requireAdmin();
    if (!Number.isInteger(seasonYear)) return { error: 'Choose a valid season.' };
    try {
        const result = await awardVote.scoreBallots({ seasonYear });
        if (!result.ok) return { error: SCORE_REFUSALS[result.reason] };
        revalidatePath(`/admin/seasons/${seasonYear}`);
        return { message: 'Ballots scored. Review each tally below.' };
    } catch (error) {
        console.error(`Scoring the ${seasonYear} award vote failed:`, error);
        return { error: 'Could not score the ballots. Try again.' };
    }
}

// The admin reopening a scored award vote with a new ballot lock, as an ISO time.
export async function reopenVoting(seasonYear: number, ballotLock: string): Promise<AdminActionResult> {
    await requireAdmin();
    if (!Number.isInteger(seasonYear) || typeof ballotLock !== 'string') return { error: 'Choose a valid season and ballot lock.' };
    try {
        const result = await awardVote.reopenVoting({ seasonYear, ballotLock });
        if (!result.ok) return { error: REOPEN_REFUSALS[result.reason] };
        revalidatePath(`/admin/seasons/${seasonYear}`);
        return { message: 'Voting is open again. Every ballot can be changed until the new ballot lock.' };
    } catch (error) {
        console.error(`Reopening the ${seasonYear} award vote failed:`, error);
        return { error: 'Could not reopen voting. Try again.' };
    }
}

const PUBLISH_REFUSALS: Record<PublishRejection, string> = {
    rehearsal: 'A rehearsal is never published.',
    'not-scored': 'Only a scored award vote can be published, and only once.',
    'no-tally': 'No ballot counted, so there are no winners to publish.',
};

// The admin publishing a scored award vote's winners into the archive. There is no un-publishing.
export async function publishAwardVote(seasonYear: number): Promise<AdminActionResult> {
    await requireAdmin();
    if (!Number.isInteger(seasonYear)) return { error: 'Choose a valid season.' };
    try {
        const result = await awardVote.publish({ seasonYear });
        if (!result.ok) {
            return { error: result.reason === 'missing-award-type'
                ? `The archive has no award type named ${result.awardTypes.join(', ')}. Add it to league/league.yml and import, then publish.`
                : PUBLISH_REFUSALS[result.reason] };
        }
        revalidatePath(`/admin/seasons/${seasonYear}`);
        return { message: 'Published. The winners are on every award page.' };
    } catch (error) {
        console.error(`Publishing the ${seasonYear} award vote failed:`, error);
        // the winners may have been written before a view refresh failed; the page shows which, and offers to
        // refresh the archive if they were
        return { error: 'Publishing failed. Reload the page: if the award vote shows as published, refresh the archive.' };
    }
}

const REFRESH_REFUSALS: Record<RefreshArchiveRejection, string> = {
    rehearsal: 'A rehearsal is never published.',
    'not-published': 'Only a published award vote’s archive can be refreshed.',
};

// The admin refreshing the archive's views and pages after a published award vote, when publishing's refresh failed.
export async function refreshAwardVoteArchive(seasonYear: number): Promise<AdminActionResult> {
    await requireAdmin();
    if (!Number.isInteger(seasonYear)) return { error: 'Choose a valid season.' };
    try {
        const result = await awardVote.refreshArchive({ seasonYear });
        if (!result.ok) return { error: REFRESH_REFUSALS[result.reason] };
        revalidatePath(`/admin/seasons/${seasonYear}`);
        return { message: 'Archive refreshed. Every award page shows the published winners.' };
    } catch (error) {
        console.error(`Refreshing the ${seasonYear} award vote's archive failed:`, error);
        return { error: 'Could not refresh the archive. Try again.' };
    }
}
