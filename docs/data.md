# League data

All league history lives in Postgres (Neon), in the `league` schema (the old site's tables are still in
`public` until the switch-over). It is loaded from the Fantrax CSV exports by a script;
the few facts Fantrax doesn't know are kept in [`league/league.yml`](../league/league.yml) or entered in the admin panel.

## Where things come from

| Data | Source | Rebuilt by an import? |
| --- | --- | --- |
| Standings, player seasons, playoff games | Fantrax CSVs in `data/` | yes |
| Franchises, team names over time, owners, logos, award definitions, playoff fixes | `league/league.yml` | yes (from the file) |
| Championship rosters, award winners, bracket corrections | admin panel at `/admin` (rosters and awards before 2025–26 were seeded from the old site, see `league/seed/`) | **never** (bracket corrections are re-applied by every import) |

Seasons are numbered by the year they end in: `2026` is the 2025–26 season.

## Adding a new season

1. Export three files from Fantrax into `data/`, named like the existing ones:
   - `2026-2027 Player Stats.csv` (all players, full season)
   - `2026-2027 Team Stats.csv` (standings)
   - `2026-2027 Playoffs.csv` (playoff bracket)
2. Run `npm run db:import -- 2027`.
   - If a team was renamed, changed owner, or a new abbreviation appears, the import stops without
     writing anything and says what to add to `league/league.yml`. Add a new era for the franchise
     (or close the old one with `to:`), then run it again.
   - If a team that advanced in the playoffs shows a losing score, add a `scoreOverrides` entry.
3. Open `/admin` (nothing links to it), sign in, and on the season's page:
   - set the championship roster: start from the champion's end-of-season roster, then search for
     anyone they dropped late in the year (Fantrax lists them as free agents)
   - enter the season's award winners
   - in bracket review, correct who advanced if the exported scores disagree with what happened,
     and add a note to show under the bracket
   Every save refreshes the derived views and the site cache, so changes are live immediately.

Re-running an import is always safe: it replaces that season's imported rows and leaves rosters and awards alone.

## Commands

| Command | What it does |
| --- | --- |
| `npm run db:import [-- <season> ...]` | Applies migrations, then imports every season in `data/` (or just the ones given) |
| `npm run db:verify` | Compares the database with the live site for the seasons the live site has |
| `npm run db:generate` | After editing `db/schema.ts`, writes the SQL migration into `db/migrations/` |

## Environment

| Variable | Used by | |
| --- | --- | --- |
| `DATABASE_URL` / `DATABASE_URL_V2` | site, scripts | Neon connection string (`DATABASE_URL_V2` wins when both are set) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | `/admin` | the only accepted sign-in |
| `ADMIN_SESSION_SECRET` | `/admin` | signs the 12-hour session cookie (falls back to the password); change it to sign everyone out |
| `REVALIDATE_SECRET` | site, importer | lets `POST /api/revalidate` clear the site cache |
| `SITE_URL` | importer | when set with `REVALIDATE_SECRET`, the importer clears that site's cache after loading |

Locally these go in `.env.local` (never committed); in production, in Vercel's environment settings.

The scripts read `DATABASE_URL_V2` from `.env.local` / `.env`:

- a Neon connection string, e.g. `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`
- or `pglite:.pglite` for a throwaway local database (real Postgres running in-process, no server needed)

## Schema

Imported: `seasons`, `team_seasons` (a franchise's name, owner, abbreviation and standings in one season),
`players`, `player_seasons` (kept when a player scored or was rostered), `matchups` (playoff games, with
bracket, round and slot for drawing brackets).

Curated: `franchises`, `owners`, `award_types`, `awards`, `championship_rosters`, `matchup_overrides`
(bracket corrections from the admin panel, keyed by season, round and the two franchises).

Derived (materialized views, refreshed after every import and admin edit):
`player_careers` (totals, FP/G, rings, awards, all-time rank), `season_results` (champion and runner-up),
`franchise_records` (all-time record, titles, finals appearances).

## Read-only API

All responses are JSON and served from the same cache as the pages.

| Endpoint | Returns |
| --- | --- |
| `GET /api/leaderboard?mode=all-time\|single-season&position=all\|c\|lw\|rw\|d\|g&page=1&q=` | one page of 25 leaders |
| `GET /api/players/search?q=` | up to 10 players (3+ characters) |
| `GET /api/players/:id` | career summary, seasons, awards, championships |
| `GET /api/seasons` / `GET /api/seasons/:year` | champions by season / one season with its championship roster |
| `GET /api/franchises` / `GET /api/franchises/:id` | all-time records / one franchise's leaders and former names |
| `GET /api/awards` / `GET /api/awards/:slug` | award list / every winner of one award |
| `POST /api/revalidate` | clears the cache (needs `Authorization: Bearer <REVALIDATE_SECRET>`) |

## Live draft lottery

Open `/admin/lottery` (also linked from the admin home) to schedule a lottery. Set the date
and time in Eastern Time, select participants, edit their odds, and arrange the full starting
draft order with the up/down buttons. Defaults select the four lowest-record active teams
with 40%, 30%, 20%, and 10% odds. Review those selections and the order before scheduling.
Odds must total 100%, with at least two participants; each active franchise appears once.
The presentation preview uses a sample winner and never saves or runs a draw.

The schedule uses `America/Toronto`, including daylight saving changes. Nonexistent spring
times and ambiguous fall times are rejected with an explanation. Scheduling requires at least
one minute of lead time. The event can be edited or cancelled until its scheduled start;
after that, its schedule, order and odds are locked.

`league.draft_lotteries` stores event snapshots and the saved winner separately from season
data. Apply migrations before deploying this feature:

```sh
npm run db:migrate
```

The migration command uses `DATABASE_URL_V2`, like the importer; it does not import or replace
league data. Only one lottery is current. Scheduling another after the reveal finishes archives
the previous event, whose results remain accessible at `/lottery?id=<event-id>`.

The header checks `/api/lottery?summary=1` every 30 seconds and reveals the navigation link
24 hours before the event. Open pages use server-synchronized time for the 24-hour and start
boundaries. The badge becomes Live at the start, then Results after the winner celebration.
The room at `/lottery` polls every second near the start and during the reveal, and every 15
seconds otherwise. All dates shown to viewers are Eastern Time, regardless of device timezone.

There is no cron/service to provision: the first request at or after the start draws a
cryptographically random ticket out of 10,000, then conditionally saves one winner. Database
time and a version check prevent early draws, conflicting edits, and rerolls from concurrent
requests. If nobody is watching, the first later request settles the event. Refreshes and late
arrivals see the same saved result, at the current point in the presentation.

The winner immediately defines pick #1; all other teams retain their relative starting order.
The draft order shows question marks for positions the lottery can change, with fixed positions
visible below them. After a 12-second introduction, the public API releases only the unsettled
picks from last to first every seven seconds. The final two appear together, followed by a
15-second winner celebration. Unrevealed
results are omitted from public responses. The complete order stays available after the event.
An interrupted connection retries automatically and cannot change the saved draw. Reduced
motion preferences disable decorative animation and confetti.

Run `npm run test:lottery` for odds, timezone, disclosure, ordering, and database race/deadline
checks. Database tests use in-memory PGlite and never connect to the league database.

## Transaction and draft history

Historical logos belong to the matching era in `league/league.yml`. After adding logo files under `public/logos` and mapping them there, run `npm run db:sync:logos` to update franchise and team-season logos without reimporting stats. If `SITE_URL` and `REVALIDATE_SECRET` are set, the command also clears the site's league cache. Normal season imports preserve these mappings too.

`npm run db:import:history -- --dry-run` validates the history exports without connecting to the database. `npm run db:import:history` applies migrations and imports just history; the normal `db:import` also imports supplied history for its selected seasons. Supplied files are replaced atomically, so repeating an import does not duplicate events. Missing files do not delete archived history. Curated awards, championship rosters, standings and lottery snapshots are not modified by the history-only importer.

Sources:
- `data/transactions/YYYY-YYYY Trades.csv` and `YYYY-YYYY FA Claims.csv`
- `data/drafts/YYYY-YYYY draft.csv`

New tables are `league.transaction_events`, `league.transaction_assets`, and `league.draft_picks`. Each source row retains its source file/row or overall pick; traded picks retain their full original description. Trades and related claim/drop rows are grouped by exact exported timestamp and connected franchises. The CSVs have no trade IDs, so unrelated teams at the same timestamp stay separate, but multiple deals involving the same teams at the same timestamp cannot be distinguished. Assets at different timestamps are not guessed into a trade; incomplete returns are labeled in the UI. Lineup-only changes are excluded from acquisition history.

Transactions contain no player IDs. Import matches normalized exact names against player-stat and draft exports, disambiguating with the season, NHL team and position. Unresolved or ambiguous identities stop the import before writes. Franchise rebrands resolve through the existing league configuration. A trade's `(Drop)` destination becomes a drop, not a franchise.

Transaction timestamps honor the explicit EDT/EST column label; the original date and timestamp text are retained. Draft timestamps omit AM/PM, so the database stores the known calendar date and original text without fabricating an exact instant. Empty draft slots are preserved, including two 2019–20 slots without a recorded team. No 2018–19 draft file was supplied. There is no games-played field, so no GP values are estimated. Draft browsing uses full-season FPts and FP/G from `player_seasons`, not production only while rostered by the drafting team; absent season stats display a dash.

`GET /api/history` takes exactly one of `franchise=<id>` or `player=<Fantrax id>`, plus optional `kind=all|trade|free_agent|draft`, `season=<end year>`, and `page=<positive integer>`. It returns ten events at a time, including all assets in a matching trade. On player profiles, free-agent events include only that player's claim/drop; team pages retain all paired moves. Team pages start on Trades. Drafts are also available in a separate searchable/sortable team section.

Team trophy cases derive Prime Minister's Trophies from a strict league-wide regular-season FPts lead (ties do not invent a winner). Individual awards follow `awards.team_season_id`, the recorded award-team association, rather than a player's current team.

At the league owner's request, the ambiguous `2019-2020 Trades.csv` batch stamped `Sun Oct 20, 2019, 11:05PM` is hidden from team/player history, counts, pagination, and season filters. The shared visibility rule is in `lib/history/visibility.ts`. The CSV and database records remain intact, and the separate 3:30 PM Josi trade and same-time FA claims are still visible. The exclusion uses source file/time so reimporting cannot restore the hidden batch accidentally.

Run `npm run test:history` for timestamp parsing, player disambiguation, multi-team grouping, repeat imports, and transactional rollback checks.
