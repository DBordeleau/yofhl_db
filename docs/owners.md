# Team management

Owners use `/owner` to claim a team, sign in, request a password reset, or edit their current name and logo. Commissioners use `/admin/teams` with the existing admin login.

The **Brand studio** link opens a dedicated editor for three team colours and banner style. Owners can edit only their active team; commissioners can open each team's studio from administration. Changes save to the database and appear throughout the public site. See [team branding](team-branding.md) for artwork, permissions and the initial palette import.

## Invite the ten active owners

1. Open `/admin/teams` and select **Generate invitation code** for an unclaimed active team.
2. Copy the code while it is displayed. Email it yourself with `https://yofhl-db.vercel.app/owner` and the team's name.
3. The owner selects **Claim a team**, enters the code, and chooses an email and password of at least 12 characters.
4. Later visits use **Sign in** with the same email and password. Invitation codes only appear under **Claim a team**. Once signed in, the navigation shows **Manage Team** beside the current team logo.

Each code expires after 14 days and can be used once. Generating a replacement invalidates the previous code. The database stores only a hash, so a lost code must be replaced. Claimed and defunct teams cannot receive new invitations. One account can claim one active team.

If account creation succeeds but claiming fails, the account still exists. The owner can retry under **Claim a team** with a replacement invitation code and the same email and password. This tab also accepts existing accounts. An unclaimed account cannot edit any team.

### The session hint

Signing in or claiming sets two cookies: the HttpOnly `yofhl_owner` session and a readable `yofhl_owner_hint=1` with the same path, five-day lifetime, `SameSite=Lax` and `secure` setting. Signing out clears both. The header only asks `/api/owner` who the visitor is when the hint is present, so anonymous visitors make no session request. Sign-in, claim, save and sign-out still refresh the header regardless of the hint. Each answer from `/api/owner` sets the hint for a valid session and clears it for an invalid or revoked one, and the owner pages refresh the header once on load, so an owner signed in before the hint existed gets it back by visiting `/owner`. The hint carries no secret; keep it readable. See [ADR 0003](adr/0003-readable-owner-session-hint.md).

**Forgot password?** sends Firebase's password-reset email. The link opens Firebase's hosted reset page. Resetting the password invalidates existing owner sessions. The site does not store passwords or provide access to them.

## Names, logos and history

`league.team_management` stores current names, uploaded logo URLs, claims and invitations. Imports and `db:sync:logos` do not write this table. Every page showing a team today (team cards and pages, search, the header team menu, the lottery, owner pages and the live scoreboard) reads its current identity from the `league.current_teams` view: the owner's name and logo, then the latest team season's, then the franchise's own. New lottery configurations use that identity too; existing lottery names remain saved snapshots, while artwork resolves to the current logo. See [ADR 0001](adr/0001-team-identity-in-database-views.md).

Season pages, standings, champions, historical rosters, trades and drafts read each season identity from `league.season_teams`, never the current one, so an owner's rename never rewrites history. Drafts and trades show that season identity rather than the spelling recorded in the Fantrax export; `npm run db:report:names` lists the rows where the two differ. Updating current branding does not rename historical seasons or alter Fantrax matching in `league.yml`. Keep maintaining that configuration for imports and future identity eras.

Owners can edit their own active team. Admins can edit any franchise, including claimed and defunct franchises. Every write checks permission on the server. Version checks reject stale edits instead of replacing a newer logo.

Uploads accept PNG, JPEG and WebP up to 2 MB and 16 megapixels. The server decodes and converts them to WebP with a maximum dimension of 512 pixels. SVG uploads are rejected. A new file is uploaded before the database switches URLs; a failed upload leaves the old identity intact. Replaced uploads are deleted unless a historical season references them. Files in `public/` are never deleted by this feature. A failed cleanup or uncertain database write can leave an unused blob; inspect storage before deleting one manually.

## Configuration

Firebase Authentication uses the Spark plan with Email/Password enabled. Add the production hostname to Authentication's authorized domains. Firebase sends password-reset mail using its standard email configuration; no SMTP service is required.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web app API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase authentication domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web app ID |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Server-only service account JSON; store as a secret |
| `BLOB_READ_WRITE_TOKEN` | Server-only token for the public team-logo Blob store |

Set the Firebase variables for the intended Vercel deployment environment and in ignored local environment files. The service account JSON and Blob token must never use a `NEXT_PUBLIC_` prefix. Production credentials are not automatically copied to previews; use isolated test resources when enabling owner writes there.

Apply database migrations before deploying code that reads `team_management`. Existing admin credentials remain configured through `ADMIN_USERNAME`, `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`.

## Validation

Keep Firebase Admin on the compatible 13.x release line while [the 14.x CommonJS/ESM dependency issue](https://github.com/firebase/firebase-admin-node/issues/3181) remains unresolved. The owner test suite checks that its Auth module loads with Node's experimental `require(ESM)` support disabled, matching the failing Vercel runtime.

Run `npm run test:owners`, `npm run test:lottery`, `npm run test:history`, `npm run lint`, `npx tsc --noEmit` and `npm run build`. Owner tests use an isolated in-memory database and cover competing claims, code rotation and expiry, ownership enforcement, stale edits, admin access and import preservation.

Signing in, claiming and saving live in the owner session module (`lib/owner/create-owner-session.ts`); the server actions only unpack forms and map its reasons to copy. It takes Firebase, Vercel Blob and the request as ports (`lib/owner/ports.ts`), wired to production in `lib/owner/owner-session.ts`. Its tests (`lib/owner/session.test.ts`) run on a disposable league with the in-memory ports in `lib/owner/memory-ports.ts`, and real image processing on tiny generated images. They cover the preamble order (origin, then actor, then rate limit) and the 30-attempt limit, session-before-claim, used, expired and second claims, name and image validation, failed uploads, refused saves deleting their upload, database errors keeping it, replaced-logo cleanup limited to the team's own upload folder, and the session hint: set by sign-in and claim, cleared by sign-out, and reconciled by the header answer. The header watcher's tests (`lib/owner/navigation.test.ts`) cover throttled focus, outages, cancelled requests, no request without the hint, and forced refreshes asking anyway.

Browser checks should use a separate database and disposable Firebase account. Check claim, sign-in, sign-out, reset, owner/admin edits, upload replacement, stale edits and mobile layout. Do not use real owner invitations for tests. Verify email delivery to your own inbox before distributing invitations; generating and consuming a reset link alone does not test inbox delivery.
