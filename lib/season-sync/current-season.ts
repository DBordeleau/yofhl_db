// The season the season sync writes: the live season (the latest season year in the Fantrax team mapping), once
// the season import has opened it in the archive, where it is the current season (GLOSSARY.md).
import { sql } from 'drizzle-orm';
import { rows } from '@/lib/data/db';
import { LIVE_SEASON_YEAR } from '@/lib/fantrax/live-season-year';
import { epochMs } from './status';

/** a mapped Fantrax team, its franchise and that franchise's team season (null when it has none) */
export interface CurrentSeasonTeam {
    fantraxTeamId: string;
    franchiseId: number;
    teamSeasonId: number | null;
}

export interface CurrentSeason {
    seasonYear: number;
    leagueId: string;
    teams: CurrentSeasonTeam[];
    /** when the season sync froze the season, or null */
    frozenAt: string | null;
    /** when the last successful sync ran, or null if no run has succeeded yet */
    lastSuccessAt: string | null;
    /** the last run's error, or null if the last run succeeded or none failed */
    lastError: string | null;
    /** the mapped team with this Fantrax team ID */
    team(fantraxTeamId: string): CurrentSeasonTeam | undefined;
    /** the mapped team whose team season this is */
    teamOf(teamSeasonId: number): CurrentSeasonTeam | undefined;
    /** a mapped team's team season, or a rejection asking for the season import to open it */
    teamSeasonId(team: CurrentSeasonTeam): number;
}

function currentSeason(seasonYear: number, leagueId: string, frozenAt: string | null, lastSuccessAt: string | null,
    lastError: string | null, teams: CurrentSeasonTeam[]): CurrentSeason {
    return {
        seasonYear, leagueId, frozenAt, lastSuccessAt, lastError, teams,
        team: fantraxTeamId => teams.find(team => team.fantraxTeamId === fantraxTeamId),
        teamOf: teamSeasonId => teams.find(team => team.teamSeasonId === teamSeasonId),
        teamSeasonId: team => {
            if (team.teamSeasonId === null) throw new Error(`Franchise ${team.franchiseId} has no ${seasonYear} team season: run the season import to open it.`);
            return team.teamSeasonId;
        },
    };
}

/** the live season's year, and the season itself when it is opened in the archive */
export async function readCurrentSeason(): Promise<{ seasonYear: number | null; season: CurrentSeason | null }> {
    const teams = await rows<CurrentSeasonTeam & { seasonYear: number; leagueId: string; opened: boolean; frozenAt: number | null; lastSuccessAt: number | null; lastError: string | null }>(sql`
        select ft.season_year as "seasonYear", ft.fantrax_league_id as "leagueId", ft.fantrax_team_id as "fantraxTeamId",
               ft.franchise_id as "franchiseId", t.id as "teamSeasonId", s.year is not null as opened,
               ${epochMs(sql`st.frozen_at`)} as "frozenAt", ${epochMs(sql`st.last_success_at`)} as "lastSuccessAt",
               st.last_error as "lastError"
        from league.fantrax_teams ft
        left join league.seasons s on s.year = ft.season_year
        left join league.team_seasons t on t.season_year = ft.season_year and t.franchise_id = ft.franchise_id
        left join league.season_sync_status st on st.season_year = ft.season_year
        where ft.season_year = ${LIVE_SEASON_YEAR}
        order by ft.fantrax_team_id`);
    if (!teams.length) return { seasonYear: null, season: null };
    const [{ seasonYear, leagueId, opened, frozenAt, lastSuccessAt, lastError }] = teams;
    if (!opened) return { seasonYear, season: null };
    return {
        seasonYear,
        season: currentSeason(
            seasonYear,
            leagueId,
            frozenAt === null ? null : new Date(frozenAt).toISOString(),
            lastSuccessAt === null ? null : new Date(lastSuccessAt).toISOString(),
            lastError,
            teams.map(({ fantraxTeamId, franchiseId, teamSeasonId }) => ({ fantraxTeamId, franchiseId, teamSeasonId })),
        ),
    };
}
