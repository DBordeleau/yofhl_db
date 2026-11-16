// The public read of one voted award's tallies, for its award page: every season whose award vote is published, newest
// first, with each ranked candidate's place, points and votes at each rank. Nothing before publishing (a scored or
// reopened vote's tallies stay the admin's, read-tallies.ts), and never a rehearsal. Cached until a vote is published.
import { sql } from 'drizzle-orm';
import { leagueTags } from '@/lib/data/cache-tags';
import { cached } from '@/lib/data/db';
import type { PlayerAwardId } from './model';
import type { AwardVotePorts } from './ports';
import type { TallyLine } from './read-tallies';

export interface ReadPublishedTalliesInput {
    award: PlayerAwardId;
}

/** one season's published tally for an award */
export interface PublishedTally {
    seasonYear: number;
    /** the ballots that counted: submitted and not void */
    counted: number;
    /** best first */
    lines: TallyLine[];
}

/** the award vote `v` is published and not a rehearsal: the only award votes the public reads see */
export const publishedVote = sql`v.state = 'published' and not v.rehearsal`;

export function createReadPublishedTallies({ db }: AwardVotePorts) {
    const read = cached(async (award: PlayerAwardId): Promise<PublishedTally[]> => {
        const found = await db.rows<TallyLine & { seasonYear: number; counted: number }>(sql`
            select t.season_year as "seasonYear",
                   (select count(*)::int from league.award_vote_ballots b
                    where b.season_year = v.season_year and b.submitted is not null and b.void_reason is null) as counted,
                   t.player_id as "playerId", coalesce(s.name, p.name, t.player_id) as name, t.points, t.votes, t.place
            from league.award_vote_tallies t
            join league.award_votes v on v.season_year = t.season_year
            left join league.award_vote_players s on s.season_year = t.season_year and s.player_id = t.player_id
            left join league.players p on p.id = t.player_id
            where t.award = ${award} and ${publishedVote}
            order by t.season_year desc, t.place, coalesce(s.name, p.name, t.player_id), t.player_id`);
        const tallies: PublishedTally[] = [];
        for (const { seasonYear, counted, playerId, name, points, votes, place } of found) {
            let tally = tallies.at(-1);
            if (tally?.seasonYear !== seasonYear) tallies.push(tally = { seasonYear, counted, lines: [] });
            tally.lines.push({ playerId, name, points, votes, place });
        }
        return tallies;
    }, 'award-vote-published-tallies', [leagueTags.awardVoteTallies]);
    return async function readPublishedTallies({ award }: ReadPublishedTalliesInput): Promise<PublishedTally[]> {
        return read(award);
    };
}
