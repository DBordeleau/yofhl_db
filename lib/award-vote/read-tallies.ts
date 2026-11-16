// The admin's read of a scored award vote's tallies (tally.ts): each voted award's ranked candidates with their
// points, votes at each rank and place, best first. Readable once scored and after publishing; a reopened vote's
// old tallies are not shown, since scoring again replaces them. Admin only: its callers check who asks, and it
// never widens what owners or the public read.
import { sql } from 'drizzle-orm';
import type { AwardVoteState, PlayerAwardId } from './model';
import type { AwardVotePorts } from './ports';
import { awardDefinition, PLAYER_AWARD_RULES } from './voted-awards';

export interface ReadTalliesInput {
    seasonYear: number;
}

/** one ranked candidate in an award's tally */
export interface TallyLine {
    playerId: string;
    name: string;
    points: number;
    /** the votes at each rank, first place first, as deep as the award's ballot */
    votes: number[];
    /** from 1; level candidates share it, and every candidate at 1 is a winner */
    place: number;
}

/** one voted award's tally, best first */
export interface AwardTally {
    award: PlayerAwardId;
    label: string;
    lines: TallyLine[];
}

export type ReadTalliesRejection = 'not-scored';

export type ReadTalliesResult = { ok: true; /** the ballots that counted */ counted: number; tallies: AwardTally[] }
    | { ok: false; reason: ReadTalliesRejection };

export function createReadTallies({ db }: AwardVotePorts) {
    return async function readTallies({ seasonYear }: ReadTalliesInput): Promise<ReadTalliesResult> {
        const [vote] = await db.rows<{ state: AwardVoteState; counted: number }>(sql`
            select state, (select count(*)::int from league.award_vote_ballots b
                           where b.season_year = v.season_year and b.submitted is not null and b.void_reason is null) as counted
            from league.award_votes v where v.season_year = ${seasonYear}`);
        if (!vote || (vote.state !== 'scored' && vote.state !== 'published')) return { ok: false, reason: 'not-scored' };
        // the snapshot names the player; it is frozen once voting opens, and the archive or the ID stand in without it
        const found = await db.rows<TallyLine & { award: PlayerAwardId }>(sql`
            select t.award, t.player_id as "playerId", coalesce(s.name, p.name, t.player_id) as name, t.points, t.votes, t.place
            from league.award_vote_tallies t
            left join league.award_vote_players s on s.season_year = t.season_year and s.player_id = t.player_id
            left join league.players p on p.id = t.player_id
            where t.season_year = ${seasonYear}
            order by t.place, coalesce(s.name, p.name, t.player_id), t.player_id`);
        const tallies = PLAYER_AWARD_RULES.map(({ award }): AwardTally => ({
            award, label: awardDefinition(award).label,
            lines: found.filter(line => line.award === award)
                .map(({ playerId, name, points, votes, place }) => ({ playerId, name, points, votes, place })),
        })).filter(tally => tally.lines.length > 0);
        return { ok: true, counted: vote.counted, tallies };
    };
}
