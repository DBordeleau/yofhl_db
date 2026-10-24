# YOFHL Fantasy Hockey Database

The YOFHL league archive and live draft lottery, built with Next.js and PostgreSQL. The site combines Fantrax season exports with league-maintained championship rosters, awards, franchise identities, and playoff corrections.

[Live site](https://www.yofhl.com) · [Data and maintenance](docs/data.md) · [Draft lottery](docs/lottery.md)

## What the app does

| Page | Contents |
| --- | --- |
| `/` | Daily Fantrax league snapshot with scoring-period matchups, standings, rosters by position, and archive links |
| `/stats/all-time/all` | Searchable career leaderboard, with position filters and 25 players per page |
| `/stats/single-season/all` | Single-season leaderboard with the same filters |
| `/player/<Fantrax ID>` | Career stats, awards, championships, points chart, and transaction history |
| `/compare/players` | Player comparisons and points charts |
| `/compare/teams` | Head-to-head matchups, franchise records, season points, and trading history |
| `/teams/stats` | Franchise cards sorted by Jagr Cups, wins, points for, or finals appearances |
| `/teams/<franchise ID>` | Records, former names, trophy case, seasons, leaders, trades, and draft history, with section navigation |
| `/season` and `/season/<end year>` | Season history, championship rosters, standings, playoff brackets, player leaders, and searchable draft classes |
| `/awards` and `/awards/<award slug>` | Eight league trophies and their winners |
| `/lottery` | Scheduled countdown, live pick reveals, and the completed draft order |
| `/admin` | Sign-in and season checklists for roster, award, and bracket edits |
| `/admin/lottery` | Lottery scheduling, odds, starting order, and full presentation preview |
| `/owner` | Owner sign-in, team claims, password resets, and current team editing |
| `/admin/teams` | Team names, logos, claim status, and owner invitation codes |

`/stats` redirects to the all-time leaderboard. The team listing is at `/teams/stats`; there is no `/teams` index route. Defunct franchises remain accessible and always appear after active teams in every team-card sort. Each group follows the selected statistic, with wins breaking ties.

The home page reads the public Fantrax API for league `rf5o9cu2mutybszr`. Current-season snapshots refresh daily at 8, 9, 10 and 11:30 p.m. Eastern, with daylight saving changes handled automatically. Vercel Hobby jobs may arrive up to 59 minutes late. Each successful refresh saves standings, rosters, scores and player stats together; a failed refresh preserves the previous snapshot. The displayed timestamp is the actual fetch time. A 24-hour cache expiry remains a fallback. Player references refresh weekly, and browsers do not poll Fantrax. Matchup and lineup periods follow Fantrax's separate calendars in Eastern Time. Scores are snapshots. An initial API failure shows an unavailable state while keeping archive links accessible.

Regular-season matchup cards and the ticker show Final once Fantrax standings contain every scheduled team's result for that week, including ties and accounting for byes. The completed week remains current until the next Fantrax period starts. Admins can refresh current-season data, mark a started week final, or clear a manual flag from `/admin`. Manual flags also cover playoffs. Final scores remain open to stat corrections.

Home-page rosters group active, benched, and injured players by assigned Fantrax position, with IR badges for injured players. Minors are separate. Each player shows current regular-season FPTS and FP/G from Fantrax, cached for 24 hours with the stats update date shown below the roster. Missing stats show a dash; a stats outage leaves the roster available. A team dropdown and previous/next controls switch rosters. The scoring-leaders panel shows FPts and FP/G for the top ten players by current regular-season FPts from Fantrax's website stats endpoint, using this league's scoring and including skaters, goalies, and free agents. It caches the results and fetch time for 24 hours, independently of historical CSV imports. The response must match the requested season and points sort; unavailable data is reported separately from a season with no scoring. Players link to an archive profile only when one exists. The home page does not display a playoff cutoff or infer a BYE from unassigned matchup slots.

`lib/fantrax/data.ts` maps this season's Fantrax team IDs to the archive's permanent franchise IDs. Update the league ID and this mapping when moving to a new season. Names and logos follow the site's current team-management settings. Roster players link to existing archive profiles using their original IDs; players without archive records are shown without a profile link. The public reads do not use `FANTRAX_USER_SECRET`.

Johnny Gaudreau's player profile has a memorial header and a historical rank note alongside his current career statistics.

The draft announcement is set in `lib/draft.ts` for October 10, 2026 at 9:00 PM Eastern. Pages other than the homepage show a compact notice below navigation, including a draft-room link that opens Fantrax in a new tab. The notice disappears when the draft starts. The concluded lottery remains available at `/lottery`, but is no longer promoted in navigation.

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
npm run test:performance
npm run test:data
npm run test:browsing
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

Player URLs omit Fantrax's surrounding `*` characters so their pages can be cached on Windows too. The 50 leading profiles build ahead of time; other profiles cache on first visit. Old starred URLs redirect to the same player, and database IDs stay unchanged.

The homepage uses five-minute page revalidation. Matchup-week selection runs in the browser and fetches only scores, preserving week links and browser history. Historical leaderboard and transaction filters keep up to 32 results for one minute per mounted view. Successful public archive JSON responses can stay at the CDN for 60 seconds; private endpoints and errors are not given public cache headers. After an edit, an already cached JSON result can remain visible for up to two minutes across the CDN and browser caches (less when CDN `Age` is available).

The four evening Fantrax refreshes update current-season data and scores within the seven-day correction window. They preserve archive caches, older final scores, the weekly player directory and the verified scoring-season selector. Scores are fetched once more seven days after a matchup ends, then retained until cache eviction or an explicit refresh. An authenticated `POST /api/revalidate?external=1` refreshes the saved snapshot and clears all Fantrax and archive caches when historical corrections need to appear. Scheduled jobs require `CRON_SECRET`; see [Fantrax operations](docs/data.md#fantrax-refreshes-and-final-weeks). No external calls were added to archive season pages.

Public archive search opens inline in the top bar on every public page. Results appear below the input; Arrow keys select, Enter opens a match, and Escape dismisses. The mobile Search button focuses the same input without navigating. Optional full results use `/search?q=...&type=players&page=2`; `type` also accepts `teams`, `awards`, and `seasons`, or defaults to all four. Former team identities and current or older award names are searchable. Award results show their trophy artwork and link to the award's winners page.

Search prioritizes exact names and whole words, then prefixes, substrings, and conservative single-typo matches. Among equally good player matches, career fantasy points put established players first: `mcd` leads with Connor McDavid and `quinn` with Quinn Hughes. Ranking uses the existing archive rather than an external popularity service. Search matches a single cached public directory on the server; typing never fetches Fantrax data. Two characters and a 200 ms debounce (250 ms on the full results page) limit requests, and result links do not prefetch profiles. There is no My Team feature or saved-team preference.

Player comparisons use repeated IDs: `/compare/players?player=004cq&player=00454&metric=fpg`. Up to five unique players retain URL order; omitting the metric selects fantasy points. Team comparisons retain `/compare/teams?a=4&b=5&stage=regular`. Both support browser Back/Forward. Shared links restore selections against the latest archive data rather than storing an immutable data snapshot.

Share opens a browser-generated 1200×630 PNG on player, franchise, season, and comparison pages. Copy link always remains available; supported browsers also expose native image sharing. Award and game pages offer link sharing. Images are created only after Share opens, use local or CORS-enabled artwork with text fallbacks, and are never uploaded or stored by the app. Social networks cannot discover these temporary PNGs as automatic link-preview images; send the image and link together.

The browsing feature requires **$0 in additional hosting services**: no new dependencies, search subscription, schema migration, image service, storage writes, or paid plan. Existing Vercel and Neon free-tier quotas still apply to requests and traffic. Keep accounts on their free plans; do not enable paid overflow to support this feature. See the [implementation and verification record](docs/browsing-and-sharing-plan.md#implementation-record) for measured cache size, checks, and remaining device checks.

## Deployment

The GitHub repository is connected to the Vercel project `yofhl-db`. Its production branch is `master`. Branch pushes create preview deployments; updates to `master` deploy the production site.

Configure the [environment variables](docs/data.md#environment) for each Vercel environment. Preview and production deployments use whichever database their variables identify. A preview pointed at the production database can write production data through admin actions or a lottery request after its start time.

The build command is `npm run build`, including the Coach's Corner asset preparation step. Deployments do not run database migrations or import CSVs. Review and apply required migrations with `npm run db:migrate` against the intended database before deploying code that depends on them. Imports and admin edits have their own [cache refresh behavior](docs/data.md#cache-and-derived-data).

For lottery setup, rehearsal, timing, and recovery behavior, use the [draft lottery guide](docs/lottery.md). Award artwork and stored-name mappings are documented in [public/trophies/README.md](public/trophies/README.md).

For owner invitations, account setup, logo uploads, and historical identity behavior, use the [team management guide](docs/owners.md).

## Keeper submissions

Keeper features are currently disabled on the live site. The implementation and saved submissions are retained for next year's submission window. See [keeper rules, reactivation and validation](docs/keepers.md).
