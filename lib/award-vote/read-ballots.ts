// The admin's read of every submitted ballot's rankings, once ballots have stopped changing: open with the ballot
// lock passed by the database clock, or scored or published. Before that (and again after reopening, until the new
// ballot lock) it is refused, so the admin votes under the same conditions as everyone else. Drafts never show.
// Admin only: its callers check who asks. Owners read only their own franchise's ballot (read-owner-ballot.ts).
import { sql } from 'drizzle-orm';
import type { BallotRankings } from './model';
import type { AwardVotePorts } from './ports';
import type { BallotStatus } from './ballot-status';

export interface ReadBallotsInput {
    seasonYear: number;
}

/** one franchise's submitted ballot, as the admin reads it */
export interface AdminBallot {
    franchise: BallotStatus['franchise'];
    /** the owner's name the site shows for the franchise, or null when it has none */
    owner: string | null;
    rankings: BallotRankings;
    submittedAt: string;
    /** why the ballot is void, or null when it counts */
    voidReason: string | null;
}

export type ReadBallotsRejection =
    /** never opened, or open with the ballot lock still ahead */
    'not-locked';

export type ReadBallotsResult = { ok: true; ballots: AdminBallot[] } | { ok: false; reason: ReadBallotsRejection };

export function createReadBallots({ db }: AwardVotePorts) {
    return async function readBallots({ seasonYear }: ReadBallotsInput): Promise<ReadBallotsResult> {
        const [vote] = await db.rows<{ settled: boolean }>(sql`
            select state in ('scored', 'published') or (state = 'open' and clock_timestamp() >= ballot_lock) as settled
            from league.award_votes where season_year = ${seasonYear}`);
        if (!vote?.settled) return { ok: false, reason: 'not-locked' };
        const found = await db.rows<AdminBallot['franchise'] & Omit<AdminBallot, 'franchise' | 'submittedAt'> & { submittedAt: number }>(sql`
            select c.id, c.name, c.abbreviation, c.logo, o.name as owner, b.submitted as rankings,
                   (extract(epoch from b.submitted_at) * 1000)::float8 as "submittedAt", b.void_reason as "voidReason"
            from league.award_vote_ballots b
            join league.current_teams c on c.id = b.franchise_id
            left join league.team_seasons t on t.id = c.latest_team_season_id
            left join league.owners o on o.id = t.owner_id
            where b.season_year = ${seasonYear} and b.submitted is not null
            order by c.name, c.id`);
        return {
            ok: true,
            ballots: found.map(({ id, name, abbreviation, logo, owner, rankings, submittedAt, voidReason }) => ({
                franchise: { id, name, abbreviation, logo }, owner, rankings, submittedAt: new Date(submittedAt).toISOString(), voidReason,
            })),
        };
    };
}
