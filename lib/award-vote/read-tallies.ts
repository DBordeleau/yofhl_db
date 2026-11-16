// The admin's read of a scored award vote's tallies (tally.ts): each voted award's ranked candidates with their
// points, votes at each rank and place, best first, GM of the Year's last. Readable once scored and after publishing;
// a reopened vote's old tallies are not shown, since scoring again replaces them. Admin only: its callers check who
// asks, and it never widens what owners or the public read.
import { sql } from 'drizzle-orm';
import { GM_OF_THE_YEAR, type AwardVoteState, type CreditedTeam, type PlayerAwardId, type TeamAwardId } from './model';
import { rankedPlayerName, seasonOwner, seasonTeamColumns } from './ballot-snapshot';
import type { AwardVotePorts } from './ports';
import { countedBallot } from './tally';
import { awardDefinition, PLAYER_AWARD_RULES } from './voted-awards';

export interface ReadTalliesInput {
    seasonYear: number;
}

/** one ranked candidate in an individual award's tally */
export interface TallyLine {
    playerId: string;
    name: string;
    points: number;
    /** the votes at each rank, first place first, as deep as the award's ballot */
    votes: number[];
    /** from 1; level candidates share it, and every candidate at 1 is a winner */
    place: number;
}

/** one ranked team season in GM of the Year's tally, under that season's identity and owner */
export interface TeamTallyLine extends Omit<TallyLine, 'playerId' | 'name'> {
    team: CreditedTeam;
    /** that season's owner's name, or null when the archive has none */
    owner: string | null;
}

/** an individual award's tally, best first */
export interface PlayerAwardTally {
    award: PlayerAwardId;
    label: string;
    lines: TallyLine[];
}

/** GM of the Year's tally, best first */
export interface TeamAwardTally {
    award: TeamAwardId;
    label: string;
    lines: TeamTallyLine[];
}

/** one voted award's tally */
export type AwardTally = PlayerAwardTally | TeamAwardTally;

export type ReadTalliesRejection = 'not-scored';

export type ReadTalliesResult = { ok: true; /** the ballots that counted */ counted: number; tallies: AwardTally[] }
    | { ok: false; reason: ReadTalliesRejection };

/** a TeamTallyLine as one row: the team's columns (seasonTeamColumns) beside the line's */
export type TeamTallyRow = CreditedTeam & Omit<TeamTallyLine, 'team'>;

export const teamTallyLine = ({ owner, points, votes, place, ...team }: TeamTallyRow): TeamTallyLine => ({ team, owner, points, votes, place });

export function createReadTallies({ db }: AwardVotePorts) {
    return async function readTallies({ seasonYear }: ReadTalliesInput): Promise<ReadTalliesResult> {
        const [vote] = await db.rows<{ state: AwardVoteState; counted: number }>(sql`
            select state, (select count(*)::int from league.award_vote_ballots b where b.season_year = v.season_year and ${countedBallot}) as counted
            from league.award_votes v where v.season_year = ${seasonYear}`);
        if (!vote || (vote.state !== 'scored' && vote.state !== 'published')) return { ok: false, reason: 'not-scored' };
        const [found, teams] = await Promise.all([
            db.rows<TallyLine & { award: PlayerAwardId }>(sql`
                select t.award, t.player_id as "playerId", ${rankedPlayerName(sql`t.season_year`, sql`t.player_id`)} as name, t.points, t.votes, t.place
                from league.award_vote_tallies t
                where t.season_year = ${seasonYear}
                order by t.place, name, t.player_id`),
            db.rows<TeamTallyRow>(sql`
                select ${seasonTeamColumns}, o.name as owner, t.points, t.votes, t.place
                from league.award_vote_team_tallies t
                join league.season_teams st on st.team_season_id = t.team_season_id
                ${seasonOwner}
                where t.season_year = ${seasonYear} and t.award = ${GM_OF_THE_YEAR}
                order by t.place, st.name, t.team_season_id`),
        ]);
        const tallies: AwardTally[] = PLAYER_AWARD_RULES.map(({ award }): AwardTally => ({
            award, label: awardDefinition(award).label,
            lines: found.filter(line => line.award === award)
                .map(({ playerId, name, points, votes, place }) => ({ playerId, name, points, votes, place })),
        }));
        tallies.push({
            award: GM_OF_THE_YEAR, label: awardDefinition(GM_OF_THE_YEAR).label,
            lines: teams.map(teamTallyLine),
        });
        return { ok: true, counted: vote.counted, tallies: tallies.filter(tally => tally.lines.length > 0) };
    };
}
