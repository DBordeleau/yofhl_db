---
name: produce-coachs-corner
description: Produce or revise a weekly YOFHL Coach's Corner episode, including research, Don/Ron dialogue, missing assets and a local playable draft.
---

# Produce Coach's Corner

Deliver a playable local draft for the user's review, normally about four minutes. One writer owns both voices. This skill is production guidance; the commands prepare and validate files, while the agent writes and directs the episode.

## Start

Work from the repository root. Read [the show bible](references/show-bible.md), [the annotated pilot](references/annotated-pilot.md), the bundled screenplay at `lib/coachs-corner/pilot.ts`, and `assets/coachs-corner/editorial/continuity.json`. For repeat runs, also read the last two approved episode records linked by that ledger. User corrections take precedence over the bible; record explicit lasting changes with their source instead of quietly rewriting the characters.

Use the current Toronto date as the default slug and the actual Fantrax scoring period as the week. An existing episode folder means resume its work, not overwrite it. Read [production mechanics](references/production.md) to create the fact packet and local draft. Resolve missing facts before basing jokes on them. A live export observes data now; it cannot reconstruct a past Friday cutoff.

## Produce

Act as producer. When subagents are available, delegate one writer/researcher, one visual artist, and one sound designer. Once the screenplay exists, release the writer slot and delegate a fresh independent editor. Keep at most three workers active alongside the producer. With fewer slots, sequence the same responsibilities. Tell the user when review could not be independent.

Give each worker the episode directory, the relevant reference paths, output ownership, the exact fact snapshot to use and a concrete deliverable. The writer and editor both read the bible and pilot examples themselves. Visual and audio workers read only their relevant production references and the settled beat requests. Workers produce files and proposed registry changes; the producer integrates shared code and catalogs.

1. Select the episode's grievance and supporting stories from `facts.json`. Write the angle, ending, additional evidence and asset requests in `brief.md`. Each requested visual or sound gets a beat ID, purpose, existing alternative and fallback.
2. Write `script.txt` in the existing screenplay format. Inventory every real player named in dialogue or graphics. Fetch birthplace evidence for those players and record Don's chosen forms in `pronunciations.json`. Use canonical names in Ron's lines and graphic commands. Once player graphics are written or changed, run `npm run coachs:stats -- --slug <slug>` to capture their archived YOFHL FPts and FP/G automatically. It defaults to the season before the episode, not today's latest season. Record the chosen season, source and any comparison gaps in `brief.md`; resolve missing records or declare a sourced fallback before review. See [production mechanics](references/production.md#archived-player-statistics) for historical overrides and preservation of the live snapshot.
3. Settle physical actions early. Let image and sound work proceed in parallel with dialogue editing. Reuse catalog assets when they express the intended beat; create and register the missing assets that matter. For new or replaced artwork, complete the [image workflow](references/production.md#image-work), including generated formats, mouth clips and visual checks. Give unsuccessful generations a declared playable fallback instead of inventing a supported cue.
4. The independent editor uses [the review guide](references/review.md), returning line-specific evidence and revisions. Resolve the review, run `npm run coachs:check -- --slug <slug>`, then watch the real player through once. Check new assets, silent holds, interrupt timing and the final callback. Parser success alone is not editorial approval.

Target the first reviewable draft within roughly two hours: about 20 minutes for facts/outline, 25 for writing, 50 for media and review in parallel, and 25 for integration/playback. These are planning budgets, not permission to stop with broken output. If generation or source access runs long, deliver the working draft with precise unresolved issues.

## Deliver and retain

Leave the dev server available and provide `/coachs-corner/local/<slug>` as a full local link. Summarize the episode's angle, new assets, actual runtime, unresolved fact/asset issues, and the exact playback checks performed. Keep the episode unpublished. Publication is a separate user action through the existing admin editor.

Save proposed continuity in the episode's `continuity-proposals.md`. Only after the user accepts an episode or explicitly accepts a particular recurring idea, update `assets/coachs-corner/editorial/continuity.json` and save the accepted screenplay plus a short feedback record under `assets/coachs-corner/editorial/approved/<slug>/`. Each recurring name, prediction, grievance or preference needs episode/line evidence and approval provenance. Approving an episode does not automatically make all of its jokes permanent personality rules. Read the bible and original pilot again next week, alongside recent approved work.

For an accepted episode with player graphics, also retain the frozen graphic-player records and their archive provenance as `players.json` beside the screenplay. Keep the private full fact packet local. Future promotion or replay should carry those approved figures forward.
