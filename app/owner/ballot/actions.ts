'use server';

import { awardVote } from '@/lib/award-vote/award-vote';
import type { BallotProblem, BallotWriteRejection } from '@/lib/award-vote/create-award-vote';

// Thin wrappers: the award vote module decides; these map its reasons to what an owner reads.

const messages: Record<BallotWriteRejection, string> = {
    rehearsal: 'This award vote is a rehearsal and takes no ballots.',
    'session-expired': 'Sign in again to cast your ballot.',
    'no-team': 'This account does not manage an active team.',
    'not-open': 'Voting is not open.',
    locked: 'The ballot lock has passed. Your ballot can no longer change.',
    'rate-limited': 'Too many saves in a short time. Try again in 15 minutes.',
    'invalid-ballot': 'Your ballot has changed since this page loaded. Reload the page.',
};

// where an owner goes to fix a refusal, when the fix is on another page
const fixes: Partial<Record<BallotWriteRejection, string>> = { 'session-expired': '/owner', 'no-team': '/owner' };

export type BallotActionResult =
    | { ok: true }
    /** with `problems` when the ballot is incomplete, for the page to name what is missing */
    | { error: string; fix?: string; problems?: BallotProblem[] };

const isWhole = (value: unknown): value is number => Number.isSafeInteger(value);

/** Save the franchise's draft as the owner ranks. */
export async function saveBallotDraft(seasonYear: number, rankings: unknown): Promise<BallotActionResult> {
    if (!isWhole(seasonYear)) return { error: 'Reload the page and try again.' };
    try {
        const result = await awardVote.saveDraft({ seasonYear, rankings });
        return result.ok ? result : { error: messages[result.reason], fix: fixes[result.reason] };
    } catch {
        return { error: 'Could not save your ballot. Try again.' };
    }
}

/** Submit the franchise's ballot, which must be complete. */
export async function submitBallot(seasonYear: number, rankings: unknown): Promise<BallotActionResult> {
    if (!isWhole(seasonYear)) return { error: 'Reload the page and try again.' };
    try {
        const result = await awardVote.submitBallot({ seasonYear, rankings });
        if (result.ok) return result;
        if (result.reason === 'incomplete') return { error: 'Your ballot is not complete yet.', problems: result.problems };
        return { error: messages[result.reason], fix: fixes[result.reason] };
    } catch {
        return { error: 'Could not submit your ballot. Try again.' };
    }
}
