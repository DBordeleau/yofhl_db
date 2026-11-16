// Times the award vote's reads return, as ISO 8601 strings in UTC to the millisecond (what `Date.toISOString` gives).
import { sql, type SQL } from 'drizzle-orm';

/** the timestamptz `column` (an SQL expression) as an ISO time, or null when it is null */
export const isoTime = (column: SQL): SQL<string | null> =>
    sql<string | null>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
