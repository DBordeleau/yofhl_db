# Varrock draft companion

A local app for the 2026–2027 YOFHL draft. It runs separately from the public YOFHL site and uses the dependencies already installed in this repo. It does not write to Fantrax or the league database.

Run these commands from `D:\yofhl_db`:

```powershell
npm run draft:sync
npm run draft:dev
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100). Always use the same URL and browser profile, since browser storage is specific to both. The local server must remain running. After loading data, the app does not need an internet connection during the draft.

For a production build, stop the companion development server, then run:

```powershell
npm run draft:build
npm run draft:start
```

## Data and setup

`draft:sync` uses the repo's `.env.local` database connection to read Varrock's saved 2027 keeper submission and 2026 historical statistics. It also reads the current Fantrax league, all player eligibility and availability, previous-season results, 2024–25 skater games played, and upcoming projections. NHL career participation through 2023–24 distinguishes an established player's entirely missed season from a pre-debut year. Only unique normalized names in both sources establish that participation; ambiguous matches remain unverified. Missing or changed source tables fail the sync without replacing the previous snapshot.

The private snapshot is saved in ignored `companion/.data/snapshot.json`. A subsequent sync keeps the preceding snapshot as `snapshot.previous.json`. No credentials are stored in either file. The browser receives player information, your keeper IDs and, on **Import Fantrax**, opponents' current Fantrax roster IDs; never database credentials or other owners' keeper submissions.

Greaves starts on the playing roster. Parekh starts in minors. The default targets are three LW, three C, three RW, five D and two G. The last spot can go to a forward. Multi-position keepers are assigned to separate roster slots; each player counts once. Use **Edit keepers & minors** for local adjustments. Moving to minors here is a planning choice and does not verify Fantrax eligibility or make a Fantrax transaction.

To update scoring or current free agents, run `npm run draft:sync`, then click **Reload data**. Existing browser picks and keeper edits are preserved. An imported CSV pool remains authoritative after a scoring refresh.

Completed 2024–25 and 2025–26 skater/goalie collections and NHL career participation through 2023–24 are reused from ignored `companion/.data/cache/` files. Fantrax history is keyed by league, season, position and scoring rules. Projections, availability and saved keepers still refresh on every sync. To pick up historical corrections, run `npm run draft:sync -- --refresh-history`. Failed refreshes preserve the previous cache and snapshot.

## During the draft

- Click **Import Fantrax** to load the finalized order directly. It uses `getDraftResults`' explicit overall pick numbers and team IDs, including lottery changes and traded picks, with names from `getLeagueInfo`. It does not reconstruct a snake from the base team order. **Refresh Fantrax** updates it on demand; the saved order works offline. Conflicting recorded owners, missing pick numbers and duplicate slots reject the import without changing your draft.
- **Enter manually** remains available: paste the full pick-owner sequence, one team per line, and select Varrock. Include all rounds, traded picks and any picks already recorded; numbered lines such as `12. Team name` also work.
- With an order saved, **Draft** assigns the player to the current owner and advances to the next unfilled pick. **Edit order** can change future picks or extend the order; recorded owners cannot change accidentally. Undoing an earlier pick reopens that exact slot without shifting later picks.
- Order imports retain recorded player selections. **Import Fantrax** and **Refresh** also set every opponent's keeper counts from their current Fantrax playing roster: minors are excluded, each player is assigned once to a position, and players already recorded as picks are skipped. Teams Fantrax cannot supply keep their previous counts. Fantrax player selections are not automatically imported, so a mid-draft refresh can count an unrecorded Fantrax pick as a keeper until you record it. Editing pick owners manually removes the Fantrax source label.
- Opponent keeper counts can still be adjusted in **Edit order**. Count active keepers only, assigning multi-position players once. Varrock uses the actual saved/edited roster. Teams without counts primarily draft by estimated points.
- **For Varrock** and **Best available** are separate tabs; each card's title opens its full list. For Varrock lists only players you can draft, in recommendation order. **Best available** ranks board estimates, with regular skaters compared over 84 games.
- **Best for Varrock** uses projected games for expected season points, then scores value over the post-draft waiver option and the cost of waiting until your next pick. Its card shows expected points, **vs waivers**, **if you wait** and the next two recommendations.
- **Do not draft** on a card, player row or player detail excludes that player from both top cards. They stay listed with a working **Draft** button for recording any team's pick. **Allow again** reverses the exclusion. The choice persists through reloads, data refreshes, CSV imports and backups; it does not remove the player from positional comparisons or opponent forecasts.
- Without a draft order, use **Mine** for your pick and **Taken** for anyone else's pick. Search focuses with `/`.
- **☆** on any row, card or player detail adds a target. Targets are listed in the sidebar with their survival odds; a target recorded for another team shows a warning and stays struck through in the list. **★ Targets** filters the board to them. Targets persist in backups.
- **Prospects** lists available players with fewer than 25 NHL games across 2024–25 and 2025–26 combined (a proxy for a free rookie keep), at or under the selected age, by projected points. Players with an unknown season are left out; goalie history needs a sync made after this change. **Minors** (also **Draft to minors** in player details) records your pick straight into an open minor slot, even with a full playing roster. Minor eligibility is not checked.
- **Undo** in the top bar reverses the most recent pick. The draft log also lets you undo a particular pick.
- **☀ / ☾** in the top bar switches between the dark (default) and light themes; the choice is remembered in this browser. Row controls (☆, ✕ and the pick button) stay dim until you hover a row.
- Progress saves in this browser automatically. Use **Backup** in the top bar before the draft and periodically during it. The backup contains the data snapshot, keeper edits, current pool, pick log, do-not-draft choices and targets. Older backups without exclusions remain supported.
- **Restore backup** replaces the current workspace after validating it. Before restoring over a loaded draft, the app downloads a recovery copy of that draft.

## Final available-player CSV

Use **Import Fantrax CSV**. Standard Fantrax `ID`, `Player`, `Team`, `Position`, and `Status` columns work. IDs with surrounding asterisks are normalized. If `Status` is present, FA and waiver rows are included; fantasy-team rows are excluded. An already-filtered list can omit `Status`.

The preview shows pool size, excluded keepers, excluded owned rows and newly added players. Applying it replaces the available-player pool while preserving keepers and picks. CSV FPts columns are not interpreted as projections or used to overwrite the dated scoring snapshot.

Name-only lists require an unambiguous exact normalized name. New players require a Fantrax ID, name and valid position; they remain visibly unrated. Invalid or duplicate rows reject the entire import and leave the current draft intact.

## Ranking model

The board shows **Last season**, **Projection** and **Board estimate** in YOFHL fantasy points. Estimated FP/G appears beside estimates and replacement gaps on the board, recommendation cards and player details. On the board, established skaters use 84 games for both projections and estimates; other skaters use projected games. Goalie projections use the adjustment below. Open **Scoring** for the calculation and roster priorities; click a player for raw Fantrax games and category totals, both board and recommendation estimates, and two-season games-played counts.

With at least 25 prior games, estimated points use 60% projected scoring rate and 40% previous-season rate. Smaller prior samples receive proportionally less weight. A skater qualifies for **84 games** with at least **40 NHL games in either 2024–25 or 2025–26**. Last season's stats provide a fallback count for older backups without two-season history. This is a proxy for an established role, not verified lineup status. Other skaters retain Fantrax's projected games and show **Limited NHL history**. One-game samples such as Angus Booth and Hunter McDonald are therefore not expanded to a full season.

Without a usable projected rate, an established skater uses the historical rate × 84 and is marked **History only**. Other skaters without a usable projection use last season's total without increasing the workload; absent scoring data stays unrated. An explicit zero-game projection for a skater below the threshold stays zero. Goalies retain projected appearances; without a projection they use the previous total, and an explicit zero-game goalie projection remains zero. No injury flag changes these values.

**Best for Varrock** uses the same blended scoring rate multiplied by projected NHL games for every player, including established skaters. An explicit zero-game projection gives zero expected points and no recommendation. When projected scoring is missing but projected games and a historical rate are known, that rate is multiplied by projected games. Without a usable workload projection, it uses last season's total and marks it **No projection**. These expected totals also determine Team fit sorting and the recommendation replacement bonus. The board, Best available card, positional depth and displayed Drop to next retain the board comparison.

**Injury prone** is an informational skater flag when `average(max(0, 82 - GP_2024-25), max(0, 82 - GP_2025-26)) > 10`. Exactly 10 does not trigger it. Both counts must be known; a zero in 2024–25 counts only with verified earlier NHL participation. Missing history and pre-debut years do not trigger the flag. Actual historical seasons used 82 games; this year's 84-game valuation does not change those denominators. Counts above 82 from trades are not negative absences. Games not played may reflect injuries, scratches, minor-league assignments or other causes. The flag never changes scores, projections or recommendations. Goalies are excluded because their games played depend on starter/backup roles.

Fantrax's goalie season projections apply a single season-average SV% band to projected appearances. The companion instead estimates bonuses using actual previous points minus win, shutout and overtime-loss points, divided by appearances. Samples below 25 games shrink toward the league's observed average. Projected wins and shutouts are combined with that bonus rate and an overtime-loss estimate, then blended with historical scoring rates. No matchup game cap changes goalie value.

Roster priorities follow the Fantrax daily lineup: 2 LW, 2 C, 2 RW, 4 D and 2 G start; the remaining four of 16 spots are bench. A player who adds a starter (including by moving a multi-position teammate) has slot weight 1. A bench player has slot weight 0.35 (`BENCH_WEIGHT`), an estimate of how often a bench player's games reach a daily lineup. These weights only determine recommendation order; displayed estimated points never include them.

With an order, 64 deterministic simulations forecast selections through the rest of the draft; survival odds cover your first and second upcoming picks. Known keeper counts and recorded picks adjust opponent positional preferences. Unknown rosters primarily use points, avoiding further goalies after two observed goalies. Each simulated choice samples from the best eight remaining options at each position, weighted exponentially by its points-and-needs score, with a spread of 8% of the best score (minimum 15 points). Multi-position players disappear from every pool when taken. The random seeds are fixed so filtering or reloading does not change the forecast.

**Drop to next** compares a player with the following available rated player at the same position, ordered by estimated season points. That player is named under the gap; in an all-positions list it is often not the next row. Available and Position depth share these comparisons, including players outside the top 20 and positions already filled on your roster. The Available position filter chooses the comparison role; All positions uses the assigned role, or first eligible position when no roster role is open. Search and team-fit sorting do not change the positional comparison. Equal estimates give zero drop; no following rated player gives a dash. Player details show the same position and next player as the view they were opened from. A drop of at least 15 points and at least three times the position's median adjacent gap among its top 31 players is highlighted in red.

**Drop to next FP/G** is the nonnegative season-point gap divided by **84**, for skaters and goalies alike. **Loss vs #1 FP/G** also divides the cumulative season-point loss by 84. These comparisons use a consistent season length even when the two players have different projected workloads or missing individual scoring rates. No rated alternative still displays a dash. FP/G beside a player's own estimate continues to use that player's expected games. These comparison values do not add another recommendation bonus or change rankings.

With an order, the recommendation score is `slot weight × ((expected points − waiver level) + max(0, expected points − wait level))`. The simulations continue through every remaining pick, including Varrock's. **Waiver level** is the average best expected-points player left at the assigned role after the draft; **wait level** is the average best left at that role at your next pick, or the waiver level on your last pick. The candidate is treated as yours: if a simulated team took him, it is assumed to take the next player at that role instead. Without an order, the score is `slot weight × (expected points + gap to the best other eligible player at the role)`. Do-not-draft players are excluded from recommendation candidates, alternatives, waiver and wait levels, while remaining in board comparisons and opponent forecasts. Recording an actual selection recalculates everything.

**Tiers** split each position's top 45 draft-pool players by board estimate into the fewest groups whose players are all within 20 points (`TIER_WIDTH`, about 0.24 FP/G) of the group's best; among equally few groups, boundaries go in the largest gaps. A boundary is a strong break (▼ with the drop, red line) when its gap meets the red-drop rule above; otherwise it only splits a smooth slide. Tiers include players already drafted (struck through), so membership never shifts during the draft. Each tier shows players left and, with an order, the expected number still available at your upcoming pick (or the one after, when you are on the clock), summed from the simulated survival odds; under one is red. The **Tiers** tab shows all five positions side by side with your starter count at each; a single-position **Best available** list adds tier header rows, every list shows each player's tier at the compared position, and the top cards flag the last player in a tier.

Below the tier board, **Best left** shows the average best board estimate at each position now, at your upcoming pick and at the one after; a 40-point fall between your picks is red.

The separate availability and position-depth forecasts leave your first pick in the pool, representing choosing elsewhere. Recommendation scores use these simulations through waiver and wait levels; they do not optimize a full future roster. Opponent choice weights and availability percentages are uncalibrated estimates; ADP, individual manager preferences and prospect/minor strategies are not modeled. Known keeper counts should be complete active-keeper counts, not partial counts or pre-cut Fantrax rosters.

Once two playing-roster goalies are present, more goalies are excluded from team recommendations. Players who prevent filling the remaining target slots are also excluded. The user can still make a manual selection. Raw and adjusted projections are visible in player details. Existing backups without an order remain supported; exports and refreshes preserve the new order, counts and pick ownership.

## Verification

```powershell
npm run test:companion
npx tsc --noEmit -p companion/tsconfig.json
npx eslint companion/app companion/lib companion/scripts
npm run draft:build
```

Tests cover flexible positions, minor keepers, goalie saturation, defence priority, fifth-D tradeoffs, roster completion, rate blending, goalie bonuses, duplicate picks, backup validation and CSV matching. Forecast tests cover unequal gaps, consecutive and final picks, positional cliffs, tier depletion, opponent keeper counts, multi-position depletion, repeatability and ownership-preserving corrections. Browser checks cover picks, reload persistence, undo, CSV replacement with existing picks, scoring refresh preserving the imported pool, and backup export/restore.

The Fantrax statistics endpoint is unofficial and may change. The saved snapshot and backup keep draft-night interaction independent of that endpoint. Imports and browser state are private local files; do not commit `companion/.data`.
