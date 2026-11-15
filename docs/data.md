# League data and maintenance

The current site reads PostgreSQL data from the `league` schema in Neon. The application no longer reads the old site's `public` tables. SQL migrations and Drizzle's migration log also use the `league` schema.

Seasons use the year they end in. `2026` means the 2025–26 season. Franchise IDs stay the same through renames and must not be reused. Player IDs come from Fantrax and should be URL-encoded when building links. They are stored bare (`02b81`), as Fantrax's API and the site's URLs write them. The importer strips the asterisks Fantrax's CSV exports wrap them in (`*02b81*`); any other form in a player stats or draft export stops the import with the file and row, and a lone `*` in a draft export is an empty selection. The legacy seeds and `league/nhl-player-ids.json` already hold bare IDs. See [ADR 0006](adr/0006-player-ids-are-stored-bare.md).

## Sources and ownership

| Data | Source | How it changes |
| --- | --- | --- |
| Standings, player seasons with their skater categories, weeks, regular-season games, playoff games and the championship roster of the season being played | Fantrax, through the [season sync](#season-sync) | Written every morning until the season freezes; the season import from CSVs is the repair path. The sync writes a championship roster only while the season has none, or replaces its own untouched one |
| Standings, player seasons, playoff games of earlier seasons | Fantrax season CSVs | A season import replaces that season's imported data |
| Skater categories of 2019–2026 | `lib/records/player-category-history.json`, from `scripts/export-record-player-stats.ts` | Checked in and frozen at 2026; later seasons' are in `player_seasons` |
| Franchises, identity eras, owners, logos, individual award definitions, playoff fixes, each season's Fantrax league and team IDs | [league.yml](../league/league.yml) | Every season import syncs the league configuration |
| Current team name/logo overrides, account claims and invitation codes | `/owner` and `/admin/teams` | Stored in `team_management`; preserved by imports and logo sync. See [team management](owners.md). |
| Championship rosters and individual award winners | `/admin/seasons/<end year>` | Admin edits; legacy seeds fill historical seasons with no entries. A saved roster is never overwritten by an import or the season sync |
| Bracket corrections | Admin bracket review | Saved corrections are reapplied during imports and decide the winner of a game the season sync writes |
| Trades, free-agent moves, and draft selections | Fantrax history CSVs | History imports replace supplied files or draft seasons |
| Draft lottery schedule, order, odds, and winner | `/admin/lottery` and the draw service | Stored separately from season imports; see the [lottery guide](lottery.md) |
| Trophy labels, descriptions, artwork, and stored-name aliases | [lib/awards.ts](../lib/awards.ts) | Code changes, separate from award winner records |
| Pick'em picks | `/pickem`, through the Pick'em module ([lib/pickem](../lib/pickem/)) | Owners save and clear them until each week's lock; never touched by imports |
| Pick'em record: locked weeks, their pairings and frozen results and scores, completed seasons | Pick'em settle, after each Fantrax refresh | Written once per week and never rewritten ([ADR 0005](adr/0005-pickem-keeps-its-own-results.md)); never touched by imports |

CSV exports under `data/` are local inputs, not tracked repository contents. Obtain them separately for a new checkout. Legacy award and championship-roster snapshots under `league/seed/` are tracked.

## Environment

Next.js reads local environment files during development. The database npm scripts load `.env.local` followed by `.env` using Node's environment-file flags. If a variable appears in both files, the later `.env` value wins for those scripts; an existing shell variable takes precedence. Keep database targets consistent across these sources.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL_V2` | Required by database scripts. Also takes precedence over `DATABASE_URL` in the web app |
| `DATABASE_URL` | Web-app fallback when `DATABASE_URL_V2` is absent; scripts do not use this fallback |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | The accepted admin sign-in; both are required to enable it |
| `ADMIN_SESSION_SECRET` | Signs the 12-hour admin cookie; falls back to `ADMIN_PASSWORD` when unset |
| `REVALIDATE_SECRET` | Authorizes `POST /api/revalidate` with a bearer token |
| `CRON_SECRET` | Authorizes Vercel's scheduled jobs: the evening Fantrax refreshes and the morning season sync |
| `SITE_URL` | Site whose cache import and logo-sync scripts refresh, when `REVALIDATE_SECRET` is also set |
| `YOFHL_DATA_DIR` | Optional CSV directory override; defaults to `data` |
| `YOFHL_LEAGUE_CONFIG` | Optional league configuration path; defaults to `league/league.yml` |
| `YOFHL_LIVE_API` | Base URL for the legacy `db:verify` comparison script |

Locally, settings belong in uncommitted environment files. On Vercel, configure them separately for the required deployment environments.

Use a Neon PostgreSQL connection string for the web app. Scripts also accept `DATABASE_URL_V2=pglite:.pglite` for a local database under the ignored `.pglite` directory. PGlite does not serve the website. For import rehearsals, use a separate database and leave `SITE_URL` unset so the script does not refresh a hosted site's cache.

Admin sessions use an HttpOnly cookie scoped to `/admin`, with a 12-hour expiry. Changing the signing secret invalidates existing sessions. When the password is the signing key, changing the password does the same. Each curated edit from the admin checks the session again.

## Adding a new season

A season enters the archive when it starts on Fantrax, not when it ends. The season import opens it, the [season sync](#season-sync) writes it every morning while it is played, and the league owner finishes it in admin.

At the start of the season:

1. Update the league configuration for new franchises, renamed teams, ownership changes, abbreviations, and logos. Close the previous era with `to` and add the new era with `from`. Both values are inclusive end years. The new season's team names, owners, logos and abbreviations come from these eras; neither Fantrax nor the season sync changes them.
2. Add the season's `fantrax` block under `seasons.<end year>`: the Fantrax league ID and each Fantrax team ID's franchise ID. The live season is the latest season with a `fantrax` block. The Coach's Corner fact export reads the same block straight from league.yml, without the database.
3. Review the database connection, then run the import for the season:

   ```sh
   npm run db:import -- 2027
   ```

   With no CSVs for the season, the import opens it: it loads `league.fantrax_teams` from the block, creates the season and one team season per franchise mapped in the block, with the name, owner, logo and abbreviation of the franchise's era for that year and zeroed standings. Every mapped franchise needs an era for the season, or the import stops. The opened season has no champion, so it stays unpublished (no season page, banner, picker entry or search result) and is the current season. Running the import again with no CSVs updates only those identity fields, never the standings, player seasons or playoff games the season sync has written. Without season arguments the command imports every season found in the data directory and opens every season with a `fantrax` block and no CSVs. A database migrated to 0016 (`fantrax_teams`) needs this import once, production included, or the live season is unavailable until it runs.
4. Open `/admin` and press **Sync season stats**, or wait for the next morning's run. The Season sync panel should show a successful run.

During the season there is nothing to do. The season sync writes standings and player seasons daily, then each playoff round's games, and on the night the Final ends the champion (which publishes the season) and the championship roster.

At the end of the season, open `/admin`, sign in, and select the season:

1. Enter the individual award winners.
2. Review the bracket. A level Final has no champion until its winner is set here.
3. Review the championship roster. The automatic roster includes everyone on the champion's roster outside the minors on any day of its playoff run, so remove short-stint pickups who shouldn't get a ring. Saving it makes it the league owner's: the season sync never changes it again.

Seven days after the Final ends, the season sync freezes the season and stops writing it.

### Repairing or importing a season from CSVs

The season import from Fantrax's CSV exports is the repair path for a season the season sync got wrong, and the way to load past seasons into a new database. There is no CSV step in a normal season.

1. Put the Fantrax exports in `data/`, following the existing naming convention. For the season ending in 2027, use `2026-2027 Player Stats.csv`, `2026-2027 Team Stats.csv`, and `2026-2027 Playoffs.csv`. A cancelled playoff season is recorded in `league.yml` and does not need a playoff file.
2. Review the database connection, then run `npm run db:import -- 2027`. Multiple end years are accepted. The normal importer also processes supplied history files for those seasons.
3. Resolve reported CSV/configuration mismatches before rerunning. Use `scoreOverrides` for known Fantrax playoff rescoring errors. An override with `verified: true` uses a reconstructed score and clears the public adjustment label; keep its evidence in [league/playoff-goalie-audit.json](../league/playoff-goalie-audit.json). Other overrides remain flagged placeholders. Saved admin bracket corrections are included when validating the bracket.
4. In `/admin`, check the championship roster, award winners and bracket for the season. The roster editor can start from the champion's end-of-season players, then add players dropped before the export.
5. Check the import summary and the public season page. If importing into a hosted database, confirm the site cache was refreshed.

Until a season freezes, the season sync keeps writing it from Fantrax each morning, so an import of the season being played lasts only where it agrees with Fantrax (playoff games whose correction window has closed are never rewritten). Score overrides apply only to the import.

The season import command applies migrations before it validates season data, because it reads saved bracket corrections and existing championship rosters and awards. Every validation problem is reported in one list before anything is written, including a ring or award player missing from the season's player export. The import is all or nothing ([ADR 0004](adr/0004-season-import-is-one-transaction.md)): league configuration, Fantrax teams, every season, legacy seeding, history replacement, and the materialized view refreshes are one transaction, so a failure at any point leaves the database as it was. Three things run outside it: before it, migrations (which stay applied if the import then fails) and the NHL draft-facts fetch (which writes nothing itself); after it commits, the site cache clear. This is not a dry-run command.

Reimports replace what the CSVs hold for the selected seasons: standings, player seasons and playoff games. Existing championship rosters and awards are preserved, and bracket corrections are reapplied. What only the season sync writes survives: regular-season games (with their ids), weeks, and the skater categories of every player season the import rewrites. A player season the keep rule drops is removed with its categories. A frozen season repaired this way keeps everything the season sync wrote before it froze. The legacy seeds can refill an entirely empty historical roster or award list. Lottery snapshots are not changed. Use an isolated database when checking changed exports or import code.

## Franchises, defunct teams, and logos

`folded` in `league.yml` is the last season played. Close the franchise's final era with the same `to` year. The current defunct franchises are:

| ID | Final team name | Last season |
| --- | --- | --- |
| 10 | Retro Phenoms | 2025–26 |
| 11 | Montreal Re-Habs | 2022–23 |
| 12 | North Kariya Nukes | 2022–23 |
| 14 | Johnny T & The PJs | 2025–26 |

The database stores this as `franchises.folded_after_season`. A non-null value marks a franchise defunct. The Teams page fades its card, labels it Defunct, and places it after all active teams for every sort. The selected statistic and wins tiebreaker still apply within each group. Historical profiles, stats, trophies, and transactions remain available.

Editing YAML alone does not update the hosted database. Season imports sync franchise status from the configuration. There is no dedicated franchise-status editor or sync command. A status-only database correction must also be reflected in YAML so a later import preserves it, followed by a league cache refresh.

New lottery orders include only active franchises. Existing lottery orders are saved snapshots and do not automatically remove a newly defunct team. Turning off its Lottery checkbox only removes its odds, leaving it in the full draft order. See [changes after scheduling](lottery.md#changes-after-scheduling).

Logos belong to their matching identity era. Put the files under `public/`, reference them in `league.yml`, then run:

```sh
npm run db:sync:logos
```

This updates franchise and team-season logos without reimporting stats. It checks that the configured files exist, but does not apply migrations or sync defunct status. It refreshes the site cache when `SITE_URL` and `REVALIDATE_SECRET` are configured. Regular season imports also apply the logo mappings.

Award images use a separate catalogue. See the [artwork guide](../public/trophies/README.md) before changing display labels or stored award names.

## Transaction and draft history

History files use these paths:

```text
data/transactions/YYYY-YYYY Trades.csv
data/transactions/YYYY-YYYY FA Claims.csv
data/drafts/YYYY-YYYY draft.csv
```

Validate them without connecting to a database:

```sh
npm run db:import:history -- --dry-run
```

To import all supplied history files into an existing league database:

```sh
npm run db:import:history
```

The history-only importer applies migrations, then replaces the supplied history atomically. It expects the corresponding franchises and seasons to exist, so populate a new database with the normal season importer first. Missing files do not delete archived history. This command leaves standings, awards, championship rosters, and lottery snapshots unchanged.

The parser keeps source filenames, row numbers, original timestamps, and traded-pick descriptions. It groups trades and related claim/drop rows by exact timestamp and connected franchises. Fantrax supplies no trade IDs, so separate deals involving the same teams at the same timestamp cannot be distinguished. Moves at different timestamps are not merged. The UI labels incomplete trade returns, and lineup-only rows are excluded.

Transactions have no player IDs. The importer matches normalized exact names against player-stat and draft exports, using season, NHL team, and position to resolve duplicates. Unresolved or ambiguous identities stop history preparation before database writes. Franchise names resolve through the season's configured era. A trade destination of `(Drop)` is a drop action.

Transaction timestamps use the explicit EDT/EST label in the export. Draft timestamps lack AM/PM, so only the calendar date and original text are stored. Empty draft slots remain in the archive, including the two 2019–20 slots without a recorded team. The supplied history has no 2018–19 draft export.

Draft tables show the player's full-season FPts and FP/G (to date, for the season being played), not only points earned for the drafting team. Missing stats display a dash. The exports have no games-played field, and the app does not estimate it. Career FP/G is the mean of the stored FP/G values for seasons with positive FPts, rather than a games-weighted average.

Team transaction feeds start on Trades. Player feeds include all history kinds. Each page contains ten events. Matching trades include every asset; a player's free-agent history includes only that player's claim or drop. Team pages also have a separate searchable and sortable draft section.

Historical season summaries live at `/season/<end year>`. Their Draft class section includes all recorded draft slots, historical drafting team names, player links, and full-season FPts and FP/G. Readers can search players, filter by team or round, and sort by pick order or stats. Seasons without an export show an unavailable-records message. `/season` opens the latest completed season; former `/champions` URLs permanently redirect to the corresponding season routes.

Draft regrets exclude everyone age 22 or younger on the fantasy draft date, skaters age 23–24 with fewer than 82 prior NHL regular-season games, and goalies age 23–25 with fewer than 50 prior NHL appearances. Age always uses the actual birth date and draft date. Young players remain on the board, in steals and redrafts, and among later alternatives.

Both season imports and history imports automatically prepare these facts before replacing league data. NHL birth dates, player IDs, and any required pre-draft experience are saved in `draft_picks.development_facts` in the same transaction as the picks. Reimports reuse matching facts, and subsequent seasons reuse player identities and birth dates. Only missing facts require the public NHL search and player endpoints. Rate-limited requests back off; unresolved identities or unavailable data stop the import before league data is replaced. Fix the reported record or retry the import. The history `--dry-run` remains a local CSV validation and does not fetch NHL data.

For players who share a name, `league/nhl-player-ids.json` records verified Fantrax-to-NHL identities. These IDs remain valid across seasons; this is not an annual metadata list. If a new ambiguous name stops an import, verify the correct NHL identity and add it here before retrying.

The website reads development facts through its existing draft query, with no external calls, extra database queries, scheduled jobs, or paid services. Import cache invalidation makes new seasons available without a metadata deployment. Picks without verified facts are omitted from regrets until imported successfully. Migration `0009_draft_development` adds the column and backfills the existing drafts. Local response caches in `.cache/draft-development/` are ignored by Git and separated by import season; they are not required by the website. `priorNhlGames` can be null when age alone determines eligibility.

The ambiguous `2019-2020 Trades.csv` batch stamped `Sun Oct 20, 2019, 11:05PM` is intentionally hidden from feeds, counts, pagination, and season filters at the league owner's request. [lib/history/visibility.ts](../lib/history/visibility.ts) matches its source file and timestamp, so reimporting keeps it hidden. The source rows remain stored. The separate 3:30 PM Josi trade and same-time free-agent claims remain visible.

## Live draft lottery

See the [draft lottery guide](lottery.md) for scheduling, preview controls, reveal timing, snapshot handling, polling, and saved results. Season and history imports do not modify lottery events.

## Cache and derived data

Most public league and history queries have no timed expiry in production. They all carry the `league` tag for full imports, with additional tags for interactive edits. Development bypasses this query cache. Invalidating a tag makes its readers fetch fresh data on their next request.

The [season sync](#season-sync) expires the tags its changes affect and none on a run that changes nothing. Roster, award, and matchup edits invalidate the edited season and their affected cross-season summaries. Other seasons' query results, draft classes, and transaction histories stay cached. Team name/logo edits invalidate that franchise and the collections that include its current identity. Colour edits invalidate only the branding query. Account claims do not invalidate public league data. The dependencies are defined in `lib/data/cache-tags.ts`; add tags to both readers and edit handlers when introducing a new cached aggregate.

`POST /api/revalidate` requires `Authorization: Bearer <REVALIDATE_SECRET>`. It clears the league cache; it does not import data or refresh materialized views. Import and logo-sync scripts call it only when both `SITE_URL` and `REVALIDATE_SECRET` are set.

The full season importer refreshes all three materialized views before invalidating cached data:

| View | Contents |
| --- | --- |
| `season_results` | Championship winner, runner-up, and final matchup per season |
| `player_careers` | Career totals, FP/G, positions, championships, awards, and all-time rank |
| `franchise_records` | Regular-season record, points, championship seasons, and finals appearances |

Roster and award edits refresh only `player_careers`. Matchup edits refresh `season_results` and `franchise_records`. A season sync run refreshes the views its changes affect, after its write commits. Every refresh runs in the order listed in `lib/data/materialized-views.ts`. History-only imports and logo sync do not recompute these views. Direct SQL changes to source stats or curated results need the appropriate view refresh as well as cache invalidation.

Pick'em's cached reads carry their own tags, defined in [lib/pickem](../lib/pickem/) rather than `lib/data/cache-tags.ts` because only the Pick'em module reads and expires them: `pickemSeasonTag(year)` (a season's recorded weeks, locked-week Pick'em picks and the Pick'em leaderboard; settle expires it after recording, freezing or completing), `PICKEM_SEASONS_TAG` (the list of Pick'em seasons; settle expires it after recording a week or completing a season) and `pickemWhosInTag(year, week)` (a week's who's-in list; a save or clear that changes which matchups an entry has picked expires it). Who's in and past seasons' entries also carry the franchise-cards tag, so a team's branding edit reaches them.

The lottery uses uncached reads and server time instead of the league cache. Its endpoint sets `Cache-Control: no-store, max-age=0`; a request at or after the scheduled start can persist the draw. See the [draw and viewer behavior](lottery.md#draw-and-viewer-behavior).

## Schema

[db/schema.ts](../db/schema.ts) defines the tables. [db/migrations](../db/migrations/) contains the SQL history, including the materialized views and the team identity views.

Migration `0022_bare_player_ids` rewrote every stored player ID and every reference to one from `*02b81*` to `02b81`, refreshed the materialized views, and added a check that rejects a player ID containing `*`. If two stored IDs are the same once stripped, it stops with both IDs named and changes nothing; decide by hand which player each one is before running it again.

Two plain views resolve team identity ([ADR 0001](adr/0001-team-identity-in-database-views.md)); every query that shows a team joins one of them instead of repeating the fallback. They store nothing and need no refresh.

| View | One row per | Contents |
| --- | --- | --- |
| `current_teams` | franchise | Current identity: the owner's name and logo, then the latest team season's, then the franchise's own; abbreviation falls back to the first three letters of the name; `defunct`; `latest_team_season_id` |
| `season_teams` | team season | Season identity: that season's name, abbreviation and logo, with the franchise logo when the season has none |

| Tables | Contents |
| --- | --- |
| `seasons`, `team_seasons`, `players`, `player_seasons`, `matchups` | Season data and playoff brackets, from the season import or, for the season being played, the season sync. A player season's goals, assists, shots, hits and blocks (its skater categories, 0026) are written only by the season sync and are null for goalies and every season before 2027. From 2027 `matchups` also holds the season sync's regular-season games (`stage = 'regular'`, `round` the week number); one row per season, stage, round and pair of team seasons (0027) |
| `weeks` | Each season's Fantrax weeks with their start and end times (`starts_at`, `ends_at`), written by the season sync from 2027 (0027). `ends_at` is the week's last second: Fantrax's end, a second before the next week's first game, or for an end at midnight Eastern the last second of that day |
| `franchises`, `owners`, `award_types` | Identities and definitions synced from league configuration |
| `awards`, `championship_rosters`, `matchup_overrides` | Curated winners, rosters, and bracket corrections |
| `transaction_events`, `transaction_assets`, `draft_picks` | Historical moves and draft slots with source references |
| `draft_lotteries` | Event snapshots, version, schedule, cancellation, and saved winner |
| `pickem_picks` | Each Pick'em entry's Pick'em pick per week and matchup (migration 0018) |
| `pickem_weeks`, `pickem_pairings` | Pick'em's record of each locked week: its lock, its pairings in order and, once frozen, each pairing's result (0019) and its two scores (0021) |
| `pickem_completed_seasons` | Seasons whose Pick'em is complete, so their winner stands once Fantrax moves on (0020) |
| `season_sync_status` | One row per season year: the season sync's last run, last success, last error, what the last success changed and its warnings, the franchise an automatic championship roster was written for, the champion the roster was last saved for, and the freeze time (0023, 0025, 0026, 0027) |

Player seasons are retained when the player scored, was rostered, or is needed by an award or championship roster. Team trophy cases derive Prime Minister's Trophies from a strict league-wide regular-season FPts lead, for published seasons only; tied leaders do not receive an inferred winner.

The season being played counts wherever a published season does: career totals, FP/G and rank, franchise records and season lists, both leaderboards, draft class stats, the record book's season totals, and, once the season sync has stored its final weeks, the record book's matchup records and winning streaks and Compare teams' regular-season head-to-head. The record book and Compare read regular-season games, weeks and skater categories from the checked-in history files for 2026 and earlier, then from the database; a stored game's page is `/records/game/<matchups id>`, a history game's keeps its negative id. It gets no Prime Minister's Trophy, no best season record (win percentage), no season page, banner, picker entry or search result, and the record book leaves it out of the calendar its cup streaks are measured against. A future "lowest" or "fewest" single-season record must use published seasons only. Individual awards use their recorded `awards.team_season_id` association, not the player's current team.

## HTTP API

Pages call shared data functions directly. The JSON routes expose these public views. League and history responses use the cached queries described above; lottery responses are uncached.

| Endpoint | Returns |
| --- | --- |
| `GET /api/leaderboard?mode=all-time\|single-season&position=all\|c\|lw\|rw\|d\|g&page=1&q=` | Up to 25 leaders and pagination metadata |
| `GET /api/players/search?q=` | Up to ten players; at least three characters required |
| `GET /api/players/<id>` | Career summary, seasons, awards, and championships |
| `GET /api/seasons` | Season and champion list |
| `GET /api/seasons/<end year>` | Season result and championship roster |
| `GET /api/franchises` | All-time franchise cards, including defunct status |
| `GET /api/franchises/<id>` | Franchise identity, records, seasons, and player leaders |
| `GET /api/awards` | Configured individual award types |
| `GET /api/awards/<slug>` | Winners of one individual award, such as `Wayne_Gretzky_Award` |
| `GET /api/history` | Paginated transaction/draft feed for one player or franchise |
| `GET /api/lottery` | Current lottery, server time, and only the results revealed so far |
| `GET /api/lottery?id=<UUID>` | A specific non-cancelled lottery |
| `GET /api/lottery?summary=1` | Event ID, start/end times, phase, and server time for navigation |
| `POST /api/revalidate` | Authenticated league cache invalidation |

`/api/history` requires exactly one of `franchise=<id>` or `player=<Fantrax ID>`. Optional filters are `kind=all|trade|free_agent|draft`, `season=<end year>`, and `page=<positive integer>`. Player and franchise detail responses do not embed this paginated feed; request it separately.

`/api/leaderboard` accepts an optional `season=<end year>` in `single-season` mode. The championship page uses it for the Top Players section below the standings, with position filters and 25 players per page. Cup and award indicators refer to that player's selected season. Fantasy teams come from the player's end-of-season roster, with the name and logo recorded for that season and a link to the franchise page. Unrostered players appear as free agents. Omitting `season` keeps the leaderboard across all seasons.

The award gallery includes two team trophies as well as the six individual awards. The individual-award API is not the full eight-trophy gallery catalogue.

## Testing

`npm test` runs every `*.test.ts` under `lib/` and `scripts/`, plus the Git hook tests in `scripts/git/`. It finds them by glob, so a new test file runs without editing `package.json`. The `test:*` area scripts still run one area at a time. `npm run test:coachs:production` is a deploy checker, not part of the suite.

A worktree needs its own `npm install` before the suite will run. Without one, Node resolves packages from the main checkout's `node_modules`, and the tests that import `@electric-sql/pglite` or `sharp` fail.

Tests get their database from `lib/testing/disposable-league.ts`: a migrated in-memory Postgres, optionally with the app's reads and Next's cache pointed at it, cleaned up when the test ends. Each test writes its own seed SQL. Don't build a PGlite, a cache stand-in or a mock of `getDb().execute` in a test: the module's own test fails the suite if one appears.

```ts
// lib/data/example.test.ts
test('a cached reader serves its second read from the cache', async t => {
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: `
        insert into league.seasons values (2026, '2025–26', 'complete');
    ` });
    const { getBannerSeasons } = await import('./league'); // import app code after the league is set up
    await getBannerSeasons();
    await getBannerSeasons();
    assert.equal(league.queries(), 1);
});
```

Leave out `nextCache` for the app's reads without a cache, or both options for a bare database (`league.client` and `league.db`). `fetch` throws unless the test passes its own as `fetch`. To test what a migration does to existing rows, pass `migrateThrough: '0008'`, seed, then call `league.migrateRest()`.

## Commands

| Command | Behavior |
| --- | --- |
| `npm test` | Run every test in the repo |
| `npm run db:import -- 2026` | Apply migrations, sync configuration, import the selected season and its supplied history (or open it when it has a `fantrax` block and no CSVs), seed empty legacy records, refresh views and cache |
| `npm run db:import` | Import every season found in the data directory and open every season with a `fantrax` block and no CSVs |
| `npm run db:import:history -- --dry-run` | Parse and validate history without opening a database connection |
| `npm run db:import:history` | Apply migrations and replace supplied history in an existing league database |
| `npm run db:sync:logos` | Sync configured franchise and era logos; no stats import or status sync |
| `npm run db:report:names` | List draft and transaction rows whose recorded team name differs from the season identity name |
| `npm run db:migrate` | Apply committed migrations without importing league data |
| `npm run db:generate` | Generate a migration after changing `db/schema.ts`; review the SQL before applying it |
| `npm run test:lottery` | Run model and in-memory database tests for the lottery |
| `npm run test:data` | Verify cache reuse, edit invalidation, and materialized-view updates against in-memory Postgres |
| `npm run test:history` | Run parser, identity, grouping, repeat-import, and rollback tests |
| `npm run test:pickem` | Run the Pick'em module's tests through its operations against in-memory Postgres and the in-memory live season |
| `npm run test:season-sync` | Run the season sync's tests through its run operation against in-memory Postgres and its in-memory Fantrax reads |
| `npm run db:verify` | Legacy migration comparison against old-site API shapes; not current-site verification |

`db:verify` still calls `/api/stats/...`, `/api/teams/stats`, and `/api/player/...`, which the current app does not implement. Its default target is the current production API, so it will encounter missing routes. It also reports data differences without making those differences a failing exit status. Use it only with a compatible legacy endpoint via `YOFHL_LIVE_API`; use the current API and page checks for present-day verification.

## Fantrax refreshes and final weeks

Two kinds of scheduled job read Fantrax. The four evening refreshes save the home page's current-season snapshot and write nothing into the archive. The morning [season sync](#season-sync) writes the live season into the archive. Both are Vercel crons in `vercel.json`, authorized by `CRON_SECRET` (Vercel sends it as an Authorization bearer token), and run only on production deployments. Set a strong production `CRON_SECRET`.

Apply migrations before deploying the Fantrax controls. `league.fantrax_snapshots` holds the last successful current-season snapshot, independently of historical imports. `league.fantrax_final_weeks` holds manual final flags keyed by Fantrax league, season and period.

The four daily refresh targets are 8, 9, 10 and 11:30 p.m. in `America/Toronto`. `vercel.json` defines six once-daily UTC jobs covering both Eastern offsets. The authenticated handler evaluates each job's scheduled time and skips the two slots that do not apply at the current offset. This supports Vercel Hobby and its possible 59-minute scheduling delay, including an 11:30 p.m. job arriving after local midnight.

A refresh fetches league information, rosters, standings, scoring leaders, roster statistics and started matchup periods within the seven-day correction window. It saves the complete result only after all requests succeed, then invalidates only the current-season cache tag. Weekly player references, the scoring-season selector, archive queries and older final scores remain cached. Overlapping refreshes cannot replace a newer snapshot with an older one. If no recent saved snapshot exists, the existing 24-hour API caches provide a fallback.

After a successful scheduled capture, the cron handler runs Pick'em settle (`app/api/cron/fantrax/route.ts`). Settle reads the snapshot just saved (it makes no Fantrax request of its own, beyond one permanently cached score fetch for a week leaving its correction window), records every locked Pick'em week not yet recorded, freezes every recorded week that is final and past its correction window, and marks the season's Pick'em complete once its last regular-season week is frozen. A week with a pairing Fantrax has no score for is not frozen: settle logs `is not frozen` and tries again on the next run, since a freeze is never rewritten. Every step is safe to repeat, so a missed evening is caught up by the next run. It does nothing while Pick'em is switched off. A settle failure leaves the published snapshot in place, logs `Pick'em settle failed:` and returns 500 with `refreshed: true`, so the failure shows in Vercel's cron logs.

Signed-in admins can use **Refresh Fantrax** on `/admin`. **Mark week final** first refreshes scores, then saves a manual flag for a started week. **Clear manual final** returns that week to automatic status. Each action checks the admin session on the server. Public visitors cannot trigger these writes.

Regular-season Final detection compares each scheduled team's cumulative W-L-T total with its number of paired matchups through that week. It handles ties and byes, rejects missing or malformed standings and schedule history, and does not infer playoff completion from regular-season records. Both matchup cards and the ticker use the same final-period list. A Final flag does not advance the current week or stop stat corrections; the next week still becomes current at Fantrax's supplied boundary. Existing open browser tabs need reloading to receive a new snapshot.

Playoff weeks come from Fantrax. The live season treats every week from Fantrax's first playoff week (`firstPlayoffPeriod` in its playoff settings) as one playoff round, however long the week, and every earlier week as the regular season, which is all Pick'em and automatic Final detection cover. The playoff line and first-round byes follow the first round's seeding on Fantrax's schedule, then its byes once seeded (each round halves the bracket, so the byes give the playoff team count; consolation games that week don't move the line), and only failing both Fantrax's playoff team setting. The season sync seeds its bracket from the same line. The league plays three rounds; when Fantrax's schedule from its first playoff week has any other number, the home page still shows what Fantrax has and the live season reports `playoffs.fitsFormat: false`.

The broader `POST /api/revalidate?external=1` remains available for historical corrections. It refreshes the saved current-season snapshot and clears all Fantrax and league caches; use the admin button for routine current-season refreshes.

## Season sync

The season sync (`lib/season-sync/`) writes the live season into the archive. The rules behind its writes are in [ADR 0008](adr/0008-season-sync-write-rules.md). Tests: `npm run test:season-sync`.

### Before deploying

Apply these migrations (`npm run db:migrate`) before deploying the code that reads them:

| Migration | Why |
| --- | --- |
| `0023_season_sync_status` | Adds `league.season_sync_status`, which the cron route, the admin action and the admin page read |
| `0024_season_results_need_the_final` | The season results view crowns a champion only when a season's last stored championship round is a single game (the Final), so a season with only its Quarterfinals or Semifinals stored stays unpublished. Imported seasons are unchanged |
| `0025_season_sync_championship_roster` | Adds `changed_championship_roster`, `auto_roster_franchise_id` and `saved_roster_franchise_id` to the status table, which the sync's write, the roster editor's save and the admin page read |
| `0026_skater_categories` | Adds the nullable `goals`, `assists`, `shots`, `hits` and `blocks` columns to `player_seasons` (every existing row keeps null) and `changed_skater_categories` to the status table, which the sync's write and the admin page read |
| `0027_season_sync_regular_season_games` | Adds `league.weeks`, the unique key on `matchups` (season, stage, round and both team seasons) that the sync updates regular-season games by, and `changed_regular_season_games` and `changed_weeks` on the status table, which the sync's write and the admin page read |

### When it runs

`vercel.json`'s `/api/cron/season-sync` job runs at 11:00 UTC every day (6 a.m. Eastern in winter, 7 a.m. after the March clock change; Vercel Hobby may fire it up to an hour late). **Sync season stats** on `/admin` runs the same operation straight away, after checking the admin session; use it after a scoring correction or to check a newly opened season.

It syncs the live season (the latest season with a `fantrax` block) and does nothing until the season import has opened that season. Each run reads Fantrax fresh: league info (weeks and daily roster periods), the website standings table, the website player stats table, the website skater table, and the scores of each regular-season week it writes (Fantrax's one-week score read, one request a week). The live season gives which weeks are the playoffs, the manual final weeks, and the playoff weeks' pairings and scores, which follow the evening refresh's saved snapshot. A playoff round is never written from a snapshot more than 36 hours old: the run fails instead, so a broken evening refresh shows up in admin rather than as stale bracket scores. No regular-season score comes from the snapshot, so a stale one doesn't fail a run before the playoffs. The player stats table takes three requests: the leaders down to the first zero total, the last page for negative totals, and the rostered players. Signed out, Fantrax ignores a reversed sort, so negative totals are read from the end of the descending table. The skater table is the call the record book's category export made for 2019–2026 (`lib/fantrax/skater-table.ts`), checked page by page the same way: every NHL skater, in pages of up to 10,000, usually one request. The standings, player and skater tables are undocumented website calls; if Fantrax changes them the run fails safely and the season import remains available.

### What it writes

- **Team seasons**: W/L/T, points for and against straight from the standings table, division 1 and the table's rank. Never the name, owner, logo or abbreviation.
- **Player seasons**: under the season import's keep rule. A player who scored (a non-zero total), is on a franchise's roster, or is on the season's championship roster or an award list gets a player row (bare ID and name) and a player season with the fantasy team from the Fantrax team mapping, NHL team, positions, and FPts and FP/G to date. A player season that no longer qualifies is removed.
- **Skater categories**: goals, assists, shots, hits and blocks from the skater table, onto every kept player season Fantrax's player table lists. They never create a player season. A skater in the table with no games played gets zeros; a goalie (positions including G), and a player the skater table doesn't list, gets null. A ring or award player Fantrax's player table no longer lists keeps the totals they had. The record book counts each stored total that isn't null on its own; a null one counts for nothing, never as zero.
- **Weeks**: every week of the season with its start and end, from the league info.
- **Regular-season games**: every game of each week before Fantrax's first playoff week, once the week is final (its end has passed, or it is marked final in admin; an end at midnight Eastern is read as the end of that day), stored with the week number as its round, in Fantrax's order. A run reads the scores of every final regular-season week that is either not stored yet or still inside its seven-day correction window, so the first run backfills the weeks already played (up to 21 requests in 2027) and a week that goes missing is refilled. A game follows Fantrax's scores until its week's correction window closes, updated in place, and is never rewritten after. A level score is a tie with no winner, and bracket corrections don't apply.
- **Playoff games**: each round's championship games once its week is final (ended, or marked final in admin). A game is a championship game when both teams are still alive in the bracket: the standings' playoff seeds in the first round (the top seeds having byes), then the previous round's winners plus the bye teams. Other games in those weeks are ignored. Each round's games are slotted for drawing: the first round in Fantrax's schedule order, each later round beside the games that fed it (`lib/data/bracket-order.ts`, the rule the season import slots by, from the Final back). The winner follows the shared matchup winner rule, so a saved bracket correction applies; level scores go to the team Fantrax placed in the next round, and a level Final has no winner until it is set in bracket review. A game follows Fantrax's scores until its week's seven-day correction window closes and is never rewritten after. The Final's winner publishes the season through the season results view.
- **Championship roster**: once the season has a champion and no roster. The champion's run is the playoff weeks it played a game in, so a first-round bye is not part of it. The roster is everyone on the champion's roster in any slot but the minors (injured reserve included) in any daily roster period that starts inside those weeks; a single day counts. That is one Fantrax read per roster period of the run (28 for 2027's 7, 7 and 14 days), made only in the run that writes the roster. A roster player with no player row or player season this year (dropped, with no points) is given both, named from Fantrax's player directory. The status row records the franchise the automatic roster was written for. Saving the roster in the roster editor clears that record, and from then on the season sync never changes it.

If the Final flips inside its correction window, an automatic roster still on record is replaced with the new champion's. A roster saved in admin is left alone. If it was saved for a different champion (the Final flipped after the save), every run warns about it until it is saved again; a roster saved before the Final was decided raises no warning.

It never writes an award, a bracket correction, a saved championship roster or a team season's identity. The league configuration's `scoreOverrides` apply only to the season import.

### Writes, failures and warnings

A run reads and checks everything first, then writes every part in one statement together with the status row. A row changes only when a value differs, and a run that changes nothing refreshes no view and expires no tag. Changed stats refresh `player_careers` and `franchise_records` and expire the season, players, both leaderboards, franchise, records, discovery, draft, points leader and team comparison tags; changed playoff games and rosters expire what a bracket or roster edit does; changed skater categories expire only the records tag, and changed regular-season games or weeks the records and team comparison tags, and neither refreshes a view.

A failed Fantrax read, a check that fails (Fantrax on another season, an unmapped fantasy team, an incomplete or out-of-order table, a skater table with a repeated skater or an invalid total, a team twice in a week's scores, a champion with nobody on its roster outside the minors, a playoff round due to be written from a live season snapshot more than 36 hours old), or a failed write leaves every row as it was. Only the status row's last run and last error change, the cron returns 503 with the error, and the server logs `The season sync of <year> failed:`. The next run catches up. There is no alert beyond the admin panel and Vercel's cron logs. A failed read of the champion's daily rosters fails the whole run, Final included, and is retried the next morning.

Warnings don't fail the run. They name something the league owner should fix:

- Fantrax's schedule from its first playoff week is not three rounds: no bracket is written.
- A round's pairings don't fit the bracket: nothing is written for it or any later round. Repair it with the season import.
- The Final ended level: no champion until its winner is set in bracket review.
- The championship roster was saved in admin for one champion and the Final has since flipped to another: check it in the roster editor.

### The admin panel

The Season sync panel on `/admin` shows the last run, the last success, what the last successful run changed (player seasons, team seasons, regular-season games, weeks, playoff games, championship roster players and the skaters whose category totals changed, or "nothing"), the last error, the last successful run's warnings, a line while an automatic roster has not been saved in the roster editor, and the freeze time. "Not run yet" means the season isn't opened or no run has reached it.

### The freeze

Seven days after the season's last week ends, the next run records the freeze time and writes nothing, and every later run leaves the season alone. For 2027 that is April 12, 2027. After the freeze the season changes only through admin edits and the season import, like every other archived season.
