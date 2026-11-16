// What opening voting, moving the ballot lock and reopening share: each sets an award vote's ballot lock. Each is
// refused for a rehearsal first (rehearsal.ts), then for a ballot lock that isn't a time, then by its own check; its
// write is one update that rechecks the same conditions against the database clock, and when that update hits no
// row (something changed since the check) the check runs again to say why.
import type { SQL } from 'drizzle-orm';
import type { AwardVoteDatabase } from './ports';
import { rehearsalRefusal, type RehearsalRefusal } from './rehearsal';

/** a ballot lock as an ISO time, or null when `value` isn't a time */
export function ballotLockTime(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 40) return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** one way of setting a season's ballot lock */
export interface BallotLockChange<Rejection extends string> {
    /** why setting `ballotLock` (an ISO time) is refused now, or null when it isn't */
    refusal(seasonYear: number, ballotLock: string): Promise<Rejection | null>;
    /** the update that sets it, rechecking what `refusal` checks (and `not rehearsal`), returning a row when it did */
    write(seasonYear: number, ballotLock: string): SQL;
    /** the refusal when the update hit no row and the check finds nothing wrong */
    fallback: Rejection;
}

export type BallotLockChangeResult<Rejection extends string> = { ok: true }
    | { ok: false; reason: RehearsalRefusal | 'invalid-lock' | Rejection };

/** sets `seasonYear`'s ballot lock by `change`, or says why not */
export async function changeBallotLock<Rejection extends string>(db: AwardVoteDatabase,
    { seasonYear, ballotLock: value }: { seasonYear: number; ballotLock: unknown }, change: BallotLockChange<Rejection>)
    : Promise<BallotLockChangeResult<Rejection>> {
    const rehearsal = await rehearsalRefusal(db, seasonYear);
    if (rehearsal) return { ok: false, reason: rehearsal };
    const ballotLock = ballotLockTime(value);
    if (!ballotLock) return { ok: false, reason: 'invalid-lock' };
    const refused = await change.refusal(seasonYear, ballotLock);
    if (refused) return { ok: false, reason: refused };
    const written = await db.rows(change.write(seasonYear, ballotLock));
    if (written.length) return { ok: true };
    return { ok: false, reason: (await change.refusal(seasonYear, ballotLock)) ?? change.fallback };
}
