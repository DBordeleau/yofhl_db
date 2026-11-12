---
status: accepted
---

# Player IDs are stored bare

The database stores a player ID the way Fantrax's API and every site URL write it (`02b81`), not the way Fantrax's CSV exports do (`*02b81*`). The asterisks are stripped once, where the CSVs and seed files are read, and a migration rewrote the existing keys. Before this, storage held the wrapped form and the live season, URLs, search, Coach's Corner and keepers held the bare one, so about ten places converted between them by slightly different rules and kept consistent only by comments.

## Considered Options

- **Keep wrapped storage behind a player ID module** (`fromArchive`, `fromFantrax`, `href`, `matches`): no migration, but both forms live on and every new feature has to know to go through the module.

## Consequences

- A wrapped ID anywhere past the Fantrax adapter is a bug, not a second valid form. Nothing tries to match one form against the other.
- No real player ever had both forms, so there is no tie-break between a bare and a wrapped ID.
- A live player is "in the archive" when their Player ID is a stored player. That is worked out when the live season is read, never saved in the Fantrax snapshot, so imports can't leave it stale.
- Production was migrated before the code that assumes bare IDs was merged. The code before this change already accepted bare IDs.
