# Coach's Corner

A weekly animated segment at `/coachs-corner`: robot Don and Ron argue about the league at an intermission desk while a monitor cuts to league graphics. Episodes are plain-text screenplays written at `/admin/coachs-corner`, previewed live, and published to the database. Until an episode is published, the page plays the bundled pilot (`lib/coachs-corner/pilot.ts`).

## Writing an episode

For weekly agent production, invoke the repository skill with: **Use $produce-coachs-corner to produce Monday's recap of the previous Monday through Sunday, with a reviewed local draft ready several hours before the evening post.** Its [show bible](../.agents/skills/produce-coachs-corner/references/show-bible.md), [annotated pilot](../.agents/skills/produce-coachs-corner/references/annotated-pilot.md) and [production instructions](../.agents/skills/produce-coachs-corner/references/production.md) preserve the characters and explain the handoffs. The [recap and rehearsal guide](../.agents/skills/produce-coachs-corner/references/weekly-recap.md) covers the calendar, independent editorial pass, feedback and late revisions.

`npm run coachs:prepare -- --slug <slug>` captures fresh league facts and creates a local episode folder. Add `--period <n>` to select a scoring period and `--players "Name,Name"` for NHL birthplace and prior-season YOFHL fantasy stats. After writing graphics, run `npm run coachs:stats -- --slug <slug>` to discover every player/gap participant and freeze their archived stats without refreshing the live matchup snapshot. It defaults to the episode's previous season; `--season <ending-year>` selects an explicitly older comparison. `npm run coachs:check -- --slug <slug>` checks the script, assets and same-season comparisons. Open `/coachs-corner/local/<slug>` on the dev server to watch the draft, inspect review notes, and reload file edits. `/coachs-corner/local` lists local drafts. These routes are available only in local development and never publish. Use `--pilot` with prepare for an offline reference episode; it is labelled historical and contains no current facts.

For Monday recaps, add `--recap` to prepare instead of `--period`. It selects the previous Toronto Monday/Sunday week before and after Fantrax's Monday rollover. Raw API phase and timestamps stay intact; check Sunday results before calling a matchup final. A new chat starts from the producer's `handoff.md` beside the script, containing the exact source/hash, snapshot, covered dates, runtime, review notes and preview URL.

Working files live under the ignored `local/coachs-corner/episodes/`. Accepted continuity lives in `assets/coachs-corner/editorial/continuity.json`; agents promote new recurring material only after user acceptance. Archive capture uses read-only database access from the normal `.env`/`.env.local` environment, with `DATABASE_URL_V2` preferred over `DATABASE_URL`. Player records retain archive provenance separately from birthplace evidence. Missing archive records remain unknown and require a documented fallback; exact games played are unavailable in this archive and are not estimated from rounded FP/G.

A script is a short front matter block followed by lines, stage directions and monitor cues. The pilot is the full worked example.

```text
---
title: Draft and opening matchups
week: 1
season: 2027          # the year the season ends in (optional)
date: 2026-10-15      # air date, shown on the page (optional)
segment: 4:11         # planned length; the on-air clock goes red past it (optional)
pace: 198             # words per minute at normal delivery (optional)
---

[don: point, ron: rest]
>> off

RON: The YOFHL draft was Saturday, and we've got the opening matchups--

DON (point): Yeah. And put the thing up. [>> bars] The other thing.
  No, that's the standings. I don't want the standings. [>> off]

DON: !!THE DRAFT.!! That's what I said. Now, [>> pick 1 "Gavin McKenna"] McKenney goes first--

[don: stare, 1.9s] Don stares.
```

### Lines

`DON:` or `RON:` at the start of a line begins dialogue. Indented lines continue it, and a blank line ends it. Optional modifiers go in parentheses before the colon, in any order:

| Modifier | Example | Effect |
| --- | --- | --- |
| gesture | `(point)` | The pose for the line. The mouth opens and closes automatically as the words land. |
| delivery | `(deadpan)` | How the whole line is spoken (see below). |
| speed | `(fast)`, `(slow)`, `(150wpm)` | Speaking rate. `faster` and `slower` also work. |
| after | `(then stare)` | The pose held once the line ends. |

Without a gesture, a host talks in his resting pose, except that Don yells in `angry` and Ron delivers deadpan lines in `skeptical`. After speaking, a host keeps a gesture that has a closed-mouth version (point, thumbs) and otherwise returns to rest.

### Inside a line

| Markup | Effect |
| --- | --- |
| `!!SHOOT THE DAMN THING.!!` | Yell: big, heavy, red, shaking words. The camera punches in, the frame jolts and the other host flinches. |
| `**But Nick's played five more games!**` | Firm: bold words that stamp in. |
| `{sneak: text}` | Any delivery or speed for part of a line, for example `{mock slow: "Oh, I was busy."}` or `{warm thumbs: Good for Eric.}`. A gesture inside braces applies only to that span. |
| `[beat]`, `[pause]`, `[1.5s]`, `[300ms]` | A pause at that point. Punctuation already adds natural pauses. |
| `[thumbs]` | Switch the speaker's gesture from that word on. |
| `[ron: down]` | Make the other host react at that word. |
| `[>> stat "76th" "Tom Wilson"]` | Cut the monitor at that word. |
| `[cam: close don]`, `[sfx: horn]` | Camera and sound cues. |

Straight quotes, `--` and `...` become curly quotes, em dashes and ellipses. A line that ends with `--` is cut off: the next line starts at once, and the cut-off speech plate is knocked aside.

### Deliveries

| Delivery | On screen | Body |
| --- | --- | --- |
| `normal` | Regular weight, words rise in | Bobs |
| `yell` | 1.3× size, black weight, red, shaking | Shakes |
| `sneak` | Small, condensed, grey, nearly twice as fast | Still |
| `deadpan` | Flat, appears without motion | Still |
| `firm` | Bold, stamps in | Nods |
| `mock` | True italic, words wave | Sways |
| `warm` | Gold, slightly slower | Bobs |

Aliases work too: `shout`, `whisper`, `aside`, `dry`, `sarcastic`, `stern`, `soft`.

### Stage directions

A line starting with `[` holds cues for the moment between lines: `[don: stare, ron: down, 1.15s] Ron looks down.` sets both poses and holds the silence for 1.15 seconds. Text after the brackets is a note for the writer; it is not shown. `[clear]` removes both speech plates. Cues placed before the first line set the opening picture.

### Gestures

| Host | Gestures |
| --- | --- |
| Don | rest, point, thumbs, angry, surprised, lean, stare, pause, tie, mic, pound-ready, pound |
| Ron | rest, skeptical, warning, surprised, down |

`lean` (Don leaning into the camera) automatically cuts to a close-up while he talks. The image IDs and closed/open mouth pairs live in `lib/coachs-corner/cast.ts`. New poses also need generated files and, for a mouth pair, a face clip; follow [Adding or replacing artwork](#adding-or-replacing-artwork).

### Don's suits

Don has multiple suits. The original red, gold and ivory floral suit is pinned as his **normal/default suit**. Use it whenever the episode brief does not request another wardrobe. A seasonal date alone does not change the default.

| Wardrobe ID | Suit | Artwork IDs | Screenplay gestures |
| --- | --- | --- | --- |
| `normal` | Original red, gold and ivory floral, default | Existing `don-*` IDs, such as `don-default` and `don-point` | Unprefixed `rest`, `point`, `angry`, etc. |
| `halloween-2026` | Purple with pumpkins, ghosts and bats | `don-halloween-*` | Explicit `halloween-rest`, `halloween-point`, `halloween-angry`, etc. |

The [asset manifest](../public/coachs-corner/robots-v2/manifest.json) records `defaultWardrobes.don` as `normal` and labels every Don pose with its wardrobe. This is catalog metadata; the runtime mappings live in `cast.ts`. Preserve the existing normal asset IDs and unprefixed gesture mappings when adding suits so old scripts keep their appearance. There is no episode-wide suit setting or automatic calendar switch.

The owner accepted the Halloween artwork on October 18, 2026 and explicitly requested that the old suit remain the default/normal suit. This accepts the artwork and wardrobe rule; the local asset audition is not an approved episode.

Don's Halloween suit has the same 12 gestures and 15 illustrations. Add `halloween-` to a Don gesture, such as `halloween-rest`, `halloween-point`, `halloween-angry`, or `halloween-pound-ready`. The three talking pairs use the same fixed-body mouth animation as the normal suit. Lean close-ups, tie rustle and desk contact work with either outfit. The [Halloween guide](../public/coachs-corner/robots-v2/halloween-2026.md) links its preview and exact generation prompts.

Choose a Halloween gesture for the opening picture and each Don line, inline cue, delivery span that names a gesture, and `then` pose. Setting `[don: halloween-rest]` alone does not carry the suit into later dialogue. Lines without an explicit gesture still use the normal suit's delivery defaults. Open-mouth expressions return to `halloween-rest`; closed-mouth poses hold their seasonal pose. Existing episodes and the shared opening/closing bumper retain the normal suit.

```text
[don: halloween-rest, ron: rest]
DON (halloween-point): I dressed for the occasion.
RON: I can see that.
[don: halloween-tie, 700ms]
DON (halloween-angry, yell): It's a good suit!
[don: halloween-pound-ready, 220ms]
[don: halloween-pound, sfx: desk-pound, 480ms]
DON (halloween-rest, then halloween-stare): Anyway.
```

### Camera and sound

`cam:` takes `wide`, `don`, `ron`, `close don`, `close ron`, `monitor` or `auto`. An explicit shot holds until the next one; `auto` goes back to the automatic director (wide, close-ups on `lean`, punch-ins on yells).

`sfx:` takes `horn`, `whistle`, `buzzer`, `organ`, `sting`, `thud` or `desk-pound`. The first six are synthesized in the browser; `desk-pound` is an original, offline-synthesized dry impact WAV. For a restrained hit, use `[don: pound-ready, 220ms]` followed by `[don: pound, sfx: desk-pound, 480ms]`, then explicitly return to a speaking pose. The short lift precedes contact; the contact pose has a tiny settle and two brief impact marks. Motion follows show time, so pause and seek preserve its phase; reduced-motion mode omits the settle and marks. The poses alone are silent, and no new mouth pair is needed for this closed-mouth beat. Each host gets articulated robot syllables in his own voice. Quiet studio ambience runs under the dialogue, and Don's tie adjustment triggers the cloth rustle 7 recording. Every episode opens with a six-second bumper over the theme (`public/coachs-corner/coachs_corner_theme.mp3`), cut to its hits. Sound is on unless the viewer mutes it; the mute is remembered.

### Monitor graphics

`>>` at the start of a line (or `[>> …]` inside one) cuts the desk monitor:

| Command | Shows |
| --- | --- |
| `>> off`, `>> bars`, `>> static`, `>> logo` | Dark screen, colour bars, snow, the show card |
| `>> title "The Draft" "2026–27 season"` | A title card |
| `>> team HH "Leading the league"` | A team with its logo, colours and owner |
| `>> matchup HH 41.5 NPD 38 "caption"` | A head-to-head; scores and caption are optional |
| `>> pick 3 HH "Ivar Stenberg" "C · Round 1"` | A draft pick; team and detail are optional |
| `>> stat "76th" "Tom Wilson" "overall pick" Lali` | A big number with labels and an optional team |
| `>> list "Standings" HH 3-0, JAGR 2-1, "Everyone else" 0-3` | A table; rows are a team or "quoted label" then a value |
| `>> compare Reapers 158 TEEHAW 114.1, G 12 8, *Hit 29 17` | Category-by-category head-to-head; each row's leader is green. A `*` row is highlighted, and cutting to the same compare with a different highlight updates it in place |
| `>> numbers HH 1 goal, 18 assists` | Big numbers side by side, with an optional team |
| `>> gap "Tom Wilson" "William Nylander" "Nico Hischier"` | Last season's FPts side by side, each later player with his margin over the first |
| `>> player "Tom Wilson" Lali hearts "76th overall"` | A player card with his NHL headshot and last season's FPts, FP/G and games; team, `hearts` and caption are optional |

Teams can be named by abbreviation (`HH`), owner's first name (`Jeremy`) or a word of the team name (`Hooterville`). Logos and colours come from the league's current franchises; an unknown team is a warning in the editor.

## Publishing

`/admin/coachs-corner` lists every episode. The editor checks the script as you type and lists problems with line numbers (click one to jump to it). The preview is the real player; **Preview from cursor** (Ctrl+Enter) plays from the line at the cursor, and the gutter highlights the line on screen. Ctrl+S saves a draft. **Publish** is disabled while there are errors; publishing stamps the episode with the current time, and the newest published episode is the one `/coachs-corner` plays. Each episode also has its own page at `/coachs-corner/<slug>`.

**Save draft** and Ctrl+S only save unpublished episodes. To change a live episode, use **Update published episode**, which validates the entire script again. To work on it as a draft, unpublish it first. The database also enforces this rule, including when an old editor tab tries to save after another tab published the episode. There is no separate publish-by-ID shortcut.

Episodes live in `league.coachs_corner_episodes`. Apply migrations `0010_coachs_corner.sql` (episodes) and `0011_coachs_corner_players.sql` (player snapshots) to the intended database before deploying this version. `npm run db:migrate` uses the configured database; do not run it against production during a local review. Missing migrations and database failures surface as errors, rather than being cached as an empty archive. The pilot is the fallback after a **successful** query finds no published episodes.

Release check, 2026-10-17: the user authorized the production migration. Vercel's production `DATABASE_URL` and the local migrator's `DATABASE_URL_V2` were confirmed to identify the same Neon database. Both Coach's Corner migrations were already recorded; `npm run db:migrate` completed successfully without adding migration records. The nullable `players` JSONB column, unique slug index and publication index were verified afterward. No episode records were changed and no deployment was made.

Publication saves the referenced players' statistics and headshot URLs with the script. Later views use that snapshot, so imports do not silently change an old show's graphics and public requests never call the NHL APIs. Republishing refreshes the snapshot. Episodes published before the snapshot migration use cached league statistics and existing portrait URLs until republished. The accepted opening-week pilot uses its own 2025–26 YOFHL DB snapshot in `lib/coachs-corner/pilot-players.json`, also archived with its approved screenplay. An unavailable optional NHL headshot falls back to the existing portrait; a failed database lookup prevents publication.

The archive and individual episode pages use Next's caches. New episode URLs are generated on their first request without a deployment. Publishing, updating, unpublishing, and deleting a published episode invalidate the archive and affected URLs, including both sides of a rename. Draft-only saves and deletes invalidate only admin pages. Development deliberately bypasses the data cache; verify caching with a production build.

Shared media is served from content-hashed URLs under `/coachs-corner/media/` with `Cache-Control: public, max-age=31536000, immutable`. Run `npm run coachs:assets` after source edits; it also runs before `npm run dev` and `npm run build`. Commit `lib/coachs-corner/media.json` and the generated media files with the source edits. The generator retains older versions so previously cached pages can still load them. Never edit a hashed file directly or reuse its URL for new bytes. Original source URLs retain normal mutable caching. No object-storage service or paid hosting component is added.

### AVIF artwork and rollback

The player prefers static AVIF artwork through `<picture>`, with the original WebP files as the browser fallback. An AVIF load or decode error also switches that image to WebP. Both formats keep the same dimensions and transparent backgrounds. The title card, opening bumper, hosts and closing card use the same selection. There is no image transformation on a viewer's request and no new service or subscription.

`npm run coachs:assets` generates AVIF directly from the original PNG artwork in `public/coachs-corner/robots-v2/`, using quality 65 and full 4:4:4 colour resolution. It uses each WebP's dimensions for the matching 640 px or 1254 px version. Keep PNG and WebP art edits in sync. Commit the generated `.avif` sources, their hashed copies, and `lib/coachs-corner/avif-build.json`. The build record checks source bytes, dimensions, encoder settings and output hashes, so unchanged builds reuse the encoded files. Missing or corrupt output is regenerated.

The 19-pose set at this setting is 938,725 bytes at 640 px, down from 1,579,092 bytes for WebP, and 2,160,720 bytes at 1254 px, down from 5,875,338 bytes. These are artwork totals, not the entire page transfer. A browser selects one format per image. The files are shared across episodes and can remain in the browser cache. Keeping both formats adds static files to the deployment but does not add Neon work.

Retain the WebP sources and their hashed copies: they provide browser compatibility, recovery from a failed AVIF load, and the rollback below. The active WebP set totals 7,454,430 bytes across both sizes, before counting its duplicate hashed copies. AVIF-capable viewers normally request AVIF only; the WebP fallback is not an additional download on every view. The generator also reads WebP dimensions when building AVIF, so deleting these files would break the current build workflow.

**To restore WebP everywhere**, set `PREFER_AVIF = false` in `lib/coachs-corner/media.ts` and rebuild. Original WebP bytes and URLs are unchanged. This preserves all publishing and cache improvements and needs no database migration.

The conversion is lossy. Local 1920 × 1080 fullscreen comparisons showed no obvious colour shifts or transparency halos; 200% inspection showed slight smoothing in fine shading and edges. Treat this as a visual judgement, not a promise of pixel identity. To repeat the comparison, run `npm run test:coachs:production -- --keep --art-review`, then open `/art-review` on the local test server. That comparison route, its forced WebP example and its deliberately broken AVIF fixture exist only in the disposable build. They never ship as application routes.

Mouth pairs are separate illustrations with small differences in their clothing. Swapping the complete illustrations on every syllable makes the suits shimmer. The player now holds the closed-mouth body and overlays only the talking mouth region. Actual gesture changes still replace the full pose. This applies to AVIF and WebP, uses the existing files, and does not change script timing or add downloads. The comparison route's **Mouth motion** view shows whole-image swapping beside the fixed-body rendering for all seven mouth pairs, including Don's three Halloween pairs. Review the face clip boundaries in `components/coachs-corner/artwork.tsx` when replacing or adding mouth-pair illustrations.

The final release check on 2026-10-17 passed 59 feature tests, an optimized production build with type checking, and eight production publishing/cache checks against disposable Postgres. Browser checks across the artwork and TV-border revisions covered the complete 4:32 pilot at 1.5×, fullscreen, a 390 px layout, pause/resume, seeking, line navigation, mute, speed changes, replay, AVIF failure recovery and forced WebP rendering. All 38 AVIF files decoded at their expected dimensions. A before/after browser-frame comparison confirmed the clothing stays steady with the mouth overlay. These checks used the desktop in-app browser; physical devices and Safari were not tested. The production migration status is recorded above; the feature remains undeployed by this review.

Run `npm run test:coachs` for script, audio, asset-versioning, publishing, and data-cache tests. `npm run test:coachs:production` builds a disposable source copy and exercises authenticated server actions, full-route caching, invalidation, outage recovery, and HTTP media headers against in-memory Postgres. It uses dummy credentials, does not read `.env` files, and never deploys. Logs remain in `.cache/coachs-corner-verify-*`; `-- --keep` leaves the local test server available for browser review until Ctrl+C. Its `public` and `node_modules` entries are links to the workspace; do not recursively traverse those links during cleanup.

### Adding or replacing artwork

Episodes using existing gestures inherit AVIF selection, WebP fallback and the fixed-body mouth animation. Their authors only need the usual draft check and playback review. Follow these extra steps when artwork changes:

1. Keep an untrimmed, transparent 1254 × 1254 master PNG for each pose in `public/coachs-corner/robots-v2/`. Export matching full-size and `-640.webp` fallbacks from that same master. The asset generator creates AVIF, not WebP, so replacing a PNG alone leaves the fallback showing old art. Preserve the hosts' scale and placement across a mouth pair.
2. Register a new gesture in `lib/coachs-corner/cast.ts` and record its assets and generation provenance in the artwork catalog. For a distinct closed/open mouth pair, add the open pose to `MOUTH_CLIPS` in `components/coachs-corner/artwork.tsx`. Keep the closed body visible and confine the overlay to the face; clothes, hands and hair must stay still as the mouth changes. A pose used as a full-body expression should have its own ID rather than reusing a clipped mouth-overlay ID.
3. Run `npm run coachs:assets`. Include the PNGs, both WebP sizes, generated AVIFs, hashed files under `public/coachs-corner/media/`, `lib/coachs-corner/media.json` and `lib/coachs-corner/avif-build.json` with the change. Retain older hashed files for cached pages. Encoding happens locally or at build time, with the existing free tooling.
4. Run `npm run test:coachs` and the draft's `coachs:check`. For an art change, use `npm run test:coachs:production -- --keep --art-review` to compare the actual components at `/art-review`; extend its mouth-pair choices if adding a new pair. Check AVIF against WebP at fullscreen, light/dark backgrounds, and a narrow viewport. Exercise forced WebP and broken-AVIF fallback. In **Mouth motion**, watch repeated open/close transitions and check for visible clip seams or changing clothes. The catalog's `preview.html` swaps whole illustrations and cannot verify the player's mouth overlay.
5. Watch the affected passages in the real episode at normal speed, including gesture changes, close-ups and monitor shots. Check pause/resume and seeking across those cues. Record the browser, viewport, any visible smoothing or colour/edge changes, and untested devices in the episode's `review.md`. Fix a visible regression or disclose it before approval; file-size savings alone are not a quality check. The TV's bezel should remain dark with red or blue cards; its frame is CSS, separate from the host artwork.

## How playback works

- `lib/coachs-corner/script.ts` parses a script into events and diagnostics.
- `lib/coachs-corner/timeline.ts` compiles events into an absolute timeline (word reveal times weighted by syllables, mouth flaps, poses, monitor cuts, camera, sounds) and answers `frameAt(timeline, t)` as a pure function. Seeking, scrubbing, skipping lines and the admin preview all read the same frames.
- `components/coachs-corner/` renders the frame: `use-show.ts` runs one animation-frame clock and re-renders only when something visible changes, `studio.tsx` draws the set and speech plates, `monitor.tsx` the graphics, and `audio.ts` plays synthesized voices, effects, ambience, and recorded samples.
- Before the first play the page shows the bumper's last frame as a title card, and the same card wipes back in when the episode ends.
- The rafters behind the hosts hang the league's eight most recent championship banners, in each champion's colours.
- Each pose has 640 px and 1254 px AVIF sources, with equivalent WebP fallbacks. Only the poses an episode uses are loaded; those poses are still loaded eagerly to keep pose changes immediate.
- Reduced motion turns off the camera moves, shakes, word animations and crossfades and keeps the timing and type.

Tests: `node --import tsx --test lib/coachs-corner/*.test.ts`.

## Mobile playback

The phone player uses a taller studio, 16px minimum dialogue, and two complete caption rows. Captions remeasure when the player resizes, including rotation while paused. The control rail keeps every action at least 44px wide and tall, with an extra row on the narrowest phones. Horizontal timeline drags seek; vertical swipes scroll the page without changing the playhead.

Fullscreen scales the studio and its text from the actual picture width. Rotated phones get a single control row below the picture. If native fullscreen is missing or rejected, the player expands in the page with an Exit full screen button, Escape support, and restored focus and background scrolling on exit.

Run `node scripts/coachs-corner/verify-mobile.mjs` against a running local app. It requires Playwright (`PLAYWRIGHT_MODULE` can point to an existing package directory, and `PLAYWRIGHT_EXECUTABLE` can select an installed Chromium executable). `COACHS_BASE_URL` defaults to `http://localhost:3000`. Checks cover 320–1440px layouts, paused rotation, portrait and landscape fullscreen, the fullscreen fallback, touch dragging versus page scrolling, cancellation, playback, sound, speed, and replay. Screenshots go to `.cache/coachs-mobile/`. These are Chromium emulation checks; physical Galaxy devices, Samsung Internet, and Safari need device testing.

## Episode audio

The approved studio mix is the default for every episode, including the complete first episode at `/coachs-corner/opening-week`. It uses Don's softened robot voice at 120%, Ron at 200%, studio ambience at 45%, cloth rustle 7, and the original synthesized TV switch at 100%. The intro theme stays; there is no background music during dialogue. Audio is generated from each episode's full script, so new episodes inherit this mix without separate sound authoring.

### Audio A/B preview

`/coachs-corner/audio-preview` plays a 41-second excerpt with normal dialogue, a shout, TV screen changes, and Don's tie adjustment. A uses the approved episode mix. B starts with the same mix and lets you audition replacements. Both use articulated robot syllables, quiet studio ambience, and cloth rustle 7 for the tie. The existing intro theme plays in both. There is no background music.

Switch A/B during playback to keep the same playhead. The passage buttons replay the opening, dialogue, Don's outburst, or the lead-in to the tie adjustment. The five sliders change mix B. Under **Swap individual sounds**, choose a local WAV, MP3, or OGG for either host, the room, the tie, or the monitor. Files are decoded locally and never uploaded. File selections and levels last until the tab reloads. Reset restores that sound's built-in source and level.

The default episode mix has Don at 120%, Ron at 200%, and studio ambience at 45%. Ron's larger boost brings his normal speaking voice forward; the lower room level keeps the hiss behind the dialogue.

Don's voice uses a low sawtooth buzz, softened attacks and moderate pitch accents. His vowel body is longer and fuller than the sharply articulated revision, with reduced rasp, formant emphasis and high frequencies. His yell retains extra energy with a gentler pitch break. Ron uses a smoother triangle tone, small pitch changes and softer word accents. Short envelopes leave space between syllables; word starts receive more emphasis than inner syllables. Punctuation resolves a phrase, while an unfinished line holds its pitch and clips its tail. Taking over an unfinished line gives Don an extra attack; Ron stays restrained. These are stylized robot syllables, not text-to-speech recordings.

**Compare TV switches** offers three prepared CC0 Freesound recordings: CRT click, Relay snap, and Channel fuzz. Each button selects B, restores the TV level to 100%, and replays the same screen changes with a 0.7-second lead-in. Switch to A to compare with the current TV cue. These choices stay in the preview until one is adopted as the default.

**Compare cloth rustles** retains the three prepared CC0 Freesound recordings. Each button selects B, restores the tie level to 100%, and replays the same movement with a 0.7-second lead-in. The choice stays in B for later playback. Reset or reload restores cloth rustle 7. The source links are beside each option; processing tools, rebuild instructions and source-quality notes are in `scripts/audio/README.md`.

### Keep a replacement as the default

1. Put the audio file in `public/coachs-corner/audio/`.
2. Edit its entry in `lib/coachs-corner/sound-bank.ts`. For example, inside `STUDIO_SOUND_BANK`:

```ts
tie: {
    source: { files: ['/coachs-corner/audio/tie-soft.wav'] },
    gain: 0.8,
},
don: {
    source: { files: [
        '/coachs-corner/audio/don-ah.wav',
        '/coachs-corner/audio/don-oh.wav',
        '/coachs-corner/audio/don-eh.wav',
    ] },
    gain: 1,
},
```

File lists rotate predictably. Voice files should start immediately and contain one short syllable, roughly 80–200 ms. Playback trims and fades them to fit the speaking slot and changes pitch with delivery. The room file loops, so use a seamless recording without music or prominent individual events. Effects play once. All sources have an independent linear gain, with 0 meaning muted and 1 meaning the designed level. Custom recordings may need a lower or higher gain than the synthesized source.

The same bank also names `monitor`, `thud`, `sting`, `horn`, `whistle`, `buzzer`, and `organ`, so any effect can become a file without changing the player or script parser. `ROBOT_VOICES` controls each host's timbre, attack, length, level and pitch range; `ROBOT_DELIVERIES` controls the articulation, brightness and rasp of each emotion. `DON_DELIVERY_TUNING` softens Don's shout and fills out his syllables independently of Ron. `STUDIO_ROOM` and `TIE_RUSTLE` hold the ambience and Foley controls. These all live in `sound-bank.ts`; `robot-voice.ts` applies the script's word and phrase cues. The intro theme remains the existing separate MP3 referenced in `player.tsx`.

The public player defaults to `CURRENT_SOUND_BANK`, which now points to `STUDIO_SOUND_BANK`. Editing that bank changes the episode defaults as well as the preview baseline. Slider and sample selections in the preview remain local to mix B. `CLASSIC_SOUND_BANK` preserves the original voices without room ambience or tie Foley. `audio-cues.ts` maps the existing timeline to sound events; the tie cue fires only on entering the tie gesture during playback. Seeking is silent, and playback stops on a hidden tab. Each player owns its audio graph, with cleanup on pause, mute, seek, and unmount. Sample files are fetched and decoded once per player, never per syllable.

## New episode badge

The desktop navigation and mobile Browse menu show a red **New** badge until the viewer starts the latest episode. Opening its page or watching an older episode does not dismiss it. Watch, Play, and keyboard playback all count; admin previews do not.

Viewing is stored in this browser's localStorage under `coachs-corner:seen:v1:`, using the episode slug and publication timestamp. It survives reloads and updates other open tabs. A newly published or republished episode gets its own marker, so the badge returns when the navigation loads that episode. Clearing site storage also resets it. If storage is blocked or full, dismissal lasts for the current visit only.
