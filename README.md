# YOFHL Fantasy Hockey Database

The YOFHL league archive and live draft lottery, built with Next.js and PostgreSQL. The site combines Fantrax season exports with league-maintained championship rosters, awards, franchise identities, and playoff corrections.

[Live site](https://yofhl-db.vercel.app) · [Data and maintenance](docs/data.md) · [Draft lottery](docs/lottery.md)

## What the app does

| Page | Contents |
| --- | --- |
| `/` | Daily Fantrax league snapshot with scoring-period matchups, standings, rosters by position, and archive links |
| `/stats/all-time/all` | Searchable career leaderboard, with position filters and 25 players per page |
| `/stats/single-season/all` | Single-season leaderboard with the same filters |
| `/player/<Fantrax ID>` | Career stats, awards, championships, points chart, and transaction history |
| `/compare` | Player comparisons and points charts |
| `/teams/stats` | Franchise cards sorted by Jagr Cups, wins, points for, or finals appearances |
| `/teams/<franchise ID>` | Records, former names, trophy case, seasons, leaders, trades, and draft history, with section navigation |
| `/champions` and `/champions/<end year>` | Championship history, rosters, standings, playoff brackets, and season player leaders with fantasy teams, position filters, and section navigation |
| `/awards` and `/awards/<award slug>` | Eight league trophies and their winners |
| `/lottery` | Scheduled countdown, live pick reveals, and the completed draft order |
| `/admin` | Sign-in and season checklists for roster, award, and bracket edits |
| `/admin/lottery` | Lottery scheduling, odds, starting order, and full presentation preview |
| `/owner` | Owner sign-in, team claims, password resets, and current team editing |
| `/admin/teams` | Team names, logos, claim status, and owner invitation codes |

`/stats` redirects to the all-time leaderboard. The team listing is at `/teams/stats`; there is no `/teams` index route. Defunct franchises remain accessible and always appear after active teams in every team-card sort. Each group follows the selected statistic, with wins breaking ties.

The home page reads the public Fantrax API for league `rf5o9cu2mutybszr`. Rosters, standings, schedules, player references, and requested matchup scores are cached for 24 hours and refreshed on a subsequent visit. The displayed timestamp is the actual snapshot fetch time. There is no cron job, automatic browser polling, or database write. Matchup and lineup periods follow Fantrax's separate calendars in Eastern Time. Scores are daily snapshots, not live. An initial API failure shows an unavailable state while keeping archive links accessible.

Home-page rosters group active, benched, and injured players by assigned Fantrax position, with IR badges for injured players. Minors are separate. A team dropdown and previous/next controls switch rosters. The scoring-leaders panel reads imported player statistics for the current Fantrax season only; the documented API does not supply individual player scoring totals. It remains empty until that season's stats are imported. The home page does not display a playoff cutoff or infer a BYE from unassigned matchup slots.

`lib/fantrax/data.ts` maps this season's Fantrax team IDs to the archive's permanent franchise IDs. Update the league ID and this mapping when moving to a new season. Names and logos follow the site's current team-management settings. Roster players link to existing archive profiles using their original IDs; players without archive records are shown without a profile link. The public reads do not use `FANTRAX_USER_SECRET`.

Johnny Gaudreau's player profile has a memorial header and a historical rank note alongside his current career statistics.

The draft announcement is set in `lib/draft.ts` for October 10, 2026 at 9:00 PM Eastern. The homepage shows a countdown; other pages show a compact notice below navigation. Both disappear when the draft starts. There is no draft-room link yet. The concluded lottery remains available at `/lottery`, but is no longer promoted in navigation.

## Run locally

Use Node.js 24 and npm 11, the versions used for the current development setup. The database scripts require Node's `--env-file-if-exists` and `--import` flags.

```sh
npm ci
```

Create `.env.local` with a Neon connection string for the database you intend to use:

```dotenv
DATABASE_URL_V2=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Replace the example connection string. Add admin credentials and other settings from the [environment reference](docs/data.md#environment) if needed. Environment files are not committed.

For an existing populated database, start the app:

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). For a new database, follow the [season import workflow](docs/data.md#adding-a-new-season) first. Fantrax CSV exports are local inputs and are not included in a fresh clone.

Owners can open the [brand studio](docs/team-branding.md) from **Manage Team** to save their three team colours and banner style. Commissioners can open each team's studio from `/admin/teams`.

The web app uses Neon's HTTP driver. PGlite is supported by the database scripts and tests only; the web app cannot run against a `pglite:` URL. Use a separate Neon database or branch when testing admin writes or lottery scheduling.

## Check changes

```sh
npm run lint
npx tsc --noEmit
npm run test:lottery
npm run test:draft
npm run test:history
npm run test:owners
npm run test:snapshot
npm run test:keepers
```

The test suites use Node's test runner and in-memory PGlite for database cases. They do not connect to the league database. They cover lottery timing, odds, disclosure and concurrency, plus history parsing, identity matching and repeat imports. UI changes also need a browser check on the affected pages.

To check a production build:

```sh
npm run build
npm run start
```

The build reads league data while generating pages, so it needs a reachable Neon database with migrations applied. Stop a development server using this checkout before building, because both commands use `.next`.

`npm run db:verify` is a legacy migration comparison tool. It still calls API routes from the old site and is not a check of the current deployment. See the [command reference](docs/data.md#commands).

## Project layout

| Path | Responsibility |
| --- | --- |
| `app/` | App Router pages, JSON routes, admin server actions, and styles |
| `components/` | Public UI, admin editors, and shared lottery presentation |
| `lib/data/` | Neon/Drizzle queries and the shared league cache |
| `lib/admin/` | Admin authentication and editor queries |
| `lib/lottery/` | Draw rules, Eastern Time conversion, public disclosure, and guarded database updates |
| `lib/history/` | History types and the visibility rule for excluded source records |
| `db/schema.ts` and `db/migrations/` | Database tables and versioned SQL, including materialized views |
| `scripts/db/` | Migrations, Fantrax imports, logo sync, and legacy verification |
| `league/league.yml` | Stable franchise IDs, identity eras, defunct status, logos, award definitions, and playoff fixes |
| `league/seed/` | Legacy awards and championship rosters used to fill empty historical seasons |
| `public/logos/` and `public/trophies/` | Team and award artwork; some team logos also live directly in `public/` |

The app uses Next.js 15.5, React 18, TypeScript, Tailwind CSS, Framer Motion, and Recharts. PostgreSQL data lives in the `league` schema. Runtime queries use Drizzle with the Neon HTTP driver; import scripts use Postgres.js or PGlite. Exact dependency versions and commands are in [package.json](package.json).

Player pages render per request from cached data. Fantrax IDs contain `*`, which cannot be used in static page filenames on Windows.

## Deployment

The GitHub repository is connected to the Vercel project `yofhl-db`. Its production branch is `master`. Branch pushes create preview deployments; updates to `master` deploy the production site.

Configure the [environment variables](docs/data.md#environment) for each Vercel environment. Preview and production deployments use whichever database their variables identify. A preview pointed at the production database can write production data through admin actions or a lottery request after its start time.

The build command is `next build`. Deployments do not run database migrations or import CSVs. Review and apply required migrations with `npm run db:migrate` against the intended database before deploying code that depends on them. Imports and admin edits have their own [cache refresh behavior](docs/data.md#cache-and-derived-data).

For lottery setup, rehearsal, timing, and recovery behavior, use the [draft lottery guide](docs/lottery.md). Award artwork and stored-name mappings are documented in [public/trophies/README.md](public/trophies/README.md).

For owner invitations, account setup, logo uploads, and historical identity behavior, use the [team management guide](docs/owners.md).

## Keeper submissions

Owners can submit 2026–27 keepers from **Manage Team**; commissioners review them at `/admin/keepers`. The deadline is October 9, 2026 at 7 p.m. Eastern. See [keeper rules, setup and validation](docs/keepers.md). Apply database migrations before deploying the feature.
