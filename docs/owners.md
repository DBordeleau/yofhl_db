# Team management

## Release status

This feature is under review on `codex/team-management`. Keep iteration local or in a preview environment with isolated test data. Do not merge or release it to production until Dillon explicitly approves a production release. The initial production merge was reverted on October 4, 2026; the Firebase/Blob configuration and unused database tables remain provisioned.

Owners use `/owner` to claim a team, sign in, request a password reset, or edit their current name and logo. Commissioners use `/admin/teams` with the existing admin login.

## Invite the ten active owners

After production release is approved:

1. Open `/admin/teams` and select **Generate invitation code** for an unclaimed active team.
2. Copy the code while it is displayed. Email it yourself with `https://yofhl-db.vercel.app/owner` and the team's name.
3. The owner selects **Claim a team**, enters the code, and chooses an email and password of at least 12 characters.
4. Later visits use **Sign in** with the same email and password. The invitation field can be left empty.

Each code expires after 14 days and can be used once. Generating a replacement invalidates the previous code. The database stores only a hash, so a lost code must be replaced. Claimed and defunct teams cannot receive new invitations. One account can claim one active team.

If account creation succeeds but claiming fails, the account still exists. The owner can use **Sign in** with a replacement invitation code instead of creating another account. An unclaimed account cannot edit any team.

**Forgot password?** sends Firebase's password-reset email. The link opens Firebase's hosted reset page. Resetting the password invalidates existing owner sessions. The site does not store passwords or provide access to them.

## Names, logos and history

`league.team_management` stores current names, uploaded logo URLs, claims and invitations. Imports and `db:sync:logos` do not write this table. Public team cards and profiles prefer its current identity over imported values. New lottery configurations use that identity too; existing lottery names remain saved snapshots, while artwork resolves to the current logo.

Season pages, historical rosters, trades and drafts retain their recorded identities. Updating current branding does not rename historical seasons or alter Fantrax matching in `league.yml`. Keep maintaining that configuration for imports and future identity eras.

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

Run `npm run test:owners`, `npm run test:lottery`, `npm run test:history`, `npm run lint`, `npx tsc --noEmit` and `npm run build`. Owner tests use an isolated in-memory database and cover competing claims, code rotation and expiry, ownership enforcement, stale edits, admin access and import preservation.

Browser checks should use a separate database and disposable Firebase account. Check claim, sign-in, sign-out, reset, owner/admin edits, upload replacement, stale edits and mobile layout. Do not use real owner invitations for tests. Verify email delivery to your own inbox before distributing invitations; generating and consuming a reset link alone does not test inbox delivery.
