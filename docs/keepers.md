# Keeper submissions

Keeper features are currently disabled on the live site by `KEEPERS_ENABLED = false` in `lib/keepers/model.ts`. Owner and admin links, reminders and sign-in copy are hidden; both keeper pages return 404, and all keeper server actions reject requests before authentication or data access. `/api/owner` returns `keepers: null` without querying keeper submissions or Fantrax. The implementation, tests, database tables and saved lists are retained.

To reopen next year's submissions, update the season, Calder season, deadline and labels in `lib/keepers/model.ts`, verify the Fantrax league/franchise mapping, then set `KEEPERS_ENABLED = true` and deploy. Update the disabled-access regression test in `lib/keepers/availability.test.ts` when reopening. The instructions below describe the feature when enabled.

Owners open **Manage Team → 2026–27 keepers** (`/owner/keepers`). Existing Firebase owner accounts and franchise claims control access. No Fantrax user secret is needed.

The window closes Friday, October 9, 2026 at 7:00 p.m. America/Toronto (`2026-10-09T23:00:00Z`). Owners can submit and revise until then. The database rejects writes at or after the deadline, including requests that began earlier. Open pages disable the form and hide the reminder when the deadline arrives. Saved lists remain readable afterward.

## Rules

- Up to 8 regular keepers total, including goalies, with position limits of 5 forwards, 3 defence and 2 goalies. For example, 5 forwards + 2 defence + 1 goalie is valid; 5 forwards + 3 defence + 1 goalie exceeds the total. There is no minimum.
- Every Fantrax `MINORS` player is automatically kept for free, outside both the total and position limits. Bench and injured-reserve players count against both limits.
- One optional rookie who was eligible for the **2025–2026 Calder Memorial Trophy**, in any position, is exempt from both the total and position limits. The owner must explicitly declare eligibility for that season. A minor player cannot also use this exemption.
- The API does not verify Calder eligibility. An owner declaration permits submission, with an admin review pending. Rejection makes the list invalid until the owner corrects it or the admin reverses the decision.

The editor loads a fresh Fantrax roster, and the server fetches it again on submission. The server validates the roster, selected player IDs, limits, declaration, account ownership and submission revision. A concurrent edit requires a reload. Minor-bench keepers are added on the server even if omitted by the client.

Submitting a valid list with unused regular spots or no free rookie opens a confirmation dialog. It shows the total regular spots remaining and position options capped by that shared total, plus the optional free rookie exemption when unused. Owners can review their selections or submit anyway. This is a reminder, not a minimum keeper requirement. Existing minor-bench players remain automatic keeps; the dialog does not infer minor or rookie eligibility.

Owners can move eligible players into open minor-bench spots in Fantrax, then use **Refresh from Fantrax** without leaving the form. Refresh fetches current assignments, preserves selections for players still on the roster, and automatically keeps current minor players. A rookie moved to minors releases the free rookie exemption. A kept player moved out of minors remains selected and counts against the normal limits. Removed players are identified in the refresh message. Refresh does not save the submission: owners must review and submit changes. Failed refreshes preserve the current form. The button is unavailable after the deadline.

The refresh panel explains the two free minor spots before owners select keepers. With zero or one occupied, it shows the remaining capacity and numbered instructions to move eligible players in Fantrax, refresh this form, then submit. With both occupied, it confirms their free keeps and collapses the instructions. The Fantrax link opens the league in a new tab so the draft stays open. Guidance uses actual Fantrax minor assignments; it does not label individual players as eligible.

Each player has a compact age and previous-season stats line. Age comes from the NHL birth date; 2025–2026 regular-season stats show GP/G/A/P for skaters and GP/W/GAA/SV% for goalies. Fantasy points and FP/G come from the existing league archive for that season. NHL identities require exact normalized names and matching position groups, with team matching to resolve duplicates. NHL lookups are cached for 24 hours; unavailable or ambiguous data displays as unavailable and does not block keeper selection.

## Admin review

Open **Admin → Keeper submissions** (`/admin/keepers`). All active franchises appear, including unclaimed teams and missing lists. Expand a team to review kept and unkept players, approve or reject rookie eligibility, and copy a valid list of players to drop. Rejection requires a note visible to the owner. Lists awaiting rookie approval are marked for review rather than ready for drops. Owners can still revise a ready list before the deadline.

Review decisions are stored per player and Calder season and survive owner edits. Switching rookie selections cannot erase a rejection. Existing declarations without the explicit 2025–2026 season must be reconfirmed; prior decisions without that season are not reused. Admin reviews also use revision checks so a stale review cannot apply to a changed list. Admins may review after the deadline; owners cannot revise after it. A rejected list then needs commissioner resolution outside the owner form.

No Fantrax transactions are performed. The commissioner makes roster drops manually.

## Storage and operation

Migration `0006_keeper_submissions` adds `league.keeper_submissions`; `0007_keeper_rookie_season` records the declared Calder season. Each franchise/season stores one submitted list, its original roster snapshot, revision and rookie decisions. CSV imports do not modify this curated table. Player IDs do not require a historical player record. Snapshot retention keeps drop lists readable after Fantrax rollover.

Apply `npm run db:migrate` before deploying. This feature uses the existing database and authentication; it needs no new service, cron job or paid dependency. Normal home-page data still refreshes daily. Editing and submitting keepers makes additional on-demand, read-only Fantrax calls. Signed-in navigation checks status on navigation, focus and save, without background polling.

Before the deadline, newer cached roster data can prompt the owner to resubmit after membership, position group or minor status changes. Older cached data never invalidates a newer submission. After the deadline the saved roster is authoritative for review; subsequent Fantrax drops do not rewrite it.

The season and deadline are explicit constants in `lib/keepers/model.ts`. Before a future season, update those constants and the Fantrax league/franchise mapping. They do not roll forward automatically.

## Verification

`npm run test:keepers` covers position limits, automatic minors, refresh reconciliation, season-specific rookie declarations and rejection, player identity matching, ages, prior-season stats, invalid IDs, roster changes, exact deadline boundaries, SQL ownership enforcement, stale/concurrent saves, and durable admin decisions. Database tests use isolated PGlite, never real keeper lists. Run `npm run test:owners`, `npm run test:snapshot`, `npm run lint`, `npx tsc --noEmit` and a production build for the surrounding flows.
