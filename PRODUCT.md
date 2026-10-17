# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owners of the YOFHL (Ye Olde Fantasy Hockey League), a keeper fantasy hockey league run among friends on Fantrax since 2019, plus anyone they send links to. Most visits come from links dropped in the league group chat, so phones and desktops matter equally.

## Product Purpose

YOFHL DB is the league's home: live standings and matchups, the full history (seasons, champions, awards, records, drafts, rivalries, trades), the draft lottery, keeper submissions, and shareable cards. It exists so the league's history and running jokes have a permanent, good-looking place to live.

## Positioning

Everything is about this specific league and its people: real team names, owners, banners, drafts and grudges. No generic fantasy site can copy it because the content is the friend group itself.

## Operating Context

- Owners check scores and standings during the week and react in the group chat.
- The commissioner runs admin tasks at `/admin` (seasons, teams, lottery, keepers) behind a username/password session.
- Coach's Corner: a weekly animated segment where two robot hosts, Don (Don Cherry likeness) and Ron (Ron Wilson likeness, as the user named him), banter about the league. The commissioner pastes a screenplay-style script into the admin, previews it, and publishes it. Episodes are kept in an archive.

## Capabilities and Constraints

- Next.js 15 App Router, React 18, Tailwind, Neon Postgres through Drizzle, deployed on Vercel.
- League data is cached and revalidated by tag after imports or admin edits.
- Coach's Corner has no recorded voices. Pacing comes from text timing, and sound is optional synthesized talk blips, muted by default.

## Brand Commitments

- A sports-broadcast look: navy, rink red, ice blue and gold; Archivo with its width axis; red and navy parallelogram slabs; arena banner stripes.
- Never change the site footer.
- Keep UI copy lean: cut filler labels, counters and restating subtitles, but keep labels that inform.
- No pulsing "live" dots and no repeating animation running in unison across elements; keep motion sparse and meaningful.
- Redesigns restyle and reorganize existing features rather than inventing new ones.

## Evidence on Hand

- Real league data in the database: teams, owners, logos (`/public/logos`, root PNGs), team colour palettes, seasons, drafts, awards.
- Coach's Corner art: 19 transparent robot poses in `public/coachs-corner/robots-v2` (13 Don, 6 Ron) with a manifest.
- The pilot script, opening week (draft and opening matchups), from `public/coachs-corner/scenes/opening-week.scene.json`.

## Product Principles

1. The league is the content: name real teams, owners and players, and pull their logos and colours.
2. Personality over chrome: motion and type exist to carry jokes, emphasis and timing.
3. The commissioner's weekly effort must stay small: one pasted script, instant feedback, one publish.
4. Lean copy, sparse motion, broadcast polish.
