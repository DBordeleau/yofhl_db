---
status: accepted
---

# Curated edits are single statements, refreshed after the commit

Every curated edit (`lib/data/curated-edits.ts`) writes in one SQL statement: a CTE that deletes and inserts, or updates and upserts. Production runs on Neon's HTTP driver, which has batches but no interactive transaction. The tests run on Drizzle's PGlite driver, which has transactions but no batch. A single statement is the only atomic form both drivers run, so the path the tests prove is the path production runs.

The statements are written so their parts touch disjoint rows (a roster save deletes players who are no longer on it and inserts the new ones with `on conflict do nothing`). Postgres doesn't promise an order between the parts of one statement, so they must not depend on one.

After the write commits, the edit refreshes its materialized views in dependency order (season results before franchise records), then expires its cache tags. If a refresh fails, the tags are still expired before the error is rethrown: the data has changed, so cached pages must not keep the old version. Every admin edit fully replaces its rows, so saving again after the error is safe and finishes the refresh.

## Considered Options

- **Drizzle batches**: atomic on Neon, but PGlite has no batch, so the tests would need a different write path from production.
- **Refreshing views inside a transaction with the write**: not possible over Neon's HTTP driver, which has no interactive transaction.
- **Skipping tag expiry when a refresh fails**: leaves pages showing data the database no longer has, with nothing to tell anyone.

## Consequences

- Don't "fix" a curated edit back into a batch or a multi-statement sequence.
- A failed refresh leaves the materialized view one edit behind until the next save or import refreshes it. The admin sees an error and saves again.
