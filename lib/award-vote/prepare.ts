// Preparing a season's award vote: building its frozen candidate snapshot. Allowed for a season year from 2027, or
// for the season before the live season as a rehearsal (rehearsal.ts), that has a champion, while the vote is still
// only prepared. Each call runs steps in order until its time budget is
// spent, recording each step as done in the same statement as its write, so the next call resumes where this one
// stopped; the admin page calls again until it is done. The call after a finished prepare starts over, replacing
// the snapshot. Nothing runs unless the admin asks.
//
// The steps (prepare-steps.ts): the season's dates from its own Fantrax league info, then each stat set's Fantrax
// reads (with the finalists' daily rosters over the Final read before the Danny Briere Award's), then the young
// players' NHL lookups, then each award's candidates from the stored stats and the archive.
import { sql } from 'drizzle-orm';
import type { AwardVoteState, PrepareProgress } from './model';
import type { AwardVotePorts } from './ports';
import { FantraxFailure, NhlFailure, prepareSteps } from './prepare-steps';
import { awardVoteKind } from './rehearsal';

export interface PrepareInput {
    seasonYear: number;
}

export type PrepareRejection = 'before-award-votes' | 'no-champion' | 'no-fantrax-league' | 'not-prepared' | 'fantrax-failed' | 'nhl-failed';

export type PrepareResult =
    | { ok: true; done: boolean; stepsDone: number; steps: number }
    | { ok: false; reason: Exclude<PrepareRejection, 'fantrax-failed' | 'nhl-failed'> }
    /** a Fantrax read or an NHL lookup failed; the work before it is kept and the next call retries it */
    | { ok: false; reason: 'fantrax-failed' | 'nhl-failed'; message: string };

/**
 * A call starts no new step once this much of it has passed. Each step is at most a few Fantrax requests (each with
 * a 12-second timeout), so a call ends well inside the 60-second function limit.
 */
export const PREPARE_BUDGET_MS = 25_000;

interface SeasonCheck {
    champion: boolean;
    leagueId: string | null;
    state: AwardVoteState | null;
    progress: PrepareProgress | null;
    finished: boolean;
}

export function createPrepare(ports: AwardVotePorts) {
    const { db, clock } = ports;
    return async function prepare({ seasonYear }: PrepareInput): Promise<PrepareResult> {
        const kind = await awardVoteKind(db, seasonYear);
        if (kind === null) return { ok: false, reason: 'before-award-votes' };
        const [season] = await db.rows<SeasonCheck>(sql`
            select r.champion_team_season_id is not null as champion, v.state, v.prepare_progress as progress,
                   v.prepared_at is not null as finished,
                   (select min(ft.fantrax_league_id) from league.fantrax_teams ft where ft.season_year = ${seasonYear}) as "leagueId"
            from (select ${seasonYear}::int as year) y
            left join league.season_results r on r.season_year = y.year
            left join league.award_votes v on v.season_year = y.year`);
        if (!season.champion) return { ok: false, reason: 'no-champion' };
        if (season.leagueId === null) return { ok: false, reason: 'no-fantrax-league' };
        if (season.state !== null && season.state !== 'prepared') return { ok: false, reason: 'not-prepared' };

        const started = clock.now();
        let progress = season.progress && !season.finished ? season.progress : await start(seasonYear, kind === 'rehearsal', new Date(started).toISOString());
        if (!progress) return { ok: false, reason: 'not-prepared' };
        const steps = prepareSteps(ports, { seasonYear, leagueId: season.leagueId });
        while (progress.done.length < steps.length && clock.now() - started < PREPARE_BUDGET_MS) {
            const step = steps.find(({ name }) => !progress!.done.includes(name))!;
            try {
                const next = await step.run(progress);
                // another prepare has moved on (or started over) since this one read its progress: leave it to that one
                if (!next) break;
                progress = next;
            } catch (error) {
                if (!(error instanceof FantraxFailure || error instanceof NhlFailure)) throw error;
                console.error(`Preparing the ${seasonYear} award vote stopped at ${step.name}:`, error.cause);
                return { ok: false, reason: error instanceof NhlFailure ? 'nhl-failed' : 'fantrax-failed', message: error.message };
            }
        }
        return { ok: true, done: progress.done.length === steps.length, stepsDone: progress.done.length, steps: steps.length };
    };

    /** start a prepare over: the season's snapshot goes, and its progress starts empty; null if the vote is no longer prepared */
    async function start(seasonYear: number, rehearsal: boolean, startedAt: string): Promise<PrepareProgress | null> {
        const progress: PrepareProgress = { startedAt, done: [], dates: null };
        const [{ started }] = await db.rows<{ started: number }>(sql`
            with old_snapshot as (
                -- its stats and candidates go with it
                delete from league.award_vote_players
                where season_year = ${seasonYear} and (select state from league.award_votes where season_year = ${seasonYear}) = 'prepared'
            ), vote as (
                insert into league.award_votes (season_year, rehearsal, prepare_progress) values (${seasonYear}, ${rehearsal}, ${JSON.stringify(progress)}::jsonb)
                on conflict (season_year) do update
                set rehearsal = excluded.rehearsal, prepare_progress = excluded.prepare_progress, prepared_at = null, updated_at = now()
                where award_votes.state = 'prepared'
                returning 1
            )
            select count(*)::int as started from vote`);
        return started ? progress : null;
    }
}
