'use server';

import { requireAdmin } from '@/lib/admin/auth';
import { awardVote } from '@/lib/award-vote/award-vote';
import type { PrepareResult } from '@/lib/award-vote/create-award-vote';

/** a prepare call's outcome; `more` while preparing has steps left, so the panel calls again */
export type PrepareActionResult = { message: string; more: boolean } | { error: string };

const REFUSALS: Record<Exclude<Extract<PrepareResult, { ok: false }>['reason'], 'fantrax-failed' | 'nhl-failed'>, string> = {
    'before-award-votes': 'Award votes start with the 2026–27 season; only the season before the live season can be rehearsed.',
    'no-champion': 'This season has no champion yet. Sync or import the Final first.',
    'no-fantrax-league': 'This season has no Fantrax league. Add its fantrax block to league/league.yml and run the season import.',
    'not-prepared': 'Voting has opened, so this ballot can no longer be prepared.',
};

// One bounded batch of preparing the season's ballot; the panel calls again while `more` is set.
export async function prepareAwardVote(seasonYear: number): Promise<PrepareActionResult> {
    await requireAdmin();
    if (!Number.isInteger(seasonYear)) return { error: 'Choose a valid season.' };
    try {
        const result = await awardVote.prepare({ seasonYear });
        if (result.ok) return result.done
            ? { message: 'Ballot prepared.', more: false }
            : { message: `Preparing… ${result.stepsDone} of ${result.steps} steps done.`, more: true };
        if (result.reason === 'fantrax-failed') return { error: `Fantrax failed: ${result.message}. Prepare again to carry on from where it stopped.` };
        if (result.reason === 'nhl-failed') return { error: `The NHL player lookup failed: ${result.message}. Prepare again to carry on from where it stopped.` };
        return { error: REFUSALS[result.reason] };
    } catch (error) {
        console.error(`Preparing the ${seasonYear} award vote failed:`, error);
        return { error: 'Could not prepare the ballot. Prepare again to carry on from where it stopped.' };
    }
}
