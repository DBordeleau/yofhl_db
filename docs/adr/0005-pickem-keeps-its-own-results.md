---
status: accepted
---

# Pick'em keeps its own record of each week

Pick'em stores, for every locked week, the pairings its picks were made against and, once the week's stat-correction window closes, each matchup's result. It does not read past results from the live season or from the archive's `matchups` table. Until the window closes a week's results come from the live season, so they follow corrections; after it they are frozen and never recomputed.

The live season can't be the record: regular-season pairings and scores exist only in the one Fantrax snapshot row, which is overwritten on every capture and belongs to a different season by the next autumn. A past season's Pick'em leaderboard has to stay viewable, and money rides on the result not shifting after the fact.

## Considered Options

- **Derive everything from the live season on read**: no new storage, but the leaderboard disappears when the snapshot moves to the next season, and a late Fantrax change could rewrite a settled week.
- **Store regular-season matchups in the archive's `matchups` table** (its `stage` column leaves room for them): its rows reference team seasons, which only exist once a finished season has been imported, so it can't hold a season in progress. The season import also replaces a season's rows wholesale, which would put Pick'em's settled results at the mercy of a re-import.

## Consequences

- Pick'em's pairings and results are keyed by season year, week and franchise, not by team season or Fantrax team ID.
- Freezing rides the existing evening Fantrax refresh. Pick'em adds no scheduled job; the lock itself is a clock check on write and on read.
- If regular-season matchups are ever imported into the archive, the two records will overlap. Pick'em's stays the one its leaderboard is scored from.
