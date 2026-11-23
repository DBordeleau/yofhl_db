---
status: accepted
---

# Awards are stored by catalogue ID, with no award table

The award catalogue (`lib/awards.ts`) is the only place an award is defined: its name, label, honour, description, order, art and how its winners are decided. The database keeps no copy. `league.awards` stores each individual-award winner under its catalogue ID (`'hasek'`), as the award vote tables already do, and the `award_types` table and `league.yml`'s `awards:` block are gone. Winners of the Jagr Cup, the Prime Minister's Trophy and GM of the Year are never stored as awards. They are derived from the season results, the team seasons' points and the published tallies, and the award archive (`lib/data/award-archive.ts`) is the one place that knows which source decides each award.

## Considered Options

- **Keep `award_types`, seeded from the catalogue on import**: the database would still hold a second copy of the definitions, and a new award would only work after an import. It is also half a table: it never held the team awards, which is how `/api/awards/Jagr_Cup` came to 404.
- **Keep the yml `awards:` block as a list of IDs, or generate it from the catalogue**: an ID list is still a second list that can drift, and a generated file adds a build step for something nobody edits.
- **Store team award winners in `league.awards` as well**: copies of derived winners need a sync step and go stale whenever a Final flips or points are corrected. The table is also keyed by player.

## Consequences

- `league.awards.award` has no foreign key or CHECK. The curated edits that write it reject IDs the catalogue doesn't know. The vote tables keep their CHECKs, so adding a voted award still takes a migration there.
- Nothing in the database stores a label, so a label change is a catalogue edit and needs no import.
