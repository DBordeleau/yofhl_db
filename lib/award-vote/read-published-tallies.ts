// The public read of one voted award's tallies, for its award page: every season whose award vote is published, newest
// first, with each ranked candidate's place, points and votes at each rank: a player, or for GM of the Year a team
// season under that season's identity and owner. Nothing before publishing (a scored or reopened vote's tallies stay
// the admin's, read-tallies.ts), and never a rehearsal. Cached until a vote is published.
import { sql } from 'drizzle-orm';
import { leagueTags } from '@/lib/data/cache-tags';
import { cached } from '@/lib/data/db';
import { GM_OF_THE_YEAR, type TeamAwardId, type VotedAwardId } from './model';
import { rankedPlayerName, seasonOwner, seasonTeamColumns } from './ballot-snapshot';
import type { AwardVotePorts } from './ports';
import { publishedVote } from './published-vote';
import { teamTallyLine, type TallyLine, type TeamTallyLine, type TeamTallyRow } from './read-tallies';
import { countedBallot } from './tally';

export interface ReadPublishedTalliesInput<Award extends VotedAwardId = VotedAwardId> {
    award: Award;
}

/** a tally line of `Award`: a team season's for GM of the Year, a player's for the rest */
export type PublishedTallyLine<Award extends VotedAwardId = VotedAwardId> = Award extends TeamAwardId ? TeamTallyLine : TallyLine;

/** one season's published tally for an award */
export interface PublishedTally<Award extends VotedAwardId = VotedAwardId> {
    seasonYear: number;
    /** the ballots that counted: submitted and not void */
    counted: number;
    /** best first */
    lines: PublishedTallyLine<Award>[];
}

type Seasonal<Row> = Row & { seasonYear: number; counted: number };

/** the ballots counted in award vote `v` */
const counted = sql`(select count(*)::int from league.award_vote_ballots b where b.season_year = v.season_year and ${countedBallot}) as counted`;

/** each season's lines, in the order they were read */
function bySeason<Row, Line>(rows: Seasonal<Row>[], line: (row: Row) => Line): { seasonYear: number; counted: number; lines: Line[] }[] {
    const tallies: { seasonYear: number; counted: number; lines: Line[] }[] = [];
    for (const { seasonYear, counted, ...row } of rows) {
        let tally = tallies.at(-1);
        if (tally?.seasonYear !== seasonYear) tallies.push(tally = { seasonYear, counted, lines: [] });
        tally.lines.push(line(row as Row));
    }
    return tallies;
}

export function createReadPublishedTallies({ db }: AwardVotePorts) {
    const read = cached(async (award: VotedAwardId): Promise<PublishedTally[]> => {
        if (award === GM_OF_THE_YEAR) return bySeason(await db.rows<Seasonal<TeamTallyRow>>(sql`
            select t.season_year as "seasonYear", ${counted}, ${seasonTeamColumns}, o.name as owner, t.points, t.votes, t.place
            from league.award_vote_team_tallies t
            join league.award_votes v on v.season_year = t.season_year
            join league.season_teams st on st.team_season_id = t.team_season_id
            ${seasonOwner}
            where t.award = ${award} and ${publishedVote}
            order by t.season_year desc, t.place, st.name, t.team_season_id`), teamTallyLine);
        return bySeason(await db.rows<Seasonal<TallyLine>>(sql`
            select t.season_year as "seasonYear", ${counted},
                   t.player_id as "playerId", ${rankedPlayerName(sql`t.season_year`, sql`t.player_id`)} as name, t.points, t.votes, t.place
            from league.award_vote_tallies t
            join league.award_votes v on v.season_year = t.season_year
            where t.award = ${award} and ${publishedVote}
            order by t.season_year desc, t.place, name, t.player_id`), ({ playerId, name, points, votes, place }) => ({ playerId, name, points, votes, place }));
    }, 'award-vote-published-tallies', [leagueTags.awardVoteTallies]);
    return async function readPublishedTallies<Award extends VotedAwardId>({ award }: ReadPublishedTalliesInput<Award>): Promise<PublishedTally<Award>[]> {
        return read(award) as Promise<PublishedTally<Award>[]>;
    };
}
