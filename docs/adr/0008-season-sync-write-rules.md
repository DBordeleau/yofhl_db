---
status: accepted
---

# The season sync's write rules

The season sync (`lib/season-sync/`) writes the season being played into the archive every morning, alongside data the league owner curates and data the season import replaces. It writes each team season's standings, each player season with its skater categories, every week of the season with its dates, each final regular-season week's games, each final playoff round's championship games and the automatic championship roster. Five rules decide what it may write, so it can run unattended all season without undoing anyone's work or storing a half-read Fantrax response.

1. **The league configuration owns season identity.** The season import opens the season, creating its team seasons with the name, owner, logo and abbreviation of each franchise's era in `league.yml`. The season sync writes standings, never identity, so an owner renaming their Fantrax team mid-season doesn't change the archive's season identity.
2. **A failed run writes nothing.** Every Fantrax read is made and checked before anything is written, then every part is written in one statement with the status row ([ADR 0002](0002-curated-edits-are-single-statements.md)). A failed or invalid read, a failed check or a failed write records only the error on the status row; yesterday's numbers stay and the next run catches up.
3. **Curated data is never overwritten.** Awards, bracket corrections and saved championship rosters are the league owner's. A saved bracket correction still decides the winner of a game the sync writes, as it does after an import.
4. **A game freezes with its correction window.** A game, regular-season or playoff, follows Fantrax's scores until its week's seven-day correction window closes and is never rewritten after. Seven days after the season's last week ends, the whole season freezes and the sync stops writing it.
5. **An automatic championship roster is replaced only while untouched.** The sync writes the roster when the season has a champion and no roster, and records the franchise it was written for. Saving the roster in admin clears that record. If the Final flips inside its correction window, a roster still on record is replaced with the new champion's; a saved one is left alone and every run warns until it is saved again.

[ADR 0004](0004-season-import-is-one-transaction.md) is unchanged: the season import is still one transaction and still replaces a season, so it is the repair path for a season the sync got wrong.

## Considered Options

- **Run the season import daily from Fantrax instead of CSVs**: the import replaces a season wholesale in an interactive transaction, which the web app's Neon HTTP driver can't open, and its replace would rebuild every row (and refresh every view) each morning even when nothing changed.
- **Take team names and logos from Fantrax**: Fantrax's names are whatever the owner typed most recently, so the season identity would drift through the season and differ from the era the league configuration records.
- **Write each part as it is read**: a Fantrax outage partway through would leave standings from today and player seasons from yesterday, and the league owner would have to work out which parts had landed.
- **Keep rewriting scores until the season is replaced**: three past seasons had Fantrax retroactively change earlier playoff scores after the Final (the goalie-start cap). Freezing each game with its window stores the settled score and keeps a later rescoring from rewriting history; regular-season games freeze the same way.
- **Never replace a championship roster once written**: a stat correction that flips the Final inside its window would leave rings with the wrong team. **Always replace it when the champion changes**: that would undo a roster the league owner has already trimmed.
- **Decide the roster from what a run changed rather than what is stored**: a level Final gets its winner from bracket review between runs, so the next run sees no change and would never write the roster.

## Consequences

- The season sync must not write a team season's identity, an award, a bracket correction or a saved roster. A new part goes through the same read-check-write run and adds its rows to the one statement, or to an ordered write ([ADR 0007](0007-ordered-writes-use-write-in-order.md)) if its order matters.
- A season import of the season being played lasts only where it agrees with Fantrax until the season freezes.
- Skater categories come from one more Fantrax read each run, Fantrax's skater table, made and checked with the others before any write. They are written onto the player seasons the keep rule already keeps, in the player season part of the one statement; skater categories never create a player season. A goalie's are null, as is every season's before 2027.
- Games played come from the skater table and one more read, Fantrax's goalie table, checked with the others before any write, and are compared like any other player-season field. Unlike skater categories they can create a player season: the keep rule keeps a player with games played, and one Fantrax's player table doesn't list (no points, no roster spot) is named from Fantrax's player directory. See [ADR 0010](0010-games-played-from-fantrax.md).
- The league configuration's `scoreOverrides` stay import-only; the sync's guard against Fantrax rescoring is the freeze.
- The status row carries two franchise columns, the automatic roster's champion and the champion the roster was last saved for, and the roster editor's save updates both.
