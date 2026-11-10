---
status: accepted
---

# The season import is one transaction

The season import (`scripts/db/lib/season-import.ts`) validates everything first, then writes the league configuration, Fantrax teams, every season, the legacy seeds, history and the materialized view refreshes in one interactive transaction. A failure anywhere in that run, including one that only shows up during legacy seeding after the seasons are written, leaves the database as it was. The helpers that open their own transaction (a season's replacement, Fantrax teams, history) nest inside it as savepoints. Migrations and the NHL draft-facts fetch run before it, outside, and the script asks the site to clear its cache after it commits.

This is possible because the import runs from a script, on postgres-js against Neon or on PGlite locally, and both drivers have interactive transactions. Curated edits can't do the same: the web app reaches Neon over its HTTP driver, which has no interactive transaction, so each curated edit is a single statement refreshed after the commit ([ADR 0002](0002-curated-edits-are-single-statements.md)).

## Considered Options

- **Separate steps, each committed on its own** (what the import did before): a late failure left the league configuration, Fantrax teams and some seasons committed with the views not refreshed, and the admin had to work out which steps had landed.
- **Single statements, as curated edits use**: a whole season's replacement and its history don't fit in one statement, and the scripts' drivers don't need the restriction.

## Consequences

- Don't converge the two write paths. Rewriting the import as single statements loses the all-or-nothing run; giving curated edits a transaction doesn't work over Neon's HTTP driver.
- Every validation, including the check that each ring and award player is in the season's player export, runs before the transaction, so validation errors are reported as a list rather than by rolling back.
- Anything that talks to the network stays outside the transaction, so it isn't held open on a slow NHL lookup.
- The import holds one transaction for the length of a run. The view refreshes take their locks only at the end, as before.
