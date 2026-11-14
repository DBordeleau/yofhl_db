// The season sync's status row (league.season_sync_status), one per season year: what its runs last did. The
// successful write records itself (write.ts); a failed run and the freeze are recorded here. Kept free of Next
// imports so the admin page's read and any script can share the query.
import { sql } from 'drizzle-orm';

/** how many rows of each kind a run changed */
export interface SyncCounts {
    playerSeasons: number;
    teamSeasons: number;
    playoffGames: number;
    /** championship roster players added or removed */
    championshipRoster: number;
}

export interface SeasonSyncStatus {
    seasonYear: number;
    lastRunAt: string;
    lastSuccessAt: string | null;
    /** the last run's error; cleared by the next success */
    lastError: string | null;
    /** what the last successful run changed */
    changed: SyncCounts;
    /** the last successful run's warnings */
    warnings: string[];
    frozenAt: string | null;
    /** the franchise the season sync wrote an automatic championship roster for, until it is saved in admin */
    autoRosterFranchiseId: number | null;
}

const iso = (time: number) => new Date(time).toISOString();

/** a run that failed before it wrote: the error, leaving the last success's counts and warnings in place */
export const failedRunQuery = (seasonYear: number, now: number, error: string) => sql`
    insert into league.season_sync_status (season_year, last_run_at, last_error) values (${seasonYear}, ${iso(now)}::timestamptz, ${error})
    on conflict (season_year) do update set last_run_at = excluded.last_run_at, last_error = excluded.last_error`;

/** the run that froze the season: nothing else is written for it again */
export const freezeQuery = (seasonYear: number, now: number) => sql`
    insert into league.season_sync_status (season_year, last_run_at, frozen_at) values (${seasonYear}, ${iso(now)}::timestamptz, ${iso(now)}::timestamptz)
    on conflict (season_year) do update set last_run_at = excluded.last_run_at, frozen_at = excluded.frozen_at`;

const epoch = (column: string) => sql`(extract(epoch from ${sql.identifier(column)}) * 1000)::float8`;

/** every season's status row, newest first, with times as epoch milliseconds (see `toSeasonSyncStatus`) */
export const SEASON_SYNC_STATUS_QUERY = sql`
    select season_year as "seasonYear", ${epoch('last_run_at')} as "lastRunAt", ${epoch('last_success_at')} as "lastSuccessAt",
           last_error as "lastError", changed_player_seasons as "playerSeasons", changed_team_seasons as "teamSeasons",
           changed_playoff_games as "playoffGames", changed_championship_roster as "championshipRoster", warnings,
           ${epoch('frozen_at')} as "frozenAt", auto_roster_franchise_id as "autoRosterFranchiseId"
    from league.season_sync_status order by season_year desc`;

export type SeasonSyncStatusRow = {
    seasonYear: number; lastRunAt: number; lastSuccessAt: number | null; lastError: string | null;
    playerSeasons: number; teamSeasons: number; playoffGames: number; championshipRoster: number; warnings: string[];
    frozenAt: number | null; autoRosterFranchiseId: number | null;
};

export const toSeasonSyncStatus = (row: SeasonSyncStatusRow): SeasonSyncStatus => ({
    seasonYear: row.seasonYear,
    lastRunAt: iso(row.lastRunAt),
    lastSuccessAt: row.lastSuccessAt === null ? null : iso(row.lastSuccessAt),
    lastError: row.lastError,
    changed: { playerSeasons: row.playerSeasons, teamSeasons: row.teamSeasons, playoffGames: row.playoffGames, championshipRoster: row.championshipRoster },
    warnings: row.warnings,
    frozenAt: row.frozenAt === null ? null : iso(row.frozenAt),
    autoRosterFranchiseId: row.autoRosterFranchiseId,
});
