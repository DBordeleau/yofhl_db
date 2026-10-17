# Browsing and sharing implementation plan

Make the YOFHL archive easier to search, navigate on a phone, and share. Visitors should be able to find a player, franchise, owner, or season from any public page, follow useful relationships through the archive, and open a comparison link that restores the sender's selections.

This plan targets the current local `domain-launch` working tree, including its uncommitted changes. The inspected base commit is `498b44e`. Planning date: October 16, 2026.

## Implementation record

Implemented locally on `domain-launch` on October 16–17, 2026. The sections below retain the original design rationale and acceptance checklist. My Team remains excluded and owner searches only open franchise pages. No deployment, account upgrade, storage upload, migration, or dependency installation was performed for this feature.

The implementation adds inline header search, optional `/search` full results, `/api/search`, compact mobile navigation, URL-driven player and team comparisons, Explore next on the listed detail pages, and five browser card templates. The shared native dialog is `components/dialog.tsx`; sharing lives in `components/share/share-button.tsx`. Mobile navigation mounts inside the existing header so it reuses the account destination without another session subscription. Its CSS reserves mobile safe-area space and hides the bar while header suggestions are open or full-page/comparison search has focus.

Following feedback, header search now opens suggestions on the current page and uses career fantasy points to break equally relevant player matches. Exact words beat prefixes, and longer names tolerate one typo. The compact panel supports category filtering, Arrow/Enter selection, Escape/Close dismissal, and an optional full-results link. Its mobile layout keeps the logo and input in one row; the full results page uses a smaller heading and simpler category tabs.

The $0 budget is an implementation constraint. Search caches one public directory under `league:discovery`; identity, roster, matchup, and full-import invalidation refresh it. There are no per-query database reads after that directory is warm, no new Fantrax calls, and no image-rendering endpoint or image storage. Query result caches retain at most 32 entries for one minute and unsuccessful/aborted results are not retained. New search, Explore next, and mobile navigation links disable prefetching. Quota usage still depends on traffic; actual Vercel/Neon account usage was not audited. Keep free plans and do not enable paid overflow.

Observed verification:

- The production build succeeds with all 100 static pages generated; TypeScript passes. Lint has only the existing `record-book.tsx:115` unused-expression warning.
- The initial browsing/data/cache/owner/rivalry run passed 29 tests. The search revision passes 12 focused browsing/data tests, including the requested McDavid/Hughes rankings, specific-name precedence, single-typo handling, and ranking updates after stats refresh. Data checks use in-memory Postgres and forbid network access. They also verify a warm directory serves different terms without SQL, scoped invalidation, former owner destinations, incomplete-season exclusion, canonical player IDs, concurrent/cancelled loads, URL bounds, and matching export/chart values.
- The production directory contains 2,017 entries: 1,980 players, 14 franchises, 15 owner/franchise relationships, and eight seasons. After adding ranking metadata and removing player-ID aliases, serialized size is 284,944 bytes. The initial localhost spot check returned warm API responses in 15–17 ms; this is not a phone/network performance benchmark.
- Inline search was verified against production data: `mcd` leads with Connor McDavid, `quinn` with Quinn Hughes, and `mcdavd` finds McDavid. Typing and mobile Search preserve the current player-page URL. Arrow selection, Enter navigation, Escape from category controls, Close/focus return, reopening, empty results, owner team destinations, and optional View all navigation work. Header search fits 320, 390, 768, and 1024 px; screenshots are `output/browsing-qa/header-search-mobile.png` and `header-search-desktop.png`.
- Browser checks verify search category history, player comparison handoff, automatic chart loading, player metric Back/Forward, team/stage Back/Forward, Browse Escape/focus return, Copy link, and PNG download. A fresh five-player URL restores every name and the selected metric. `/compare` redirects with query parameters intact.
- Search and player comparison pages have no horizontal page overflow at 320, 390, 768, and 1024 px. The mobile bar disappears at the desktop breakpoint and while search is focused. Owner results lead to their related teams.
- All five templates produce readable 1200×630 PNGs. Local QA images are in `output/browsing-qa/`. The browser renderer is a separate lazy chunk and is absent from the initial search HTML.

Before a public release, check actual iOS Safari and Android Chrome keyboard/safe-area behavior and native share-sheet cancellation. The desktop browser exposes native image sharing, but no image was sent to another app during testing. Clipboard denial, unavailable CORS artwork, and canvas failure have fallbacks in code; these browser failure modes were not forced in this local session. Review the hosting dashboards for available free-tier capacity before deployment. These device and account checks remain explicit limits of the local verification.

## Agreed scope

My Team is excluded. Owner search results open related team pages. There will be no public owner profiles, saved favourite team, new account preference, or change to the existing Sign in and Manage Team flow.

| Included | Result for the visitor |
| --- | --- |
| One public search | Find players, current and former team names, awards, and seasons from the same input. |
| Compact mobile navigation | Reach Home, Search, Compare, and Browse without scrolling to the top. |
| Explore next | Follow a small number of relevant links from public detail pages. |
| Player comparison URLs | Restore selected players, their order, and the chart metric on another device. |
| Browser share cards | Preview, download, or share an image representing a public page or comparison. |

Use the existing Archivo typography, navy panels, rink blue, red accents, team branding, badges, and trophy artwork. This is an extension of the existing design. Search services, a general recommendation engine, saved comparisons, live scoring changes, and automatic image uploads are outside this release.

## What already exists

| Area | Current implementation | Consequence for this feature |
| --- | --- | --- |
| Navigation | `components/header.tsx` and its CSS module provide desktop menus and a mobile accordion at widths below 1024px. | Reuse the destinations and desktop menus; replace the mobile accordion with compact browsing controls. |
| Public layout | `app/layout.tsx` loads cached public navigation data. Private account state loads separately through `lib/owner/navigation.ts`. | Keep public pages cacheable and retain the current account endpoint and refresh behavior. |
| Search | `components/search-bar.tsx` is a controlled input used for local filtering. `/api/players/search` searches career names after three characters and returns ten players. | Add a separate public discovery query. Keep table filters and admin pickers working. |
| Player comparisons | `app/compare/players/page.tsx` holds selections in React state. `components/compare-button.tsx` hands over one player through `sessionStorage`. Data loads sequentially after pressing Compare. | Replace the handoff and comparison state with an explicit URL contract. |
| Chart | `components/player-comparison-graph.tsx` owns its FPts/FPG toggle and compares overlapping seasons. | Lift the metric into URL state and extract the plotted data rules for reuse by image export. |
| Team comparisons | `/compare/teams?a=4&b=5&stage=regular` restores initial state. The client updates the URL using `replaceState`. | Preserve this contract and make Back/Forward behavior consistent while adding sharing. |
| Historical identities | `league.owners`, `team_seasons`, `franchises`, and `team_management` distinguish historical ownership from current branding. | Search old team names while retaining their current franchise destination. |
| Detail navigation | Teams and seasons have `PageContents`; players have section anchors. `teamSeasonHref` already builds links to standings or playoff entries. | Explore next should connect pages and reuse their valid anchors. |
| Assets and exports | Logos are local or on Vercel Blob. There is no general share-card renderer. | Add an export module that loads only on demand and handles unavailable artwork. |

The following sections describe the agreed design before implementation; the implementation record above records what was delivered and verified.

## Main journeys

1. From a player page, open Search, type a former team name, and open that franchise. The result names the current franchise and explains the historical match.
2. Search an award name, including an older name, and open its winners page.
3. Open Compare on a player page, add another player, switch to FP/G, and copy the link. A recipient sees the same ordered players and metric without selecting anything.
4. Finish reading a season, follow its champion or scoring leader through Explore next, then return using browser Back.
5. Open Share on a comparison, preview a card, and send the PNG through the phone's share sheet or save it. Copy link remains available even if image generation fails.

## Unified search

### Entry points and presentation

Search is a visible input in the top bar, with grouped suggestions directly below it. Opening and typing preserve the current page. The mobile Search button focuses this same input. The optional "View all results" link opens `/search` with the current query and category. Arrow keys select suggestions, Enter opens the selected or first result, and Escape, Close, outside clicks, and focus leaving dismiss the panel. Closing returns focus without reopening it.

The page contains one labelled input, All / Players / Teams / Awards / Seasons filters, and grouped results. Its placeholder is "Search by name or season". Preserve local table searches, whose labels should describe their narrower scope.

Use `/search?q=crosby&type=players&page=2` for a filtered search. Omit default parameters. Empty search shows links to player leaderboards, all teams, and seasons. It does not claim to show popular or recent searches without supporting data.

Searching starts at two normalized characters, with a 200ms debounce in the header and 250ms on the full results page. The latter has an explicit submit button. One character shows a short hint. The UI cancels obsolete requests and never renders a result from an older query over a newer one. Keep a distinct loading state, empty state, and error state with Retry. Preserve the input and filters during an outage.

All shows up to five results per nonempty group, with a count and a "View all players" style link. A selected type shows 25 results per page. Search results are ordinary links, supporting new tabs and native browser actions. Do not add combobox roles unless an actual arrow-key suggestion interface is implemented.

The query draft replaces the current URL after debouncing. Explicit submission, type selection, and page changes push history entries when the destination differs. Changing the query or type resets pagination. Back/Forward rehydrates the input, filters, and results. Clear returns to the empty search state. A normal GET form must provide a usable fallback without client JavaScript.

### Result rules

| Type | Searchable fields | Display and destination |
| --- | --- | --- |
| Player | Archive player name and canonical ID | Name, positions when known, and archive context; link through `playerHref`. Include valid profiles with no career totals and label missing statistics. |
| Team | Current managed name, imported names, franchise display name, and recorded abbreviations | Current name and badge. For an alias match, add "Formerly ..." and its season range. One result per franchise; `/teams/<id>`. |
| Award | Display name, stored name, and catalogue ID | Display name, trophy artwork, and the award's honour; link through `awardHref` to its winners page. |
| Season | End year and season label, accepting `2025-26`, `2025/26`, and `2025-2026` | Full season label and champion or cancelled status; `/season/<end-year>` when that archive route is available. |

Older award names remain searchable. For example, "Hasek Trophy" finds the Hasek Award and "Teemu Trophy" finds the Teemu Selanne Trophy. Owner-only results are no longer indexed.

The archive keys seasons by end year. A bare `2026` prioritizes `2025-26`; it must not silently become `2026-27`. Only index season pages that the route can serve. If a known current season exists only on the home page, link it to `/#current-season` and label it "Current season". Do not make archive search fetch Fantrax to discover a season.

Use imported identity history in the first release. Extra YAML-only aliases that have never appeared in imported records can be a later import enhancement. Do not import filesystem-based database scripts into request handling just to read aliases.

Normalize case, diacritics, punctuation, and repeated whitespace while preserving the original labels. Rank exact canonical names first, then whole-word and exact-alias matches, token prefixes, and substrings. Allow one insertion, deletion, substitution, or adjacent transposition in a single unmatched query token of at least five characters, after stronger matches. Among equally strong player matches, sort by career fantasy points from the existing `player_careers` view. Specific names still beat prominence. Finish ties with active/defunct status, display name, and entity ID. Player IDs are stable link keys rather than name aliases. This puts McDavid first for `mcd` and Quinn Hughes ahead of Gage Quinney for `quinn`, without a hardcoded star list or external service.

### Data and caching

Add `lib/search/model.ts` for normalization, matching, grouping, and pagination. Add `lib/data/search.ts` for a compact public directory containing names, IDs, aliases, awards from the shared catalogue, season availability, and result metadata. Query only those fields. The directory remains on the server; return matching results to the browser.

Expose `searchPublicDirectory(query, { type, page })` behind `/api/search` and use the same function for the server-rendered `/search` page. Return the normalized query, selected type, grouped results, per-type counts, and pagination. Each result has a typed kind, stable key, title, subtitle, internal href, and optional public badge URL. An owner result's key includes both owner and franchise IDs.

Cache the directory with the existing `cached` helper and a new `leagueTags.discovery` tag. Add that tag to `teamIdentityTags` so managed renames invalidate search. Include it in curated edit invalidation for roster and matchup changes that affect profile availability or champion metadata, and verify all directory fields against their write paths. Full imports already invalidate `LEAGUE_TAG`. Do not create a permanent cache entry for every arbitrary search string.

Use `publicJson` for successful public results and uncached error responses. Reuse the bounded browser result cache, with its existing one-minute lifetime and CDN Age handling. Search can inherit the documented short post-edit staleness; it should not promise instant propagation across already cached responses.

Cap input at 60 characters, validate type and positive integer page values, and cap returned rows. Never select `owner_email`, `owner_uid`, invitation fields, or private account data. No database migration or external search service is expected for the initial directory approach. Measure directory size and warm search latency before deciding whether indexed SQL is needed.

## Compact mobile navigation

Below 1024px, use a bottom bar with four labelled controls. Keep a compact brand header at the top and remove the duplicated mobile hamburger accordion once the bottom bar ships.

| Control | Behavior |
| --- | --- |
| Home | Link to `/`. |
| Search | Focus and reveal the top-bar search input on the current page. |
| Compare | Link to `/compare/players`. Both comparison pages also show a Players / Teams switch. |
| Browse | Open a short menu containing Players, Teams, Seasons, Awards, Record book, Compare teams, and the existing Sign in or Manage Team action. |

Keep the bar visible while scrolling on public browsing pages, including `/lottery`. Exclude it on `/admin` and `/owner` flows so it does not compete with editing controls. Existing private navigation continues to work. This release does not add a My Team destination.

Pass the existing account action or owner state from `Header` into Browse. Keep one owner-navigation subscription rather than adding a second `/api/owner` fetch for mobile controls. The owner endpoint needs no new fields for this scope.

Use at least 44px touch targets and visible text under each icon. Reserve document space for the bar plus `env(safe-area-inset-bottom)` so the last result or button remains reachable. Avoid global fixed heights that cut off content in landscape or at 200% zoom.

Browse is a modal dialog with a visible close button, focus containment, Escape dismissal, and focus restoration. Opening it must not create a route-history entry. Close it when a destination is activated, including same-path links with different hashes, and when crossing the desktop breakpoint. Suspend background navigation while a page dialog is open. Follow the [WAI modal dialog interaction pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Hide the bottom bar while header suggestions are open or the full-page/comparison search field has keyboard focus on a phone. Restore it on dismissal, blur, or navigation. Verify this on actual iOS Safari and Android Chrome because desktop viewport simulation cannot establish software-keyboard behavior.

The top header remains nonsticky. `PageContents` stays responsible for on-page section navigation. Check its scroll offsets, expanded menu height, and stacking with the bottom bar. Use one route map for desktop and mobile destinations, preserving current record links and both comparison routes. Close desktop dropdowns when opening Search or changing route.

## Shareable player comparisons

### URL contract

Use repeated `player` parameters in selection order and one metric parameter:

```text
/compare/players?player=<canonical-id-1>&player=<canonical-id-2>&metric=fpg
```

`player` accepts one to five distinct canonical player IDs. Use `playerSlug` for URL values, keeping database IDs unchanged. `metric` accepts `fpts` or `fpg`, with `fpts` as the default and omitted from canonical URLs. Names, computed statistics, chart colours, and session data do not belong in the URL.

Preserve selection order so card order and series colours match the sender's view. Do not alphabetize IDs during canonicalization. Deduplicate after normalizing starred and unstarred IDs. Reject malformed or overlong identifiers before lookup and keep at most the first five valid unique selections, with an inline explanation if the URL exceeded the limit.

| URL or interaction | Required behavior |
| --- | --- |
| No players | Show the picker and explain how to start. |
| One player | Resolve their name and show the selection; prompt for one more. |
| Two to five players | Load and display the comparison automatically. No extra Compare press. |
| Add, remove, or change metric | Update the URL and view together. Push a history entry for the explicit action. |
| Refresh, paste, new tab, Back, Forward | Restore the same ordered selection and metric. |
| Invalid metric or duplicate IDs | Use defaults or deduplicate, then normalize with replacement history. |
| Unknown player | Identify the unavailable selection and offer removal. Never substitute a different player. |
| Data request failure | Keep the selected ID, show Retry, and distinguish failure from a missing profile. |
| Fewer than two usable profiles or no common seasons | Explain the limitation and keep editing available. |

URLs reproduce the selected view against the available archive data. They do not freeze historical values against later corrections or imports. A generated image is a snapshot and should state the archive period and export date.

### Implementation

Add a pure `lib/compare/state.ts` module for parse, normalize, and serialize behavior. It is the single URL contract used by page entry, player links, selection actions, and sharing. Bound the incoming query size, accept only supported identifier syntax, and cap profile lookups at five even for a deliberately oversized URL.

Split the current page into a small route wrapper and a comparison client module. Parse URL state through `useSearchParams` inside a Suspense boundary, then resolve at most five player profiles concurrently using the existing player endpoint. The route wrapper supplies stable loading UI and metadata. Reuse the bounded public result cache for profiles and add cancellation so a removed selection cannot repopulate the chart.

Use the native history API for these client-owned selections, with `useSearchParams` as the source of truth. Do not keep an independent selected-player array that can drift from the URL. Next.js 15 documents history updates integrating with its router hooks in [Native History API](https://nextjs.org/docs/15/app/getting-started/linking-and-navigating#native-history-api).

Change `CompareButton` to a normal link to the comparison URL containing that player. Remove the `comparePlayer` session-storage handoff. A stale key can be ignored; it must never override an explicit URL.

Make `PlayerComparisonGraph` accept `metric` and `onMetricChange`. Extract the shared-season alignment and value handling into `lib/compare/model.ts`, then use the same series for the chart, an accessible values table, and export. Preserve the current overlapping-season comparison rule for this release. State that rule next to the chart and explain an empty overlap. Adding an all-seasons mode or year-range filter is a separate enhancement that would require its own URL parameters.

Remove blocking alerts. Disable already-selected search results and explain the five-player limit inline. After adding a player, clear the player query and return focus to it. Reuse the public search matching rules with `type=players`, while leaving the existing admin picker endpoint compatible.

Metric changes use already loaded data. Player fetches validate HTTP status and retain the distinction between 404 and a temporary failure. The chart must never imply a complete comparison when one selected profile is missing. Show any available data with a visible incomplete-state notice; enable image export only when every selected player resolves and the shared series is nonempty.

For team comparisons, retain `a`, `b`, and `stage`, and make the client follow these values on Back/Forward as well as initial load. Keep pair selection order. Share actions must include the displayed stage. Expanded trade lists, hovered games, and animation progress are transient presentation and do not enter the URL.

## Explore next

Use one small server-rendered module for two to four relevant links near the end of a detail page. Each link has a concrete title and a one-line reason. Keep existing contextual links near the relevant stats; Explore next gives the visitor a useful continuation after reading the page.

| Page | Candidate links in priority order |
| --- | --- |
| Player | Compare this player; latest recorded franchise if present; highest-scoring recorded season with available archive page; most recent award history. |
| Team | Compare this franchise; most recent championship season, otherwise most recent available season; leading franchise player; all teams. |
| Season | Champion franchise when applicable; top scoring player; previous available season; next available season. |
| Award | Latest winner's player or team page; that winning season; all awards. |
| Record game | The two franchises; their comparison with the correct stage; that season's archive when available. |
| Player comparison | Each selected player profile, up to the shared four-link limit; labelled "Explore these players" if necessary. |
| Team comparison | Both franchise profiles and the most recent shared archive season. |

For team comparison entry from a single franchise, use the existing `a` parameter and show that the second team is the comparison page's default. Do not describe that automatically chosen opponent as a special rivalry. Deriving a statistically meaningful rival can follow later.

Generate candidates from data already loaded for the page. Where a small lookup is necessary, fetch it server-side alongside the existing data. Avoid a per-card fetch waterfall and avoid loading the full rivalry dataset just to render a related link.

Remove duplicate destinations and self-links. Only emit an anchor when the destination exists. Use `teamSeasonHref`, `playerHref`, and the canonical award helpers. Historical data needs historical wording: use "Last recorded team" instead of "Current team" for `PlayerProfile.team`, which comes from archive career data.

Cancelled seasons have no invented champion. Free agents have no invented team. Missing owners produce no owner recommendation. Omit unavailable recommendations and show fewer links. Respect the Gaudreau memorial page's existing wording and visual treatment when adding general navigation and sharing.

## Browser share cards

### What is shared

Add a Share action to player, team, season, player-comparison, and team-comparison pages. It opens a dialog with Copy link, a card preview, Download PNG, and native Share image when supported. Award and record-game pages can use Copy link in this release; image templates for them are follow-up work.

| Template | Card content |
| --- | --- |
| Player | Name, positions, archive career FPts, archive FP/G, championship count, and archive coverage. |
| Team | Current name and badge, franchise W-L-T, Jagr Cups, and archive season span. |
| Season | Season label, champion and badge when available, or explicit cancelled-playoffs wording. |
| Player comparison | All two to five player names, metric, shared season span, compact chart with legend, and source label. |
| Team comparison | Both names and badges, selected regular/playoff stage, existing head-to-head summary, and covered seasons. |

Use one landscape output size, 1200 by 630 pixels, for the first release. Include YOFHL branding, readable context, export date, and a short site label. Share the full canonical URL as text alongside the image. Build it from the current deployment origin and supported public state, without unrelated tracking parameters. Preview links remain preview links. Do not print a long query string in tiny type or add a URL shortener solely for cards.

Keep all selected comparison players visible, including five-player selections. Use measured text wrapping and constrained chart space. Compare-series colours match the page; legends and labels identify players without relying on colour alone. Do not recompute career FP/G from rounded season values or present an unweighted average as a new statistic.

### Rendering and fallback behavior

Use a browser-only Canvas 2D renderer with a small `renderShareCard(model): Promise<Blob>` interface. Model construction stays separate from drawing so it can be tested against page data. A dedicated data-driven card avoids dependence on responsive DOM layout, Recharts animation frames, and a screenshot library. Lazy-load the renderer when Share opens.

Wait for the required font and images before drawing, with bounded timeouts. Use same-origin artwork where possible and CORS-enabled loading for supported external logos. If an image is unavailable or unsafe to draw, use the existing team abbreviation treatment. An export must remain useful without a logo. Canvas export can fail when its bitmap is not origin-clean, and `toBlob` can return null; handle both outcomes explicitly. See [Canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob).

Prepare the Blob while the preview dialog is open. Enable Share image only after it is ready; invoke `navigator.share` directly from that later button click. This avoids losing the user activation while waiting for rendering. Check `navigator.canShare({ files })` for file support. Native sharing requires a secure context and user activation, and user cancellation is not an error. See [Navigator share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share).

Keep Download PNG and Copy link available as independent actions. When clipboard access fails, show a selectable URL. On devices where downloading opens an image instead, provide the image preview and brief save instructions. Revoke object URLs when replacing or closing a preview, after any download has had time to consume the URL.

If page state changes while a card is rendering, discard the old result and render the current model. Never let the image depict one comparison while the copied link describes another. No image upload, persistent image storage, or new server rendering endpoint is required.

### Link previews

A downloaded browser card does not become the automatic preview image for a pasted link. Messaging crawlers need an image they can request over HTTP. Keep page titles and descriptions useful, and add a generic same-origin YOFHL Open Graph image if needed. Comparison-specific automatic previews would require a separate server image route or stored image and are outside the browser-card scope. Next.js describes that separate mechanism in [Metadata and OG images](https://nextjs.org/docs/15/app/getting-started/metadata-and-og-images).

## File and module plan

Names below describe the intended responsibility; avoid creating empty abstraction layers just to match a folder list.

| Proposed files or changes | Responsibility |
| --- | --- |
| `lib/search/model.ts`, `lib/data/search.ts`, `app/api/search/route.ts` | Public directory, matching rules, result contract, and bounded responses. |
| `app/search/page.tsx`, `components/search/search-results.tsx` | Server entry and shared search interactions; use the same query function for initial results and later requests. |
| `components/header.tsx`, `components/header.module.css` | Search entry and desktop integration. |
| `components/navigation/mobile-nav.tsx`, associated CSS, `lib/navigation.ts` | Bottom bar, Browse dialog, and shared public destinations. |
| `app/layout.tsx`, `app/globals.css` | Mount the small navigation shell and reserve mobile safe-area space without making data pages client-rendered. |
| `lib/compare/state.ts`, `lib/compare/model.ts` | URL contract and shared chart-data rules. |
| `app/compare/players/page.tsx`, `components/compare/player-comparison.tsx` | Replace page-local selection and click-to-load behavior. |
| `components/compare-button.tsx`, `components/player-comparison-graph.tsx` | Real comparison links, controlled metric, and responsive chart layout. |
| `app/compare/teams/page.tsx`, `components/rivalries/rivalry-centre.tsx` | Preserve team URL contract and fix history synchronization as needed. |
| `components/explore-next.tsx`, `lib/explore.ts` | Render, deduplicate, and validate related destinations supplied by detail pages. |
| Public player, team, season, award, record-game, and comparison pages | Supply related-link candidates and the applicable share models. |
| `components/share/share-dialog.tsx`, `lib/share/model.ts`, `lib/share/render-card.ts` | Shared link actions, preview lifecycle, public card data, and browser PNG rendering. |
| `lib/data/cache-tags.ts`, `lib/data/cache.test.ts` | Discovery invalidation alongside existing identity and curated-edit invalidation. |
| Focused test files and `package.json` | Add a `test:browsing` command using the existing Node test runner. |

Expected infrastructure impact: no schema migration, no new account storage, no external search subscription, and no mandatory rendering dependency. This estimate assumes the measured server directory remains small enough for in-memory matching.

## Delivery sequence

These are five reviewable implementation slices. Each should leave the application usable. The overall feature is complete only after all five and the final phone checks.

| Slice | Work | Exit condition | Rough engineering effort |
| --- | --- | --- | --- |
| 1. Search | Directory, ranking, award aliases, `/search`, endpoint, cache invalidation, desktop entry | All four entity types return correct destinations; empty/error/history states work. | 1.5 to 2.5 days |
| 2. Mobile navigation | Bottom bar, Browse menu, account destination, safe-area spacing, section-nav integration | Every core public destination is reachable at phone widths without overlap or focus traps. | 1 to 1.5 days |
| 3. Comparison URLs | Parser, real links, automatic concurrent loading, controlled metric, team history consistency | A copied link reproduces the view on another browser; refresh and Back/Forward work. | 1.5 to 2 days |
| 4. Explore next | Page-specific candidates and common rendering | Covered detail pages offer valid, relevant next steps, including sparse historical cases. | 0.5 to 1 day |
| 5. Share cards | Renderer, five templates, preview, downloads, native sharing, failure states | Images match visible data and supported devices can share or save them. | 1.5 to 2.5 days |
| Integration | Phone/browser checks, regression review, documentation | Acceptance checklist below passes. | 1 to 1.5 days |

Planning estimate: roughly 7 to 11 focused engineering days for one developer. This is a scope estimate, not a delivery commitment. The main uncertainties are five-player card legibility, mobile keyboard behavior, and integration with the branch's ongoing navigation and data-cache work.

Comparison URL state can be implemented before search if a smaller first delivery is preferred. Share cards depend on the settled comparison model. Explore next should use the canonical comparison links once slice 3 is ready.

Before each slice, inspect the working-tree diff again. Header, layout, player URLs, cache tags, records, and both comparison pages are already being changed locally. Preserve their final behavior and avoid replacing them with versions from the branch's last commit.

## Validation and acceptance

### Focused automated checks

Use the existing Node test runner and PGlite patterns. Test behavior through the public query, comparison, and model interfaces. Do not snapshot entire rendered pages just to mirror markup.

| Area | Required cases |
| --- | --- |
| Search | Case/diacritic normalization, two-character threshold, exact versus prefix ranking, renamed franchises, abbreviation matches, current and older award names, defunct teams, season ranges, pagination, and empty results. |
| Public data | Search results contain no private account fields; team rename and import invalidation update discovery; unavailable archive seasons cannot produce broken links. |
| URL state | Round-trip serialization, starred/unstarred deduplication, preserved order, zero/one/five/six players, malformed IDs, unknown IDs, invalid metric, and repeated query values. |
| Comparison loading | Concurrent resolution, non-OK responses, aborted selection changes, removal during fetch, and restoration from navigation. |
| Shared chart model | Shared years, no overlap, sparse stats, existing zero/null handling, metric switching, and identical export series. |
| Explore next | Missing team, cancelled season, no award, no champion, duplicate links, no self-link, and valid section anchors. |
| Share model | All selected players retained, selected team stage retained, correct labels and data period, state changes invalidating a pending render, and failure fallback. |

Run `npm run test:browsing` after adding it, plus affected data/owner tests, `npm run lint`, and `npx tsc --noEmit`. Run a production build before handoff with a reachable database. Follow the existing README warning about stopping a development server before building in the same checkout; use a separate build checkout if the running session must stay available.

### Browser acceptance checklist

- [ ] At 320, 390, 768, and 1024px widths, navigation and search have no page-level horizontal overflow. Check 200% zoom and landscape too.
- [ ] Actual iOS Safari and Android Chrome keep search controls usable with the keyboard open and the device safe area present.
- [ ] Keyboard users can reach and dismiss Browse and Share dialogs, see focus, and return to the invoking control. Reduced-motion preferences are respected.
- [ ] Search returns useful results for a player, current team, old team name, abbreviation, award, and season label. Clearing or changing a query cannot reveal stale responses.
- [ ] Award results show the current name and trophy artwork and lead to the correct winners page, including matches on older names.
- [ ] Existing Sign in and Manage Team destinations still work. No My Team control or saved-team preference is introduced.
- [ ] Player Compare links work in a new tab. A two-player and five-player URL restores the same names, order, colours, and FPts/FPG metric in a clean browser session.
- [ ] Back/Forward restores search state and both comparison types. Legacy `/compare` redirects continue to preserve query parameters.
- [ ] Chart labels and the values table remain legible on a phone. Empty overlap and missing profiles are explained without showing misleading complete results.
- [ ] Explore next links resolve for a player, active franchise, defunct franchise, cancelled season, award, and record game. Verify their anchors in the rendered destination.
- [ ] All five card templates export readable 1200 by 630 PNGs with long names, missing logos, and five comparison players.
- [ ] Native image sharing, cancellation, download, denied clipboard, missing font/image, and export failure leave a usable next action.
- [ ] Share-card code is absent from initial browsing bundles. Typing does not issue profile prefetches for every visible result or trigger uncached SQL after the directory is warm.
- [ ] Public page caching remains separate from private session reads. Search and Explore next add no Fantrax calls.

Use provisional performance targets of less than 300ms at the 95th percentile for warm search responses, excluding debounce and network transit, and a ready card preview within two seconds on the test phone. Measure these during implementation; they are targets rather than observed results. Slow image generation must not block Copy link. Confirm database query counts against a production build, since the existing cache helper bypasses caching in development.

## Definition of done

A visitor can search all four entity types from any public page, navigate the main archive comfortably on a phone, continue from detail pages without a dead end, and send a comparison URL that restores the selected view. Public player, team, season, and comparison pages can generate a usable browser image with a link fallback. The implementation passes the focused tests and real-device checks, preserves current account behavior and archive identity rules, and documents the new URLs and browser-export limitations.

The implementation follows this dependency order. Refer to the implementation record for verification results and the remaining real-device release checks.
