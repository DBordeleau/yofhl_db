// The admin's changes to the Teemu Trophy's computed rookie list: adding a player the NHL lookup missed, or removing
// one wrongly admitted. A change is stored with the award vote, so it survives preparing again, and is refused once
// the vote is past prepared. After a finished prepare the candidates are written again from the changed list (the
// prepare's last step, run again, which reads nothing from Fantrax); an unfinished prepare picks the change up when
// it gets to that step.
import { sql } from 'drizzle-orm';
import type { AwardVoteState, PrepareProgress, RookieAdjustments } from './model';
import type { AwardVotePorts } from './ports';
import { createPrepare } from './prepare';
import { PREPARE_STEPS } from './prepare-steps';

export interface AdjustRookieInput {
    seasonYear: number;
    /** a player in the season's snapshot */
    playerId: string;
    /** `add` makes them a rookie whatever the NHL lookup found; `remove` keeps them off the Teemu Trophy */
    change: 'add' | 'remove';
}

export type AdjustRookieRejection = 'not-prepared' | 'unknown-player';

export type AdjustRookieResult = { ok: true } | { ok: false; reason: AdjustRookieRejection };

interface VoteRow {
    state: AwardVoteState;
    progress: PrepareProgress;
    adjustments: RookieAdjustments;
    finished: boolean;
    known: boolean;
}

export function createAdjustRookie(ports: AwardVotePorts) {
    const { db } = ports;
    const prepare = createPrepare(ports);
    return async function adjustRookie(input: AdjustRookieInput): Promise<AdjustRookieResult> {
        const { seasonYear, playerId, change } = input;
        const [vote] = await db.rows<VoteRow>(sql`
            select v.state, v.prepare_progress as progress, v.rookie_adjustments as adjustments, v.prepared_at is not null as finished,
                   exists (select 1 from league.award_vote_players p where p.season_year = v.season_year and p.player_id = ${playerId}) as known
            from league.award_votes v where v.season_year = ${seasonYear}`);
        if (!vote || vote.state !== 'prepared') return { ok: false, reason: 'not-prepared' };
        if (!vote.known) return { ok: false, reason: 'unknown-player' };

        const withoutPlayer = (ids: string[]) => ids.filter(id => id !== playerId);
        const adjustments: RookieAdjustments = change === 'add'
            ? { added: [...withoutPlayer(vote.adjustments.added), playerId], removed: withoutPlayer(vote.adjustments.removed) }
            : { added: withoutPlayer(vote.adjustments.added), removed: [...withoutPlayer(vote.adjustments.removed), playerId] };
        const progress: PrepareProgress = vote.finished
            ? { ...vote.progress, done: vote.progress.done.filter(step => step !== PREPARE_STEPS.candidates) }
            : vote.progress;
        const [{ changed }] = await db.rows<{ changed: number }>(sql`
            with claim as (
                update league.award_votes
                set rookie_adjustments = ${JSON.stringify(adjustments)}::jsonb, prepare_progress = ${JSON.stringify(progress)}::jsonb,
                    prepared_at = ${vote.finished ? sql`null` : sql`prepared_at`}, updated_at = now()
                where season_year = ${seasonYear} and state = 'prepared'
                    and rookie_adjustments = ${JSON.stringify(vote.adjustments)}::jsonb and prepare_progress = ${JSON.stringify(vote.progress)}::jsonb
                returning 1
            ), old_candidates as (
                delete from league.award_vote_candidates
                where season_year = ${seasonYear} and ${vote.finished} and exists (select 1 from claim)
            )
            select count(*)::int as changed from claim`);
        // a prepare or another change got there first: start again from what it left
        if (!changed) return adjustRookie(input);
        if (vote.finished) await prepare({ seasonYear });
        return { ok: true };
    };
}
