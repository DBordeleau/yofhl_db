// The season the season sync writes: the live season (the latest season year in the Fantrax team mapping), when
// the season import has opened it in the archive.
import { sql } from 'drizzle-orm';
import { rows } from '@/lib/data/db';

export interface OpenedSeason {
    seasonYear: number;
    leagueId: string;
    /** each mapped Fantrax team, its franchise and that franchise's team season (null when it has none) */
    teams: { fantraxTeamId: string; franchiseId: number; teamSeasonId: number | null }[];
    /** when the season sync froze the season, or null */
    frozenAt: string | null;
}

/** the live season's year, and the season itself when it is opened in the archive */
export async function readOpenedSeason(): Promise<{ seasonYear: number | null; season: OpenedSeason | null }> {
    const teams = await rows<{ seasonYear: number; leagueId: string; fantraxTeamId: string; franchiseId: number; teamSeasonId: number | null; opened: boolean; frozenAt: number | null }>(sql`
        select ft.season_year as "seasonYear", ft.fantrax_league_id as "leagueId", ft.fantrax_team_id as "fantraxTeamId",
               ft.franchise_id as "franchiseId", t.id as "teamSeasonId", s.year is not null as opened,
               (extract(epoch from st.frozen_at) * 1000)::float8 as "frozenAt"
        from league.fantrax_teams ft
        left join league.seasons s on s.year = ft.season_year
        left join league.team_seasons t on t.season_year = ft.season_year and t.franchise_id = ft.franchise_id
        left join league.season_sync_status st on st.season_year = ft.season_year
        where ft.season_year = (select max(season_year) from league.fantrax_teams)
        order by ft.fantrax_team_id`);
    if (!teams.length) return { seasonYear: null, season: null };
    const [{ seasonYear, leagueId, opened, frozenAt }] = teams;
    if (!opened) return { seasonYear, season: null };
    return {
        seasonYear,
        season: { seasonYear, leagueId, frozenAt: frozenAt === null ? null : new Date(frozenAt).toISOString(), teams: teams.map(({ fantraxTeamId, franchiseId, teamSeasonId }) => ({ fantraxTeamId, franchiseId, teamSeasonId })) },
    };
}
