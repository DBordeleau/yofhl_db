---
status: accepted
---

# Games played is fetched from Fantrax, not worked out from FPts and FP/G

Career FP/G is career FPts ÷ career games played (GLOSSARY.md), so every player season stores its games played. The Fantrax season CSVs have no games-played column, but Fantrax's free, signed-out skater and goalie stats tables do, for every YOFHL season. 2018–19 through 2025–26's were read from them once into `league/games-played-history.json` (`scripts/export-games-played.ts`), which the season import reads, and the season sync reads the live season's from the same tables each morning. A player season with no games played stores 0 and counts toward no career.

## Considered Options

- **Work games played out as FPts ÷ FP/G**: free and needs no request, but a season's FP/G is rounded to two decimals, and on the 2018–19 to 2025–26 CSVs more than one whole number of games fits about 6–8% of scoring player seasons. It also has nothing to work from for a season with zero FPts, which is exactly the season that should lower a career FP/G.
- **Keep the mean of season FP/G values**: what the site did. A 12-game season weighs as much as an 82-game one, and seasons with zero or negative FPts were left out entirely.
- **Count only games a player was rostered or started for a fantasy team**: a different stat, which Fantrax's exports don't give either, and not what a per-game rate of a player's points means.

## Consequences

- The history file is frozen at 2025–26 and checked in, so a reimport never needs Fantrax. Later seasons' games played live only on player seasons; a reimport of a season the file doesn't cover keeps the ones the season sync wrote, as it keeps skater categories.
- The export and the season import fail when a player season with FPts has no games played, and the season sync fails a run when a scorer is in neither table, so a gap shows up as an error instead of a wrong career FP/G.
- The season sync makes one more signed-out request a run (the goalie table), and reads Fantrax's player directory when a player has games played but isn't in its player table.
- Games played is shown nowhere on the site. Single-season lists and a season's FP/G are unchanged.
