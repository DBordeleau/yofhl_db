---
status: accepted
---

# Ordered writes that can't be one statement use writeInOrder

Some app writes have parts that depend on order. Scheduling a new draft lottery archives the finished one, then inserts the new one. Both compete for the one slot in the `one_current_draft_lottery` partial unique index, so the archive must free it before the insert takes it. Those writes go through `writeInOrder()` in `lib/data/db.ts`: a list of plain SQL statements, run in order, committed together, with each statement's rows returned in order.

In production it's one Neon HTTP batch, a non-interactive transaction that runs its statements in order. In tests the disposable league runs the same SQL, in the same order, through the app's redirected `execute`, between `begin` and `commit` (or `rollback`) on PGlite. So the SQL the tests prove is the SQL production runs.

[ADR 0002](0002-curated-edits-are-single-statements.md) still holds for curated edits: their parts touch disjoint rows, so they stay single statements. This ADR is only for parts whose order matters.

## Considered Options

- **One statement with a CTE**: Postgres checks a non-deferrable unique index row by row and doesn't promise an order between a statement's parts. The only way to force the archive first is to make the insert read the archive's output, which is exactly the dependence on order ADR 0002 rules out.
- **Drizzle batches of query builders** (what the lottery save did before): PGlite has no batch, so that path never ran in a test. Standing in for one would mean compiling builders and reproducing Drizzle's result mapping in the test seam.
- **A deferrable unique index**: a schema change to work around a write path, and it would hide the refusal to replace a live lottery until commit.

## Consequences

- A write that can't be a single statement because its parts depend on order goes through `writeInOrder()`. Don't reach for `getDb().batch` directly.
- `writeInOrder()` takes plain SQL only, so the league's stand-in never needs Drizzle's builders.
- Don't "fix" the lottery save back into one statement, and don't move a curated edit onto `writeInOrder()`.
