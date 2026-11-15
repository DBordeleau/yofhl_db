// Which seasons may have an award vote, and the rehearsal (GLOSSARY.md, "Rehearsal"): the season before the live
// season, prepared and previewed like a live award vote before the first one, and never opened.
//
// The live season comes from the live season rule (lib/fantrax/live-season-year.ts), as the season sync and the
// live season read it.
//
// GUARD FOR EVERY LATER OPERATION: open, move the ballot lock, save a draft, submit, score, void, restore, reopen and
// publish must each call `rehearsalRefusal` first and refuse with its reason (`'rehearsal'`), and their write
// statements must also require `not award_votes.rehearsal`. The database backs both: the
// `award_votes_rehearsal_prepared` check rejects any rehearsal whose state is not `prepared`. Only prepare and the
// admin's reads accept a rehearsal; no read for owners or the public may return one.
import { sql } from 'drizzle-orm';
import { LIVE_SEASON_YEAR } from '@/lib/fantrax/live-season-year';
import { FIRST_AWARD_VOTE_SEASON } from './model';
import type { AwardVoteDatabase } from './ports';

/** what a season's award vote may be: a live one, a rehearsal, or none (null) */
export type AwardVoteKind = 'live' | 'rehearsal';

/** the refusal every operation past preparing gives a rehearsal */
export type RehearsalRefusal = 'rehearsal';

/** whether `seasonYear` may have a live award vote, may be rehearsed, or neither */
export async function awardVoteKind(db: AwardVoteDatabase, seasonYear: number): Promise<AwardVoteKind | null> {
    if (seasonYear >= FIRST_AWARD_VOTE_SEASON) return 'live';
    const [{ live }] = await db.rows<{ live: number | null }>(sql`select ${LIVE_SEASON_YEAR} as live`);
    return live !== null && seasonYear === live - 1 ? 'rehearsal' : null;
}

/** `'rehearsal'` when `seasonYear`'s award vote is (or would be) a rehearsal, which nothing but prepare may touch; else null */
export async function rehearsalRefusal(db: AwardVoteDatabase, seasonYear: number): Promise<RehearsalRefusal | null> {
    const [stored] = await db.rows<{ rehearsal: boolean }>(sql`select rehearsal from league.award_votes where season_year = ${seasonYear}`);
    if (stored?.rehearsal) return 'rehearsal';
    return (await awardVoteKind(db, seasonYear)) === 'rehearsal' ? 'rehearsal' : null;
}
