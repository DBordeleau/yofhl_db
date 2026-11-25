---
name: coachs-corner
description: Produce, rehearse, revise or approve a weekly YOFHL Coach's Corner episode (robot Don Cherry and Ron MacLean). Only when the owner runs /coachs-corner.
argument-hint: "<air-date YYYY-MM-DD> | rehearse [past-slug] | approve <slug> — then your notes"
disable-model-invocation: true
allowed-tools:
  - Bash(npm run coachs:*)
  - PowerShell(npm run coachs:*)
  - WebSearch
  - WebFetch
---

# Coach's Corner

You are the writer, the editor and the producer. Write every line of the script yourself, in this conversation. **Never use the Agent tool at any point in this skill** — no subagents, forks or Explore agents, for research, writing or review. The owner chose this conversation's model to write the episode; a delegated model would be a different writer and the hosts' voices would drift.

Arguments: `$ARGUMENTS`

## Pick the mode

- **A date** (e.g. `2026-10-26`): the regular Monday episode. Slug = that air date. It recaps the previous Monday–Sunday.
- **`rehearse`**: a practice run on this week's live, in-progress period. Slug `rehearsal-<today>` (add `-2`, `-3` if taken). Label it week-so-far; nothing in it is final.
- **`rehearse <past-slug>`** (e.g. `rehearse 2026-10-19`): a blind rewrite of an already-approved week from its frozen packet, so the owner can compare against what aired. Slug `rehearsal-<past-slug>` (suffix if taken). Use `prepare --from local/coachs-corner/episodes/<past-slug>/facts.json`. **Do not read that episode's approved script, feedback or local drafts**, and ignore continuity entries sourced from it or later; that would be copying the answer. `voice-notes.md` still applies, but don't reuse the lines it quotes from that episode.
- **`approve <slug>`**: archive an accepted episode. Follow "Approving" in [mechanics](references/mechanics.md) and stop.
- **The slug's folder already exists**: resume it. Read its `handoff.md` (if any), `brief.md`, `review.md` and the whole `script.txt` before doing anything, and keep the frozen facts unless the owner asks for a refresh.

Anything after the mode is the owner's notes for this episode: must-include topics, optional angles, things to check, things to avoid. Copy them verbatim into `brief.md`.

## 1. Facts (about 10 minutes)

Read [mechanics](references/mechanics.md). Run `prepare` for the mode. Then read:

- `facts.json`: the period, every matchup with categories, standings, rosters, limitations.
- `assets/coachs-corner/editorial/continuity.json`: open `predictions` (pay these off), `threads`, approved `pronunciations`, `preferences`.
- The most recent approved episode's `script.txt` and `feedback.md` under `assets/coachs-corner/editorial/approved/` (except in a blind rehearsal), for what happened last week. Not for voice.

Search the web for the recap week's NHL stories involving rostered players: multi-goal games, injuries, trades, milestones, goalie shutouts. Check each owner note's factual premise. Record sources with dates in `brief.md`. Confirm Sunday's results are final before calling anyone a winner.

## 2. Pitch (stop and wait)

Offer the owner two or three angles. For each, in a few lines:

- Don's obsession this week: the one thing he seizes on, and why it matters to his hockey values.
- The cold open: what starts the argument in the first ten seconds.
- The stories in running order, with the owner's must-includes placed.
- Where Don loses the thread, and what Ron says to repair it.
- The ending, and what it closes from this episode.
- A flashback, only when a past line really pays off this week: quote the exact past lines and the week they aired (see docs/coachs-corner.md#flashbacks). At most one per episode.

Ask with AskUserQuestion, recommended angle first. **Do not draft until the owner picks** or says "your call". Record the choice in `brief.md`. Then run `coachs:facts --refresh --players` with every player the angle will name, and fill `pronunciations.json`.

## 3. Draft (about 15 minutes)

Immediately before writing, read these in full, in this order:

1. `assets/coachs-corner/editorial/annotated-pilot.md` and the pilot itself, `assets/coachs-corner/editorial/approved/opening-week/script.txt`. **This is the voice.**
2. `assets/coachs-corner/editorial/voice-notes.md`: the owner's corrections. Newer notes win.
3. `assets/coachs-corner/editorial/show-bible.md`.
4. `docs/coachs-corner.md` "Writing an episode" through "Monitor graphics", for syntax.

Write the whole screenplay in one pass into `script.txt`, normal suit unless the owner asked otherwise, `week:` matching the packet's period, `date:` the air date (the past air date in a blind rehearsal). Aim for about four minutes; shorter is fine when it's tight, and never pad with pauses. Save a copy as `script.v1.txt`. Run `coachs:stats` if you used player or gap cards.

## 4. Cold edit (about 10 minutes)

Follow [cold edit](references/cold-edit.md): run the check, reread the pilot, answer its questions against the draft, rewrite the weakest exchange, note it all in `review.md`.

## 5. Watch and hand off (about 10 minutes)

Start the dev server (`preview_start` with `next-dev`), open `/coachs-corner/local/<slug>`, and play it through. Check what [mechanics](references/mechanics.md) "Check and watch" lists. Fix what you find.

Write `handoff.md`: slug, preview URL, covered dates and snapshot time, runtime from the check, the angle in one line, what the cold edit changed, open fact or asset issues, any running bits you'd propose carrying forward, and "unpublished". Keep it under a page.

Then tell the owner, briefly: the preview link, runtime, the angle, the weakest remaining exchange in your view, and anything unresolved. Leave the server running.

## Revisions

The owner will give notes in this conversation. For each round: back up the current script as `script.v<n>.txt`, make the change, rerun the check, rewatch the changed passage plus the lines around it, update `handoff.md`. When a note sounds like a lasting rule about Don or Ron ("Ron never explains the joke"), ask whether to add it to `voice-notes.md`. Don't rewrite the characters on your own initiative.

## Never

- Use subagents.
- Publish, or write to the database. The owner publishes from `/admin/coachs-corner`.
- Add to `continuity.json` or `voice-notes.md` without the owner's say-so.
- Invent scores, quotes from the league chat, or a real owner's conduct. Imagined pitches and Don's opinions are fine when they read as such.
- Create new art or sound. Write around a missing asset and list it in the handoff.
