// The season the season sync writes: the live season (the latest season year in the Fantrax team mapping), once
// the season import has opened it in the archive, where it is the current season (GLOSSARY.md), until the season
// sync freezes it.
import { sql } from 'drizzle-orm';
import { cached, rows } from '@/lib/data/db';
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
    /** the mapped team with this Fantrax team ID */
    team(fantraxTeamId: string): CurrentSeasonTeam | undefined;
    /** the mapped team whose team season this is */
    teamOf(teamSeasonId: number): CurrentSeasonTeam | undefined;
    /** a mapped team's team season, or a rejection asking for the season import to open it */
    teamSeasonId(team: CurrentSeasonTeam): number;
}

function currentSeason(seasonYear: number, leagueId: string, teams: CurrentSeasonTeam[]): CurrentSeason {
    return {
        seasonYear, leagueId, teams,
        team: fantraxTeamId => teams.find(team => team.fantraxTeamId === fantraxTeamId),
        teamOf: teamSeasonId => teams.find(team => team.teamSeasonId === teamSeasonId),
        teamSeasonId: team => {
            if (team.teamSeasonId === null) throw new Error(`Franchise ${team.franchiseId} has no ${seasonYear} team season: run the season import to open it.`);
            return team.teamSeasonId;
        },
    };
}

/** the live season as the season sync sees it: not opened in the archive (or no live season), frozen, or being played */
export type CurrentSeasonState =
    | { state: 'not-opened'; seasonYear: number | null }
    | { state: 'frozen'; seasonYear: number; frozenAt: string }
    | { state: 'in-play'; season: CurrentSeason };

type TeamRow = CurrentSeasonTeam & { seasonYear: number; leagueId: string; opened: boolean; frozenAt: number | null };

/** carries a season being played out of the cached read, so that answer is never cached */
class UncacheableSeasonInPlay extends Error {
    constructor(readonly teams: TeamRow[]) { super('The live season is being played'); }
}

// Not opened and frozen are cached until the league configuration changes (opening a season clears every cached
// league read), so the season sync's later runs answer them without a query. A season being played rejects, which
// unstable_cache never stores, so each of its runs reads its teams and frozen mark afresh; and once the run that
// freezes it reads it again, frozen is the answer cached. This relies on unstable_cache never storing a rejection:
// if it did, a season being played would be stuck on its first run's answer.
const readSettledSeason = cached(async (): Promise<Exclude<CurrentSeasonState, { state: 'in-play' }>> => {
    const teams = await rows<TeamRow>(sql`
        select ft.season_year as "seasonYear", ft.fantrax_league_id as "leagueId", ft.fantrax_team_id as "fantraxTeamId",
               ft.franchise_id as "franchiseId", t.id as "teamSeasonId", s.year is not null as opened,
               ${epochMs(sql`st.frozen_at`)} as "frozenAt"
        from league.fantrax_teams ft
        left join league.seasons s on s.year = ft.season_year
        left join league.team_seasons t on t.season_year = ft.season_year and t.franchise_id = ft.franchise_id
        left join league.season_sync_status st on st.season_year = ft.season_year
        where ft.season_year = ${LIVE_SEASON_YEAR}
        order by ft.fantrax_team_id`);
    if (!teams.length) return { state: 'not-opened', seasonYear: null };
    const [{ seasonYear, opened, frozenAt }] = teams;
    if (!opened) return { state: 'not-opened', seasonYear };
    if (frozenAt !== null) return { state: 'frozen', seasonYear, frozenAt: new Date(frozenAt).toISOString() };
    throw new UncacheableSeasonInPlay(teams);
}, 'season-sync-current-season-v1');

/** the live season as the season sync sees it, with its mapped teams while it is being played */
export async function readCurrentSeason(): Promise<CurrentSeasonState> {
    try {
        return await readSettledSeason();
    } catch (error) {
        if (!(error instanceof UncacheableSeasonInPlay)) throw error;
        const [{ seasonYear, leagueId }] = error.teams;
        return {
            state: 'in-play',
            season: currentSeason(seasonYear, leagueId, error.teams.map(({ fantraxTeamId, franchiseId, teamSeasonId }) => ({ fantraxTeamId, franchiseId, teamSeasonId }))),
        };
    }
}
