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
