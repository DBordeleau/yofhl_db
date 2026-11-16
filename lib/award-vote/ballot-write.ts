// What saving a draft and submitting a ballot share, following Pick'em's owner writes: the rehearsal refusal first,
// then the owner preamble (same origin, session, the vote being open and before its ballot lock, rate limit, the
// team the owner manages), then one statement that rechecks against the database clock that the owner still manages
// the franchise, the franchise takes part in the vote (voting-franchises.ts), the vote is open (and not a rehearsal)
// and the ballot lock has not passed.
// A ballot belongs to the franchise: whoever manages it at the time writes it.
import { sql, type SQL } from 'drizzle-orm';
import { TooManyAttemptsError, type OwnerPreambleRejection } from '@/lib/owner/create-owner-session';
import { rankedAwards, readRankings, type RankedAward } from './ballot';
import { readBallotAwards } from './ballot-snapshot';
import type { AwardVoteState, BallotRankings } from './model';
import type { AwardVotePorts } from './ports';
import { rehearsalRefusal, type RehearsalRefusal } from './rehearsal';
import { votingFranchise } from './voting-franchises';

/** ballot writes share their own limit, high enough for an owner to rank every award one save at a time */
const BALLOT_ACTION = { name: 'award-vote-ballot', attempts: 300 };

export type BallotWriteRejection = RehearsalRefusal | OwnerPreambleRejection
    /** no award vote is open for the season */
    | 'not-open'
    /** the ballot lock has passed */
    | 'locked'
    | 'rate-limited'
    /** the rankings are not rankings of the ballot's candidates */
    | 'invalid-ballot';

export interface BallotWriteInput {
    seasonYear: number;
    /** the rankings as the browser sent them (BallotRankings), checked here */
    rankings: unknown;
}

/** who is writing which franchise's ballot, and the rankings they sent, read against the ballot */
export interface BallotWriter {
    uid: string;
    franchiseId: number;
    rankings: BallotRankings;
    awards: RankedAward[];
}

/** the owner preamble and the rankings' check, before a ballot write */
export async function startBallotWrite(ports: AwardVotePorts, input: BallotWriteInput):
    Promise<{ ok: true; writer: BallotWriter } | { ok: false; reason: BallotWriteRejection }> {
    const { db, ownerSession } = ports;
    const { seasonYear } = input;
    const rehearsal = await rehearsalRefusal(db, seasonYear);
    if (rehearsal) return { ok: false, reason: rehearsal };
    const [vote] = await db.rows<{ state: AwardVoteState; locked: boolean }>(sql`
        select state, clock_timestamp() >= ballot_lock as locked from league.award_votes where season_year = ${seasonYear} and not rehearsal`);
    const closed = () => !vote || vote.state !== 'open' ? 'not-open' as const : vote.locked ? 'locked' as const : null;
    let start;
    try { start = await ownerSession.ownerPreamble(BALLOT_ACTION, closed); }
    catch (error) {
        if (error instanceof TooManyAttemptsError) return { ok: false, reason: 'rate-limited' };
        throw error;
    }
    if (!start.ok) return start;
    // the snapshot is frozen while the vote is open
    const awards = rankedAwards(await readBallotAwards(db, seasonYear));
    const rankings = readRankings(input.rankings, awards);
    if (!rankings) return { ok: false, reason: 'invalid-ballot' };
    return { ok: true, writer: { uid: start.actor.uid, franchiseId: start.team.id, rankings, awards } };
}

/**
 * Write `writer`'s ballot in one statement, saving the draft and, with `submit`, submitting it, only while the owner
 * still manages a franchise that takes part in the vote and the vote is open before its ballot lock, by the database clock
 */
export async function writeBallot(ports: AwardVotePorts, seasonYear: number, writer: BallotWriter, submit: boolean):
    Promise<{ ok: true } | { ok: false; reason: 'no-team' | 'not-open' | 'locked' }> {
    const rankings = JSON.stringify(writer.rankings);
    const submitted: { columns: SQL; values: SQL; updates: SQL } = submit
        ? {
            columns: sql`, submitted, submitted_at, submitted_by_uid`,
            values: sql`, ${rankings}::jsonb, clock_timestamp(), ${writer.uid}`,
            updates: sql`, submitted = excluded.submitted, submitted_at = excluded.submitted_at, submitted_by_uid = excluded.submitted_by_uid`,
        }
        : { columns: sql``, values: sql``, updates: sql`` };
    const [target] = await ports.db.rows<{ managed: boolean; open: boolean; unlocked: boolean }>(sql`
        with target as (
            select (select m.franchise_id from league.team_management m
                    where m.franchise_id = ${writer.franchiseId}::int and m.owner_uid = ${writer.uid}
                      and ${votingFranchise(sql`m.franchise_id`, seasonYear)}) as franchise_id,
                   coalesce((select v.state = 'open' and not v.rehearsal from league.award_votes v where v.season_year = ${seasonYear}::int), false) as open,
                   coalesce((select clock_timestamp() < v.ballot_lock from league.award_votes v where v.season_year = ${seasonYear}::int), false) as unlocked
        ), saved as (
            insert into league.award_vote_ballots (season_year, franchise_id, draft, draft_saved_at${submitted.columns})
            select ${seasonYear}::int, franchise_id, ${rankings}::jsonb, clock_timestamp()${submitted.values}
            from target where franchise_id is not null and open and unlocked
            on conflict (season_year, franchise_id)
            do update set draft = excluded.draft, draft_saved_at = excluded.draft_saved_at${submitted.updates}
            returning 1
        )
        select franchise_id is not null as managed, open, unlocked from target`);
    if (!target.managed) return { ok: false, reason: 'no-team' };
    if (!target.open) return { ok: false, reason: 'not-open' };
    if (!target.unlocked) return { ok: false, reason: 'locked' };
    return { ok: true };
}
