import { sql } from 'drizzle-orm';

// User-requested exclusion: this ambiguous export batch combines moves across all
// 14 teams. Keep the source records, but omit it from every history feed/count.
// Match the source batch so a future reimport cannot bring it back under a new ID.
// The separate Josi trade at 3:30 PM and FA claims at 11:05 PM remain visible.
// Shared by the feed and season filters; transaction_events is aliased as e.
export const visibleTransactionEvents = sql`not (
    e.source_file = ${'2019-2020 Trades.csv'}
    and e.source_time = ${'Sun Oct 20, 2019, 11:05PM'}
)`;
