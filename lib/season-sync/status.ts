// The season sync's status row (league.season_sync_status), one per season year: what its runs last did. The
// successful write records itself (write.ts); a failed run and the freeze are recorded here. Kept free of Next
// imports so the admin page's read and any script can share the query.
import { sql, type SQL } from 'drizzle-orm';

/** how many rows of each kind a run changed */
export interface SyncCounts {
    playerSeasons: number;
    teamSeasons: number;
    playoffGames: number;
    /** championship roster players added or removed */
    championshipRoster: number;
    regularSeasonGames: number;
    /** weeks added or whose dates changed */
    weeks: number;
}

/** each count's column on the status row */
export const COUNT_COLUMNS: Record<keyof SyncCounts, string> = {
    playerSeasons: 'changed_player_seasons',
    teamSeasons: 'changed_team_seasons',
    playoffGames: 'changed_playoff_games',
    championshipRoster: 'changed_championship_roster',
    regularSeasonGames: 'changed_regular_season_games',
    weeks: 'changed_weeks',
};
const COUNTS = Object.keys(COUNT_COLUMNS) as (keyof SyncCounts)[];

/** the status row's counts, each under its SyncCounts name */
export const countsSelection = sql.join(COUNTS.map(count => sql`${sql.identifier(COUNT_COLUMNS[count])} as ${sql.identifier(count)}`), sql`, `);

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

/** a timestamptz as epoch milliseconds, which PGlite and Neon return alike (they differ on timestamptz itself) */
export const epochMs = (column: SQL) => sql`(extract(epoch from ${column}) * 1000)::float8`;
const epoch = (column: string) => epochMs(sql`${sql.identifier(column)}`);

/** every season's status row, newest first, with times as epoch milliseconds (see `toSeasonSyncStatus`) */
export const SEASON_SYNC_STATUS_QUERY = sql`
    select season_year as "seasonYear", ${epoch('last_run_at')} as "lastRunAt", ${epoch('last_success_at')} as "lastSuccessAt",
           last_error as "lastError", ${countsSelection}, warnings,
           ${epoch('frozen_at')} as "frozenAt", auto_roster_franchise_id as "autoRosterFranchiseId"
    from league.season_sync_status order by season_year desc`;

export type SeasonSyncStatusRow = SyncCounts & {
    seasonYear: number; lastRunAt: number; lastSuccessAt: number | null; lastError: string | null; warnings: string[];
    frozenAt: number | null; autoRosterFranchiseId: number | null;
};

function countsOf(row: SyncCounts): SyncCounts {
    const counts = {} as SyncCounts;
    for (const count of COUNTS) counts[count] = row[count];
    return counts;
}

export const toSeasonSyncStatus = (row: SeasonSyncStatusRow): SeasonSyncStatus => ({
    seasonYear: row.seasonYear,
    lastRunAt: iso(row.lastRunAt),
    lastSuccessAt: row.lastSuccessAt === null ? null : iso(row.lastSuccessAt),
    lastError: row.lastError,
    changed: countsOf(row),
    warnings: row.warnings,
    frozenAt: row.frozenAt === null ? null : iso(row.frozenAt),
    autoRosterFranchiseId: row.autoRosterFranchiseId,
});
