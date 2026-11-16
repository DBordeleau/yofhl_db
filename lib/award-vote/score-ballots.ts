// Scoring: the admin turning an open award vote's submitted ballots into each voted award's tally (tally.ts). It is
// allowed once every active franchise has submitted a ballot, or otherwise once the ballot lock has passed by the
// database clock; franchises with no submitted ballot then simply add nothing. Scoring again after reopening
// replaces the tallies. Refused for a rehearsal (rehearsal.ts).
import { sql } from 'drizzle-orm';
import type { AwardVoteState } from './model';
import type { AwardVotePorts } from './ports';
import { rehearsalRefusal, type RehearsalRefusal } from './rehearsal';
import { replaceTallies } from './tally';

export interface ScoreBallotsInput {
    seasonYear: number;
}

export type ScoreBallotsRejection = RehearsalRefusal
    /** never opened, or already scored or published */
    | 'not-open'
    /** the ballot lock is still ahead and an active franchise has no submitted ballot */
    | 'still-voting';

export type ScoreBallotsResult = { ok: true } | { ok: false; reason: ScoreBallotsRejection };

/** whether the award vote's ballots have stopped changing: its ballot lock has passed, or every active franchise has submitted */
const ballotsSettled = (seasonYear: number) => sql`(clock_timestamp() >= v.ballot_lock or not exists (
    select 1 from league.franchises f
    where f.folded_after_season is null
      and not exists (select 1 from league.award_vote_ballots b
                      where b.season_year = ${seasonYear}::int and b.franchise_id = f.id and b.submitted is not null)))`;

export function createScoreBallots({ db }: AwardVotePorts) {
    async function refusal(seasonYear: number): Promise<ScoreBallotsRejection | null> {
        const [vote] = await db.rows<{ state: AwardVoteState; settled: boolean }>(sql`
            select v.state, ${ballotsSettled(seasonYear)} as settled from league.award_votes v where v.season_year = ${seasonYear}`);
        if (!vote || vote.state !== 'open') return 'not-open';
        return vote.settled ? null : 'still-voting';
    }

    return async function scoreBallots({ seasonYear }: ScoreBallotsInput): Promise<ScoreBallotsResult> {
        const rehearsal = await rehearsalRefusal(db, seasonYear);
        if (rehearsal) return { ok: false, reason: rehearsal };
        const refused = await refusal(seasonYear);
        if (refused) return { ok: false, reason: refused };

        // one statement: the vote becomes scored only while open, not a rehearsal and settled, and its tallies are
        // replaced only when it does
        const scored = await db.rows(sql`
            with scored as (
                update league.award_votes v set state = 'scored', scored_at = clock_timestamp(), updated_at = now()
                where v.season_year = ${seasonYear} and v.state = 'open' and not v.rehearsal and ${ballotsSettled(seasonYear)}
                returning v.season_year
            ), ${replaceTallies(seasonYear, sql`scored`)}
            select 1 from scored`);
        if (scored.length) return { ok: true };
        return { ok: false, reason: (await refusal(seasonYear)) ?? 'not-open' };
    };
}
