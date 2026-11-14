// Team seasons: each team season's record and points straight from Fantrax's standings table, with no
// calculation here. Division is 1 and the division rank is the table's rank. A team season's name, owner, logo
// and abbreviation belong to the league configuration and are never written by the season sync.
import { sql } from 'drizzle-orm';
import type { CurrentSeason } from './current-season';
import type { FantraxStanding } from './ports';
import type { SyncWrite } from './write';

export interface TeamSeasonStanding {
    teamSeasonId: number;
    division: number;
    divisionRank: number;
    wins: number;
    losses: number;
    ties: number;
    fptsFor: number;
    fptsAgainst: number;
}

/** The current season's team seasons from Fantrax's standings, or a rejection unless the table covers exactly its teams. */
export function teamSeasonStandings(season: CurrentSeason, standings: FantraxStanding[]): TeamSeasonStanding[] {
    const unmapped = standings.find(row => !season.team(row.teamId));
    if (unmapped) throw new Error(`Fantrax's standings have team ${unmapped.teamId}, which the league configuration does not map for ${season.seasonYear}.`);
    return season.teams.map(team => {
        const rows = standings.filter(row => row.teamId === team.fantraxTeamId);
        if (rows.length !== 1) throw new Error(`Fantrax's standings have team ${team.fantraxTeamId} ${rows.length} times.`);
        const [row] = rows;
        return { teamSeasonId: season.teamSeasonId(team), division: 1, divisionRank: row.rank, wins: row.wins, losses: row.losses, ties: row.ties,
            fptsFor: row.pointsFor, fptsAgainst: row.pointsAgainst };
    });
}

/** rewrites a team season's standings only where a value differs; one row returned per team season changed */
export const teamSeasonsWrite = (seasonYear: number, standings: TeamSeasonStanding[]): SyncWrite => ({
    count: 'teamSeasons',
    change: 'stats',
    statement: sql`
        update league.team_seasons t
        set division = s.division, division_rank = s."divisionRank", wins = s.wins, losses = s.losses, ties = s.ties,
            fpts_for = round(s."fptsFor", 2), fpts_against = round(s."fptsAgainst", 2)
        from jsonb_to_recordset(${JSON.stringify(standings)}::jsonb) as s("teamSeasonId" int, division smallint, "divisionRank" smallint,
             wins smallint, losses smallint, ties smallint, "fptsFor" numeric, "fptsAgainst" numeric)
        where t.id = s."teamSeasonId" and t.season_year = ${seasonYear}
          and (t.division, t.division_rank, t.wins, t.losses, t.ties, t.fpts_for, t.fpts_against)
              is distinct from (s.division, s."divisionRank", s.wins, s.losses, s.ties, round(s."fptsFor", 2), round(s."fptsAgainst", 2))
        returning t.id`,
});
