'use server';

import { requireAdmin } from '@/lib/admin/auth';
import { awardVote } from '@/lib/award-vote/award-vote';
import type { PrepareRejection, PrepareResult, RetryFailedLookupsRejection } from '@/lib/award-vote/create-award-vote';

/** a prepare call's outcome; `more` while preparing has steps left, so the panel calls again */
export type PrepareActionResult = { message: string; more: boolean } | { error: string };

const CARRY_ON = 'Prepare again to carry on from where it stopped.';

/** what the admin is told for each refusal, given the failure's message where there is one */
const REFUSALS: Record<PrepareRejection, (message: string) => string> = {
    'before-award-votes': () => 'Award votes start with the 2026–27 season; only the season before the live season can be rehearsed.',
    'no-champion': () => 'This season has no champion yet. Sync or import the Final first.',
    'no-transactions': () => 'This season has no imported transactions. Import its trades and free-agent claims first.',
    'no-fantrax-league': () => 'This season has no Fantrax league. Add its fantrax block to league/league.yml and run the season import.',
    'not-prepared': () => 'Voting has opened, so this ballot can no longer be prepared.',
    'fantrax-failed': message => `Fantrax failed: ${message}. ${CARRY_ON}`,
};

const RETRY_REFUSALS: Record<RetryFailedLookupsRejection, string> = {
    'not-prepared': 'Voting has opened, so the rookie list can no longer change.',
    'nothing-to-retry': 'No NHL lookup failed in the prepared ballot.',
};

const prepareMessage = (result: Extract<PrepareResult, { ok: true }>): PrepareActionResult => result.done
    ? { message: 'Ballot prepared.', more: false }
    : { message: `Preparing… ${result.stepsDone} of ${result.steps} steps done.`, more: true };

// One bounded batch of preparing the season's ballot, or with `startOver` the first batch of preparing an unfinished
// one again from nothing; the panel calls again (carrying on) while `more` is set.
export async function prepareAwardVote(seasonYear: number, startOver = false): Promise<PrepareActionResult> {
    await requireAdmin();
    if (!Number.isInteger(seasonYear) || typeof startOver !== 'boolean') return { error: 'Choose a valid season.' };
    try {
        const result = await awardVote.prepare({ seasonYear, startOver });
        if (result.ok) return prepareMessage(result);
        return { error: REFUSALS[result.reason]('message' in result ? result.message : '') };
    } catch (error) {
        console.error(`Preparing the ${seasonYear} award vote failed:`, error);
        return { error: `Could not prepare the ballot. ${CARRY_ON}` };
    }
}

// The first batch of looking the rookie review's failed NHL lookups up again and rebuilding the candidates; the
// rookie review carries on with prepareAwardVote while `more` is set.
export async function retryFailedLookups(seasonYear: number): Promise<PrepareActionResult> {
    await requireAdmin();
    if (!Number.isInteger(seasonYear)) return { error: 'Choose a valid season.' };
    try {
        const result = await awardVote.retryFailedLookups({ seasonYear });
        if (result.ok) return prepareMessage(result);
        if (result.reason === 'not-prepared' || result.reason === 'nothing-to-retry') return { error: RETRY_REFUSALS[result.reason] };
        return { error: REFUSALS[result.reason]('message' in result ? result.message : '') };
    } catch (error) {
        console.error(`Retrying the ${seasonYear} award vote's failed NHL lookups failed:`, error);
        return { error: `Could not retry the failed lookups. ${CARRY_ON}` };
    }
}
