# Draft lottery

The admin editor at `/admin/lottery` schedules the event and previews its presentation. Viewers watch `/lottery`, then return to the same page for the completed draft order. The public room requires no sign-in.

## Schedule and rehearse

1. Sign in at `/admin` and open Draft lottery.
2. Set a title and start time. The editor uses `America/Toronto`, including EST and EDT, regardless of the device timezone. Choose a start at least one minute in the future. Nonexistent spring times and ambiguous fall times are rejected.
3. Arrange every active team in the starting order with the arrows. The default order uses each franchise's latest season, sorting by wins, then points for, then franchise ID. The first four teams start with 40%, 30%, 20%, and 10% odds; review these defaults for the event.
4. Select at least two lottery participants. Each selected team's odds must be positive, have no more than two decimal places, and sum to exactly 100%. Unselected teams remain in the draft order with `odds: null`.
5. Open Preview presentation. Play from ten seconds before the start, pause/resume, restart, or choose View concluded lottery. The preview uses the same presentation and timing rules as the public room. It selects the last participant in the starting order as a sample winner and never saves or draws an event.
6. Save the event and review the public room. The navigation link appears 24 hours before the start, but the room can be shared as soon as the event is scheduled.

Every active franchise must appear exactly once in a saved order. Defunct franchises are excluded from new orders. Turning off Lottery for a team removes its odds, not its position in the full draft order.

## Changes after scheduling

Before the start, the editor can change the title, time, odds, and order, or cancel the event. Saving a change still requires at least one minute of lead time. Database time and the event version reject stale saves and edits after the start. Reload when another tab has changed the event.

Events store snapshots in `league.draft_lotteries`. Later franchise renames, defunct-status changes, and season imports do not rewrite those snapshots. Logos are resolved separately from current records.

If a team folds after scheduling, record the intended odds and remaining order before reconciling the event. The editor does not remove stale snapshot entries automatically. Before the start, cancel and recreate the event with the active teams, or make a reviewed database correction that preserves the remaining entries and increments `version`. Keep the franchise's database status and `league.yml` in sync. A defunct-status change alone will not remove the team from the saved draft order.

After the start, the schedule, order, and odds are locked. Once the reveal and celebration finish, Schedule another lottery archives the previous event and creates a new current one. Previous non-cancelled results remain available at `/lottery?id=<event-id>`. Only one event can be current.

## Draw and viewer behavior

There is one weighted draw for the first pick. The server uses `crypto.randomInt(10_000)` and the saved odds to choose the winner. That team moves to pick 1; every other team keeps its relative starting order. The presentation's later reveals do not run additional draws.

The first request at or after the start persists the winner. This can be a room request or the navigation summary request. A database update checks the schedule, version, cancellation, and absence of an existing winner. Concurrent requests therefore read one saved result. If nobody requests the event at its start, the first later request settles it.

Viewers use database time returned as `serverNow`, advanced locally with a monotonic browser clock. Refreshing or joining late shows the current point in the same saved event. The public API omits unrevealed result assignments and withholds the winner ID until the final reveal; the original starting order and odds remain public.

The presentation masks positions through the last lottery participant in the starting order. Positions below that are already fixed and visible. The number of picks to reveal depends on participant placement, not just participant count.

| Stage | Timing |
| --- | --- |
| Countdown | Until the scheduled start |
| Opening | 12 seconds, with a transition into Draw in progress |
| Pick reveals | Last affected pick first, then one reveal every 10 seconds |
| Final reveal | Picks 2 and 1 appear together |
| Winner celebration | 15 seconds after the final reveal |
| Complete | Final draft order remains on the page |

With participants occupying the first four positions, pick 4 appears at +12 seconds, pick 3 at +22, and picks 2 and 1 at +32. The celebration ends at +47. The preview adds a ten-second countdown, for 57 seconds total. With participants in the first three positions, the live presentation lasts 37 seconds and the preview lasts 47 seconds.

The room includes a pulsing live indicator and animated pick and row reveals. Reduced-motion preferences disable decorative motion and confetti. Team names link to their franchise pages. Logo lookup tries the latest team-season artwork, then the franchise logo, then the saved event logo, without changing saved odds or results.

## Requests and recovery

The lottery page renders dynamically. `/api/lottery` uses `Cache-Control: no-store, max-age=0` and bypasses the shared league cache.

- The room refreshes after each response, waiting one second during the live event and within 15 seconds of the start, or 15 seconds otherwise.
- A failed request shows a reconnecting state and retries after 2.5 seconds. Requests time out after ten seconds. Returning to the tab or coming back online triggers a refresh.
- The navigation summary checks every 30 seconds while visible and when the tab becomes visible again. Its badge changes from a countdown to Live, then Results after the event completes.

This is HTTP polling, with no WebSocket server or cron job to provision. A disconnected viewer catches up to the saved result on the next successful request. The application still depends on Vercel and Neon being available; the code does not guarantee uninterrupted delivery.

To check a deployment, open the public room and inspect `/api/lottery?summary=1`. Use the admin preview to check animations and the concluded layout. Run rehearsals that schedule actual events against a separate database, since even a public read can settle a scheduled draw after its start.

## Implementation and tests

| File | Responsibility |
| --- | --- |
| [lib/lottery/model.ts](../lib/lottery/model.ts) | Odds validation, Eastern Time conversion, ordering, timing, and public result disclosure |
| [lib/lottery/queries.ts](../lib/lottery/queries.ts) | Guarded draw/edit/cancel/archive queries and logo lookup |
| [lib/lottery/data.ts](../lib/lottery/data.ts) | Active franchise lookup and public event reads |
| [app/admin/lottery/actions.ts](../app/admin/lottery/actions.ts) | Authenticated scheduling and cancellation |
| [components/lottery/lottery-room.tsx](../components/lottery/lottery-room.tsx) | Shared public and preview presentation |
| [components/lottery/use-lottery.ts](../components/lottery/use-lottery.ts) | Room polling, clock synchronization, and retry behavior |
| [components/admin/lottery-preview.tsx](../components/admin/lottery-preview.tsx) | Local playback controls and sample event |

`npm run test:lottery` covers odds, timezone boundaries, reveal timing, result disclosure, order, saved logos, and database race/deadline behavior. Database tests use in-memory PGlite and do not connect to the league database.
