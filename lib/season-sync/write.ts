// The season sync's one write. Each part is a data-modifying statement that changes a row only when a value
// differs and returns one row per row it changed; the parts touch disjoint rows, so they run as CTEs of a single
// statement with their rows as a JSON payload (ADR 0002), and the status row is written by the same statement
// with each part's count. Either everything lands or nothing does.
import { sql, type SQL } from 'drizzle-orm';
import type { SeasonSyncChange } from '@/lib/data/cache-tags';
import { COUNT_COLUMNS, countsSelection, type SyncCounts } from './status';

export interface SyncWrite {
    /** the status count its changed rows add to; null for rows that always change with rows another part counts */
    count: keyof SyncCounts | null;
    /** the kind of change, for the views to refresh and tags to expire when it changes a row */
    change: SeasonSyncChange;
    /** a data-modifying statement returning one row per row it changed, or a query counting rows that other parts change */
    statement: SQL;
}

export interface SyncRunWrite {
    writes: SyncWrite[];
    warnings: string[];
    /** the champion an automatic championship roster is written for in this run, recorded on the status row */
    autoRosterFranchiseId?: number;
}

/** the writes and the run's status row as one statement, returning the counts it recorded */
export function syncWriteQuery(seasonYear: number, now: number, { writes, warnings, autoRosterFranchiseId }: SyncRunWrite): SQL {
    const at = new Date(now).toISOString();
    const part = (index: number) => sql.identifier(`part_${index}`);
    const parts = writes.map((write, index) => sql`${part(index)} as (${write.statement})`);
    const counts = (Object.keys(COUNT_COLUMNS) as (keyof SyncCounts)[]).map(count => {
        const sums = writes.flatMap((write, index) => write.count === count ? [sql`(select count(*) from ${part(index)})`] : []);
        return sums.length ? sql`(${sql.join(sums, sql` + `)})::int` : sql`0`;
    });
    const columns = sql.join(Object.values(COUNT_COLUMNS).map(column => sql.identifier(column)), sql`, `);
    // a run that writes no automatic roster leaves the record as it was
    const autoRoster = autoRosterFranchiseId === undefined ? sql`league.season_sync_status.auto_roster_franchise_id` : sql`excluded.auto_roster_franchise_id`;
    return sql`
        with ${sql.join([...parts, sql`status as (
            insert into league.season_sync_status (season_year, last_run_at, last_success_at, last_error, ${columns}, warnings, auto_roster_franchise_id)
            values (${seasonYear}, ${at}::timestamptz, ${at}::timestamptz, null, ${sql.join(counts, sql`, `)}, ${JSON.stringify(warnings)}::jsonb, ${autoRosterFranchiseId ?? null}::int)
            on conflict (season_year) do update set last_run_at = excluded.last_run_at, last_success_at = excluded.last_success_at,
                last_error = null, ${sql.join(Object.values(COUNT_COLUMNS).map(column => sql`${sql.identifier(column)} = excluded.${sql.identifier(column)}`), sql`, `)},
                warnings = excluded.warnings, auto_roster_franchise_id = ${autoRoster}
            returning ${countsSelection})`], sql`, `)}
        select * from status`;
}
