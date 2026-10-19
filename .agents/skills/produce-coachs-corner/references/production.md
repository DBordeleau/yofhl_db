# Local production mechanics

All commands run at the repository root. Live league and birthplace lookups use public sources; archived player stats use read-only queries through the normal `DATABASE_URL_V2` or `DATABASE_URL` connection. Production commands load `.env` and then `.env.local` (local values win); do not copy credentials into episode files. The preview uses the existing Next app. Reuse a running dev server or start `npm run dev` on port 3000.

## Create or resume

```powershell
npm run coachs:prepare -- --slug 2026-10-24
npm run coachs:prepare -- --slug 2026-10-24 --period 2 --players "Tom Wilson,Nico Hischier"
npm run coachs:prepare -- --slug 2026-10-19 --recap
```

Choose one command. `--period` is a Fantrax matchup scoring period, not a daily roster period. `--recap` matches the previous Toronto Monday through Sunday to the weekly calendar; use it for the regular Monday episode. The default without either flag selects the current period. See [weekly recaps](weekly-recap.md) for the distinction between Sunday results and Fantrax's Monday administrative cutoff. Fantrax reports the starting season year; the saved packet and script use the ending year.

`prepare` creates `local/coachs-corner/episodes/<slug>/` and refuses to replace an existing draft. If the slug already exists, inspect and continue it. The directory contains:

| File | Owner and use |
| --- | --- |
| `script.txt` | Writer's performed screenplay, in `docs/coachs-corner.md` format |
| `facts.json` | Frozen source observations, team/roster data, matchup categories and named-player evidence |
| `pronunciations.json` | Canonical player names mapped to the forms Don says |
| `brief.md` | Producer's angle, additional sources, beat requests and declared fallbacks |
| `review.md` | Editor's findings, revisions, playback evidence and remaining issues |
| `continuity-proposals.md` | New continuity candidates awaiting user acceptance |
| `handoff.md` | Producer writes at delivery: authoritative script/hash, covered dates, snapshot, runtime, editorial decisions, review issues, preview and publication status |

Working packets are gitignored because briefs may contain private league notes. Approved scripts and concise editorial records belong under `assets/coachs-corner/editorial/approved/<slug>/`; keep private raw research out of that archive. These paths are local files, not public assets.

Open `http://localhost:3000/coachs-corner/local/<slug>`. The preview uses the real player and the packet's frozen team/player data. **Reload draft files** reloads changes from disk. The screenplay panel previews from a selected line. No local preview action saves or publishes a database episode. Routes return 404 outside local development.

For a wiring check without network research:

```powershell
npm run coachs:prepare -- --slug pilot-reference --pilot
```

This copies the canonical pilot into a local draft with a clearly labelled reference packet. Its numbers are not current facts. This offline mode skips archive access; run `coachs:stats` to populate its player graphics. To reuse an existing frozen fact packet unchanged with a fresh script, use `prepare --slug <new-slug> --from <path-to-facts.json>`.

## Facts and names

The exporter bypasses the site's daily cache. It reads league metadata, standings, rosters, the player directory, and the selected period's matchup scores/categories. It records each URL and fetch time. Missing category values remain `null`, never invented zeros. Completed periods can still receive corrections. Standings and rosters are current even when selecting an older matchup period.

The capture interval is the honest observation time. A requested historical cutoff needs an existing snapshot or dated evidence; fetching now and relabelling it Friday night is invalid. The packet explicitly lists absent coverage: transactions, injuries, external news and private chat. Live `prepare` and `facts --refresh` also capture prior-season YOFHL archive statistics for the requested players; refresh includes players in the existing script's player/gap graphics.

After the outline identifies featured players, capture again with the complete name list:

```powershell
npm run coachs:facts -- --slug 2026-10-24 --refresh --players "Tom Wilson,Nico Hischier,Ivar Stenberg"
```

This preserves the previous packet as a timestamped backup and replaces only `facts.json`. It advances the observation time. Reconcile every displayed/quoted number after refresh. Live refresh recaptures prior-season archive stats; it does not merge manual additions, identity corrections or custom historical seasons. Reapply those with provenance. For a graphics-only change, use `coachs:stats` below instead of refreshing the live league packet.

The NHL lookup accepts one exact identity match and checks the landing record. Birth country and city are recorded separately from NHL team and nationality. Ambiguous names, unavailable prospects and unknown country codes need manual evidence. Include every player named in dialogue, even if they have no player card. `pronunciations.json` is the writer's explicit inventory, for example:

```json
[
  { "name": "Tom Wilson", "donName": "Wilson" },
  { "name": "Nico Hischier", "donName": "Hishner" }
]
```

`prepare` seeds approved forms for requested players; refresh preserves this file. Add new names explicitly. Retrieve existing forms from `assets/coachs-corner/editorial/continuity.json`. Each named player's `facts.players` entry needs verified birthplace evidence before the editor applies the mandatory mispronunciation rule. The checker can catch correct non-North-American surnames in Don's dialogue, but it cannot reliably recognise every nickname or tell whether a joke works. The editor checks the complete inventory against the script.

## Archived player statistics

After writing or changing player graphics, run:

```powershell
npm run coachs:stats -- --slug 2026-10-24
```

The command discovers every `>> player` and `>> gap` participant, including inline cues. It queries `league.players` joined to `league.player_seasons` by canonical name and one exact season, then freezes `season`, `fpts`, `fpg`, archived NHL team/positions and available portraits into `facts.players`. Existing birthplace evidence stays intact. `statsSource` records the archive URI, fetch time, ending year and player ID separately from NHL identity provenance. A timestamped backup precedes replacement of `facts.json`; script, live capture times, standings, rosters and matchups remain unchanged. Playback reads this frozen packet, never a live stats query.

Default to the previous season relative to the **episode**, not the current date or each player's latest row: episode season `2027` uses `2026` (2025–26). For an explicitly older comparison, use `--season <ending-year>` and explain that choice in `brief.md`. Use `--players "Name,Name"` to add dialogue-only or custom-card subjects to the discovered names. This step does not fetch birthplace; new names still need the evidence described above.

Copy the relevant totals, computed gaps, season and `statsSource` provenance into `brief.md`. All participants in a gap must use the same season and YOFHL scoring units. NHL points are not fantasy points. `player_seasons` has no exact games-played field, so `games` stays `null`; never infer games by dividing FPts by rounded FP/G.

If database access fails, the command stops without replacing the packet. Missing or ambiguous player-season records stay unknown, with specific limitations; it never substitutes zero, a namesake or another season. Resolve names/source access and rerun. When a player genuinely has no relevant archived record (for example, a prospect), document the lookup and use an appropriate `pick`, sourced `stat`, or other honest graphic instead of presenting an unexplained blank stats card. Re-run `coachs:check` and inspect the actual graphic before delivery.

## Image work

Choose the episode's wardrobe before selecting or generating poses. Follow [Don's suits](../../../../docs/coachs-corner.md#dons-suits) for the default, available variants and cue rules. Record the choice and any intentional costume changes in `brief.md`, and retain it in `handoff.md`.

Inspect the existing catalog before making a request:

- `lib/coachs-corner/cast.ts` is the runtime gesture vocabulary.
- `public/coachs-corner/robots-v2/manifest.json` lists the artwork, each Don pose's wardrobe and the pinned default.
- `public/coachs-corner/robots-v2/preview.html` provides a pose viewer.
- `public/coachs-corner/robots-v2/prompts.json` records the original suit and Ron prompts; each variant's manifest entry links its own prompt record and preview.

Use the image-generation tool for new poses, supplying the saved matching master PNG from the selected wardrobe as the image reference. For a new suit, use the matching normal pose for geometry and one consistent new-suit reference for clothing. Historical prompt references may point to another chat's generated-image directory; use the committed catalog equivalent instead. Preserve the illustrated silver robot design, cyan eyes, Don's connected white moustache/goatee, selected outfit patterns, camera angle and anchors. Don sits left facing right; Ron sits right facing left. Give a new suit distinct asset IDs and gesture names, retain the normal set and defaults, and complete the same pose inventory and mouth pairs. Register its wardrobe and prompt record in the manifest.

For new or replaced art, complete the [artwork checklist](../../../../docs/coachs-corner.md#adding-or-replacing-artwork): aligned master PNGs and both WebP sizes, generated AVIF and immutable media, gesture registration, and face clips for talking pairs. Inspect identity, desk compositing, fullscreen quality and repeated mouth transitions in the real player. The catalog preview is useful for inspecting individual illustrations; it does not use the player's fixed-body mouth overlay. Record quality differences and fallback checks in `review.md`. Reusing existing poses needs no new conversion or clip work.

Scores, team logos, player names and tables use the existing monitor commands in `docs/coachs-corner.md`. Custom illustration cards require a supported monitor command; the current parser has no arbitrary-image command. The producer implements and verifies a necessary extension or chooses an honest existing graphic fallback.

## Physical actions

Specify the character's immediate reason for moving and the intensity of the beat. For a hit, make the preparation and contact readable, then time its sound to contact. Keep the face, torso and desk anchors aligned across poses. Add only the motion or brief contact marks that help the action read; judge it at normal speed with the surrounding reply.

The October 18 rehearsal is the calibration example. The owner rejected a static fist pose and resonant wooden-block sound, then preferred the revision with "That's better." The current reusable sequence is a low `pound-ready` lift followed by `pound` and one explicit `sfx: desk-pound`. The registered contact pose includes a tiny settle and two faint strokes; the current WAV is a dry aperiodic impact. See [screenplay syntax](../../../../docs/coachs-corner.md) and [sound recipe](../../../../scripts/audio/README.md#original-desk-pound-effect) for the maintained timings and files. This beat expresses restrained irritation at Ron's correction. Use it when that action serves the scene, not as a weekly requirement.

When implementing a new timed effect, derive its phase from show time so pause, seek and playback speed stay aligned. The player's `use-show.ts` publishes only changed frame signatures; include the moving phase and final settled state there when needed. Verify the effect appears and clears during real playback. A paused screenshot or `frameAt` test alone missed a frozen-impact bug in the rehearsal. Respect reduced-motion behavior.

## Sound work

Use `lib/coachs-corner/sound-bank.ts`, `audio-cues.ts` and `scripts/audio/README.md`. The regular player uses `CURRENT_SOUND_BANK`; inspect its current mapping for the accepted production mix. The weekly episode must preserve that voice character and mix unless the user requests a change. The sound-check page is available for auditioning replacements.

For missing actions, synthesize a suitable short effect or process a suitable CC0 recording with the existing audio tools. Record provenance, duration and gain. There is no configured text-to-sound generator; do not claim one was used. If a future task needs one, establish the provider and access before depending on it.

Describe the intended material and contact before choosing the source. A dull desk thud needs a short irregular transient and restrained decay; sustained tonal modes made the first rehearsal version sound like an instrument. Compare the effect alone and beneath the scene at its actual bank gain. Levels and clipping checks cannot establish whether it sounds like the intended action. If direct listening is unavailable, retain that limitation in the review and provide an exact audition timestamp with the playable draft.

A new file is not a new script cue. Register a new sound name in `cast.ts` and a source in the sound banks, then connect any automatic gesture-triggered cue in `audio-cues.ts`. Use an explicit `sfx:` cue when that expresses the timing without new automatic behaviour. Preserve existing sound IDs so older episodes keep their meaning. Listen in the full mix, not only in isolation. The effect should fire once at the intended action, and pause/mute/seek should not leave it sounding or replay stale cues.

For a full generated-audio diagnostic, build `node scripts/audio/build-episode-scan.mjs --script local/coachs-corner/episodes/<slug>/script.txt` and open `/coachs-corner/episode-scan-temp.html` on the dev server. The default command without `--script` scans the pilot. Check that the report's script hash matches the delivered revision. Rebuild and rerun after changing the script or sound assets, even if a media-only edit leaves the script hash unchanged. It checks generated samples and levels, not comic timing or subjective sound quality. Save the report locally and run the builder with `--clean` afterward; temporary public files contain performed draft dialogue and must be removed before deployment.

## Validate and deliver

```powershell
npm run coachs:check -- --slug 2026-10-24
npm run test:coachs
```

Run the production check on each revised draft. Run relevant engine tests when registering new cues, changing the player or altering production tooling; prose-only script revisions do not need the whole test suite. The check reports parser diagnostics, season/week mismatches, name-rule problems, missing assets, absent player statistics, runtime and word balance. It does not award an editorial pass.

After the editor's review, watch the whole draft at normal speed and inspect any new gestures or sounds at their cue. Record concrete findings in `review.md`. Deliver the local link, actual runtime and unresolved substitutions. A full four-minute playback is cheap compared with missing an awkward hold or broken ending.

After user approval, archive the accepted screenplay and feedback, then update only the continuity entries actually accepted as reusable. Publishing remains the existing `/admin/coachs-corner` workflow. Local drafts are never auto-published.
