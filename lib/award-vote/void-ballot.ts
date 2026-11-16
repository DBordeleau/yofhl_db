// Voiding (GLOSSARY.md, "Void ballot"): the admin throwing out a franchise's submitted ballot with a written reason,
// so it adds nothing to any tally, and restoring it, which clears the reason and counts it again. Voiding is allowed
// only once ballots have stopped changing and before publishing: while open with the ballot lock passed by the
// database clock, or scored. Restoring is allowed any time before publishing, including while a reopened vote is
// before its new ballot lock. In a scored award vote the same statement recomputes every tally (tally.ts).
//
// Reopening leaves a void ballot void: its owner can still change it until the new ballot lock, and it stays void
// (adding nothing) until the admin restores it. Owners are not told a ballot is void before publishing, and it
// still shows as submitted. Both are refused for a rehearsal (rehearsal.ts).
import { sql, type SQL } from 'drizzle-orm';
import { VOID_REASON_LENGTH, type AwardVoteState } from './model';
import type { AwardVotePorts } from './ports';
import { rehearsalRefusal, type RehearsalRefusal } from './rehearsal';
import { replaceTallies } from './tally';

export interface VoidBallotInput {
    seasonYear: number;
    franchiseId: number;
    /** why the ballot is void; trimmed */
    reason: unknown;
}

export interface RestoreBallotInput {
    seasonYear: number;
    franchiseId: number;
}

/** why a ballot can't be voided or restored now, whichever is asked */
type WindowRejection =
    | 'published'
    /** the franchise has no submitted ballot */
    | 'no-ballot';

export type VoidBallotRejection = RehearsalRefusal | WindowRejection
    /** never opened, or open with the ballot lock still ahead */
    | 'not-locked'
    /** empty once trimmed, or longer than VOID_REASON_LENGTH */
    | 'invalid-reason'
    | 'already-void';

export type RestoreBallotRejection = RehearsalRefusal | WindowRejection
    /** the ballot counts already */
    | 'not-void';

export type VoidBallotResult = { ok: true } | { ok: false; reason: VoidBallotRejection };
export type RestoreBallotResult = { ok: true } | { ok: false; reason: RestoreBallotRejection };

/** what voiding or restoring does to the franchise's ballot */
interface Change<Closed extends string> {
    /** when the award vote `v` allows it */
    window: SQL;
    /** why it is refused outside its window, before publishing */
    closed: Closed;
    /** the ballot's state that the change needs: counting to void it, void to restore it */
    needsVoid: boolean;
    /** the columns it sets */
    set: SQL;
    /** which ballots (`b`) count once it is made, as replaceTallies takes them */
    counts: (franchiseId: number) => SQL;
}

const VOIDING = (reason: string): Change<'not-locked'> => ({
    // once ballots have stopped changing: open with the ballot lock passed, or scored
    window: sql`not v.rehearsal and (v.state = 'scored' or (v.state = 'open' and clock_timestamp() >= v.ballot_lock))`,
    closed: 'not-locked',
    needsVoid: false,
    set: sql`void_reason = ${reason}, voided_at = clock_timestamp()`,
    counts: franchiseId => sql`b.void_reason is null and b.franchise_id <> ${franchiseId}::int`,
});

const RESTORING: Change<'no-ballot'> = {
    // any time before publishing; never opened means no submitted ballot
    window: sql`not v.rehearsal and v.state in ('open', 'scored')`,
    closed: 'no-ballot',
    needsVoid: true,
    set: sql`void_reason = null, voided_at = null`,
    counts: franchiseId => sql`b.void_reason is null or b.franchise_id = ${franchiseId}::int`,
};

/** why the change can't be made to `franchiseId`'s ballot now ('wrong-state' when the ballot is already as it would leave it), or null */
async function refusal<Closed extends string>(db: AwardVotePorts['db'], seasonYear: number, franchiseId: number, change: Change<Closed>)
    : Promise<WindowRejection | Closed | 'wrong-state' | null> {
    const [found] = await db.rows<{ state: AwardVoteState; changeable: boolean; submitted: boolean; void: boolean }>(sql`
        select v.state, ${change.window} as changeable,
               coalesce(b.submitted is not null, false) as submitted, coalesce(b.void_reason is not null, false) as void
        from league.award_votes v
        left join league.award_vote_ballots b on b.season_year = v.season_year and b.franchise_id = ${franchiseId}::int
        where v.season_year = ${seasonYear}::int`);
    if (found?.state === 'published') return 'published';
    if (!found?.changeable) return change.closed;
    if (!found.submitted) return 'no-ballot';
    return found.void === change.needsVoid ? null : 'wrong-state';
}

/** makes `change` to `franchiseId`'s ballot, recomputing the tallies if the vote is scored; or says why not */
async function changeBallot<Closed extends string>(db: AwardVotePorts['db'], seasonYear: number, franchiseId: number, change: Change<Closed>) {
    const refused = await refusal(db, seasonYear, franchiseId, change);
    if (refused) return refused;
    // one statement: the ballot changes only while changeable, and a scored vote's tallies are recomputed with it
    const changed = await db.rows(sql`
        with changed as (
            update league.award_vote_ballots b set ${change.set}
            from league.award_votes v
            where b.season_year = ${seasonYear}::int and b.franchise_id = ${franchiseId}::int and b.submitted is not null
              and (b.void_reason is not null) = ${change.needsVoid} and v.season_year = b.season_year and ${change.window}
            returning v.state
        ), scored as (select 1 from changed where state = 'scored'),
        ${replaceTallies(seasonYear, sql`scored`, change.counts(franchiseId))}
        select 1 from changed`);
    if (changed.length) return null;
    return (await refusal(db, seasonYear, franchiseId, change)) ?? change.closed;
}

export function createVoidBallot({ db }: AwardVotePorts) {
    return async function voidBallot(input: VoidBallotInput): Promise<VoidBallotResult> {
        const { seasonYear, franchiseId } = input;
        const rehearsal = await rehearsalRefusal(db, seasonYear);
        if (rehearsal) return { ok: false, reason: rehearsal };
        const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
        if (!reason || reason.length > VOID_REASON_LENGTH) return { ok: false, reason: 'invalid-reason' };
        const refused = await changeBallot(db, seasonYear, franchiseId, VOIDING(reason));
        if (!refused) return { ok: true };
        return { ok: false, reason: refused === 'wrong-state' ? 'already-void' : refused };
    };
}

export function createRestoreBallot({ db }: AwardVotePorts) {
    return async function restoreBallot({ seasonYear, franchiseId }: RestoreBallotInput): Promise<RestoreBallotResult> {
        const rehearsal = await rehearsalRefusal(db, seasonYear);
        if (rehearsal) return { ok: false, reason: rehearsal };
        const refused = await changeBallot(db, seasonYear, franchiseId, RESTORING);
        if (!refused) return { ok: true };
        return { ok: false, reason: refused === 'wrong-state' ? 'not-void' : refused };
    };
}
