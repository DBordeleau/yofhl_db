---
status: accepted
---

# Resolve team identity in database views

A franchise's current identity (the owner's name and logo, then the latest team season's, then the franchise's own) and its season identity are resolved by two plain Postgres views, `league.current_teams` and `league.season_teams`. Every query that shows a team joins one of them instead of repeating the fallback. Before this, the fallback was copied into about ten queries and had drifted, so an owner rename showed different names on different pages.

## Considered Options

- **A shared SQL snippet pasted into each query**: still leaves every query responsible for wiring it in correctly, and the lateral join to the latest season was the part that drifted.
- **Resolve in TypeScript after fetching raw rows**: every loader would have to fetch the owner, season and franchise columns and remember to call the resolver. Sorting and filtering by the resolved name would no longer happen in SQL.
- **A materialized view**: would need a refresh after every owner edit and stores a copy. A plain view is inlined by Postgres, costs nothing extra on Neon's free tier, and shows renames immediately.

## Consequences

- Season history (standings, champions, drafts, transactions) reads `season_teams`, never `current_teams`, so old names like Hub City stay in their seasons.
- The place/nickname club name split is not part of the views. It lives in TypeScript, keyed by franchise ID.
