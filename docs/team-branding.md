# Team branding

Owners open **Brand studio** from **Manage Team**, at `/owner/branding`. It resolves the signed-in owner's active franchise; there is no team selector. Commissioners open a franchise's studio through `/admin/teams`, at `/admin/teams/<id>/branding`.

The studio previews three colours and a banner style. **Save branding** publishes the combination across the home roster, reigning champions card, team stats cards, franchise profile and associated player profiles. **Discard changes** returns to the last saved combination. Team names and logo uploads remain in the team-management form.

## Colours and styles

Primary fills the header and main silhouette, secondary provides contrasting bands or artwork, and tertiary provides accents and trim. The artwork uses the selected colours directly; a directional shade protects names. The bottom stripes are secondary (5px), tertiary (3px), then primary (6px).

Every team can choose Jersey stripes, Arena gradient, Heritage hoops, Split colours, Victory chevron or Diamond weave. Franchise-specific artwork is restricted to its team, both in the picker and on the server: Lalibirdies fleur/ owl, Lucifer devil, New Purrsey cat, Carolina reaper, Varrock wizard, Skellige wave, Jagrtown mullet sunrise, West Texas star, and Hooterville goose. All artwork is recolourable SVG, preserving proportions at different banner sizes.

The home roster's team name links to franchise history. Franchise championship counts and trophy art appear in the stats row below the banner. Champion cards have a readable season badge without a divider through the art. Free agents, the memorial profile and franchises without saved branding retain the league treatment.

## Storage and permissions

`league.team_management.branding` stores `{ primary, secondary, tertiary, treatment }`. Name/logo updates and historical imports preserve it. Every save validates six-digit hex colours and the permitted style, requires the existing owner or admin session and same-origin check, and shares the identity version to reject stale or competing edits. Owners cannot edit another or defunct franchise; commissioners can edit any franchise.

Public palettes use the shared league cache and are provided by the root server layout, including the initial HTML. A successful save invalidates that cache and affected pages. Browser storage and the development comparison toolbar are no longer used. `/owner/branding-demo` has been removed.

## Launch

The approved Firefox export is preserved in `league/seed/team-branding.json` with all ten active franchises. Its custom colours and selected styles are the launch values, rather than the studio's suggested presets.

1. Apply migrations: `npm run db:migrate` (adds the nullable branding column).
2. Load the approved palettes: `npm run db:seed:branding`.
3. Build and deploy, then refresh the shared league cache if the seed was applied to an already-running deployment.

The seed is transactional and fills only missing branding. Re-running it preserves subsequent owner choices, names, logos, claims and invitations. Use `DATABASE_URL_V2` for the intended database. Never run browser save tests against real teams; use an isolated database.

## Verification

`npm run test:owners` covers colour/style validation, franchise signatures, ownership, admin access, missing teams, stale updates and concurrent saves. The other league suites check regression coverage. Run TypeScript, lint and a production build. Browser checks cover authenticated editing and saving, public server-rendered colours, reload persistence, signed-out access and narrow layouts.
