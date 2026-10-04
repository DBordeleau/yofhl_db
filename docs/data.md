# League data and maintenance

The current site reads PostgreSQL data from the `league` schema in Neon. The application no longer reads the old site's `public` tables. SQL migrations and Drizzle's migration log also use the `league` schema.

Seasons use the year they end in. `2026` means the 2025–26 season. Franchise IDs stay the same through renames and must not be reused. Player IDs come from Fantrax and should be URL-encoded when building links.

## Sources and ownership

| Data | Source | How it changes |
| --- | --- | --- |
| Standings, player seasons, playoff games | Fantrax season CSVs | A season import replaces that season's imported data |
| Franchises, identity eras, owners, logos, individual award definitions, playoff fixes | [league.yml](../league/league.yml) | Every season import syncs the league configuration |
| Current team name/logo overrides, account claims and invitation codes | `/owner` and `/admin/teams` | Stored in `team_management`; preserved by imports and logo sync. See [team management](owners.md). |
| Championship rosters and individual award winners | `/admin/seasons/<end year>` | Admin edits; legacy seeds fill historical seasons with no entries |
| Bracket corrections | Admin bracket review | Saved corrections are reapplied during imports |
| Trades, free-agent moves, and draft selections | Fantrax history CSVs | History imports replace supplied files or draft seasons |
| Draft lottery schedule, order, odds, and winner | `/admin/lottery` and the draw service | Stored separately from season imports; see the [lottery guide](lottery.md) |
| Trophy labels, descriptions, artwork, and stored-name aliases | [lib/awards.ts](../lib/awards.ts) | Code changes, separate from award winner records |

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
| `SITE_URL` | Site whose cache import and logo-sync scripts refresh, when `REVALIDATE_SECRET` is also set |
| `YOFHL_DATA_DIR` | Optional CSV directory override; defaults to `data` |
| `YOFHL_LEAGUE_CONFIG` | Optional league configuration path; defaults to `league/league.yml` |
| `YOFHL_LIVE_API` | Base URL for the legacy `db:verify` comparison script |

Locally, settings belong in uncommitted environment files. On Vercel, configure them separately for the required deployment environments.

Use a Neon PostgreSQL connection string for the web app. Scripts also accept `DATABASE_URL_V2=pglite:.pglite` for a local database under the ignored `.pglite` directory. PGlite does not serve the website. For import rehearsals, use a separate database and leave `SITE_URL` unset so the script does not refresh a hosted site's cache.

Admin sessions use an HttpOnly cookie scoped to `/admin`, with a 12-hour expiry. Changing the signing secret invalidates existing sessions. When the password is the signing key, changing the password does the same. Each admin write checks the session again.

## Adding a new season

1. Put the Fantrax exports in `data/`, following the existing naming convention. For the season ending in 2027, use `2026-2027 Player Stats.csv`, `2026-2027 Team Stats.csv`, and `2026-2027 Playoffs.csv`. A cancelled playoff season is recorded in `league.yml` and does not need a playoff file.
2. Update the league configuration for new franchises, renamed teams, ownership changes, abbreviations, and logos. Close the previous era with `to` and add the new era with `from`. Both values are inclusive end years.
3. Review the database connection, then run the import:

   ```sh
   npm run db:import -- 2027
   ```

   Without season arguments, the command imports every season found in the data directory. Multiple end years are accepted. The normal importer also processes supplied history files for those seasons.
4. Resolve reported CSV/configuration mismatches before rerunning. Use `scoreOverrides` for known Fantrax playoff rescoring errors. Saved admin bracket corrections are included when validating the bracket.
5. Open `/admin`, sign in, and select the imported season. Set the championship roster, enter award winners, and review the bracket. The roster editor can start from the champion's end-of-season players, then add players dropped before the export.
6. Check the import summary and the public season page. If importing into a hosted database, confirm the site cache was refreshed.

The importer applies migrations before it validates season data, because it reads saved bracket corrections. Validation errors normally stop season writes, but this is not a dry-run command. League configuration writes, per-season transactions, legacy seeding, and history replacement are separate steps. A failure late in the run can leave earlier steps committed.

Reimports replace imported rows for the selected seasons. Existing championship rosters and awards are preserved, and bracket corrections are reapplied. The legacy seeds can refill an entirely empty historical roster or award list. Lottery snapshots are not changed. Use an isolated database when checking changed exports or import code.

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

Draft tables show the player's full-season FPts and FP/G, not only points earned for the drafting team. Missing stats display a dash. The exports have no games-played field, and the app does not estimate it. Career FP/G is the mean of the stored FP/G values for seasons with positive FPts, rather than a games-weighted average.

Team transaction feeds start on Trades. Player feeds include all history kinds. Each page contains ten events. Matching trades include every asset; a player's free-agent history includes only that player's claim or drop. Team pages also have a separate searchable and sortable draft section.

The ambiguous `2019-2020 Trades.csv` batch stamped `Sun Oct 20, 2019, 11:05PM` is intentionally hidden from feeds, counts, pagination, and season filters at the league owner's request. [lib/history/visibility.ts](../lib/history/visibility.ts) matches its source file and timestamp, so reimporting keeps it hidden. The source rows remain stored. The separate 3:30 PM Josi trade and same-time free-agent claims remain visible.

## Live draft lottery

See the [draft lottery guide](lottery.md) for scheduling, preview controls, reveal timing, snapshot handling, polling, and saved results. Season and history imports do not modify lottery events.

## Cache and derived data

Most public league and history queries use the shared `league` cache tag with no timed expiry in production. Development bypasses this query cache. Clearing it makes the next request read fresh data.

`POST /api/revalidate` requires `Authorization: Bearer <REVALIDATE_SECRET>`. It clears the league cache; it does not import data or refresh materialized views. Import and logo-sync scripts call it only when both `SITE_URL` and `REVALIDATE_SECRET` are set.

The full season importer and roster, award, or bracket admin edits refresh these materialized views before invalidating cached data:

| View | Contents |
| --- | --- |
| `season_results` | Championship winner, runner-up, and final matchup per season |
| `player_careers` | Career totals, FP/G, positions, championships, awards, and all-time rank |
| `franchise_records` | Regular-season record, points, championship seasons, and finals appearances |

`season_results` must refresh before `franchise_records`, which reads it. History-only imports and logo sync do not recompute these views. Direct SQL changes to source stats or curated results need the appropriate view refresh as well as cache invalidation.

The lottery uses uncached reads and server time instead of the league cache. Its endpoint sets `Cache-Control: no-store, max-age=0`; a request at or after the scheduled start can persist the draw. See the [draw and viewer behavior](lottery.md#draw-and-viewer-behavior).

## Schema

[db/schema.ts](../db/schema.ts) defines the tables. [db/migrations](../db/migrations/) contains the SQL history, including the materialized views.

| Tables | Contents |
| --- | --- |
| `seasons`, `team_seasons`, `players`, `player_seasons`, `matchups` | Imported season data and playoff brackets |
| `franchises`, `owners`, `award_types` | Identities and definitions synced from league configuration |
| `awards`, `championship_rosters`, `matchup_overrides` | Curated winners, rosters, and bracket corrections |
| `transaction_events`, `transaction_assets`, `draft_picks` | Historical moves and draft slots with source references |
| `draft_lotteries` | Event snapshots, version, schedule, cancellation, and saved winner |

Player seasons are retained when the player scored, was rostered, or is needed by an award or championship roster. Team trophy cases derive Prime Minister's Trophies from a strict league-wide regular-season FPts lead; tied leaders do not receive an inferred winner. Individual awards use their recorded `awards.team_season_id` association, not the player's current team.

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

## Commands

| Command | Behavior |
| --- | --- |
| `npm run db:import -- 2026` | Apply migrations, sync configuration, import the selected season and its supplied history, seed empty legacy records, refresh views and cache |
| `npm run db:import` | Import every season found in the data directory |
| `npm run db:import:history -- --dry-run` | Parse and validate history without opening a database connection |
| `npm run db:import:history` | Apply migrations and replace supplied history in an existing league database |
| `npm run db:sync:logos` | Sync configured franchise and era logos; no stats import or status sync |
| `npm run db:migrate` | Apply committed migrations without importing league data |
| `npm run db:generate` | Generate a migration after changing `db/schema.ts`; review the SQL before applying it |
| `npm run test:lottery` | Run model and in-memory database tests for the lottery |
| `npm run test:history` | Run parser, identity, grouping, repeat-import, and rollback tests |
| `npm run db:verify` | Legacy migration comparison against old-site API shapes; not current-site verification |

`db:verify` still calls `/api/stats/...`, `/api/teams/stats`, and `/api/player/...`, which the current app does not implement. Its default target is the current production API, so it will encounter missing routes. It also reports data differences without making those differences a failing exit status. Use it only with a compatible legacy endpoint via `YOFHL_LIVE_API`; use the current API and page checks for present-day verification.
