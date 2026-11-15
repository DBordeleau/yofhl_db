// The admin retrying the young players' failed NHL lookups after a prepare has finished: those lookups are dropped,
// so the prepare's rookies step looks the players up again (in its batches, up to NHL_LOOKUP_ATTEMPTS each), and the
// candidates are written again (its last step). The rest of the snapshot, every other lookup and the admin's rookie
// changes stay. Refused once the vote is past prepared, and when the finished prepare has no failed lookup. It
// returns the first prepare call's result; the admin page calls prepare again while that is unfinished.
import { sql } from 'drizzle-orm';
import { lookupFailed, type AwardVoteState, type PrepareProgress } from './model';
import type { AwardVotePorts } from './ports';
import { createPrepare, type PrepareResult } from './prepare';
import { PREPARE_STEPS } from './prepare-steps';

export interface RetryFailedLookupsInput {
    seasonYear: number;
}

export type RetryFailedLookupsRejection = 'not-prepared' | 'nothing-to-retry';

export type RetryFailedLookupsResult = PrepareResult | { ok: false; reason: RetryFailedLookupsRejection };

export function createRetryFailedLookups(ports: AwardVotePorts) {
    const { db } = ports;
    const prepare = createPrepare(ports);
    return async function retryFailedLookups(input: RetryFailedLookupsInput): Promise<RetryFailedLookupsResult> {
        const { seasonYear } = input;
        const [vote] = await db.rows<{ state: AwardVoteState; progress: PrepareProgress; finished: boolean }>(sql`
            select state, prepare_progress as progress, prepared_at is not null as finished
            from league.award_votes where season_year = ${seasonYear}`);
        if (!vote || vote.state !== 'prepared') return { ok: false, reason: 'not-prepared' };
        const lookups = vote.progress.rookies ?? {};
        if (!vote.finished || !Object.values(lookups).some(lookupFailed)) return { ok: false, reason: 'nothing-to-retry' };

        const progress: PrepareProgress = {
            ...vote.progress,
            rookies: Object.fromEntries(Object.entries(lookups).filter(([, lookup]) => !lookupFailed(lookup))),
            done: vote.progress.done.filter(step => step !== PREPARE_STEPS.rookies && step !== PREPARE_STEPS.candidates),
        };
        const [{ changed }] = await db.rows<{ changed: number }>(sql`
            with claim as (
                update league.award_votes
                set prepare_progress = ${JSON.stringify(progress)}::jsonb, prepared_at = null, updated_at = now()
                where season_year = ${seasonYear} and state = 'prepared' and prepared_at is not null
                    and prepare_progress = ${JSON.stringify(vote.progress)}::jsonb
                returning 1
            ), old_candidates as (
                delete from league.award_vote_candidates
                where season_year = ${seasonYear} and exists (select 1 from claim)
            )
            select count(*)::int as changed from claim`);
        // a prepare or a rookie change got there first: start again from what it left
        if (!changed) return retryFailedLookups(input);
        return prepare({ seasonYear });
    };
}
