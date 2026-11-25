# Production mechanics

Everything runs from the repository root. Commands load `.env` then `.env.local`; never copy credentials into episode files. None of these commands publish or write to the database.

## Episode folder

`local/coachs-corner/episodes/<slug>/` is gitignored (briefs can hold private league notes). `prepare` creates it and refuses to overwrite an existing one; if the slug exists, resume it.

| File | Use |
| --- | --- |
| `script.txt` | The screenplay. Format: `docs/coachs-corner.md` |
| `facts.json` | Frozen league snapshot: teams, rosters, matchups, categories, named players, limitations |
| `pronunciations.json` | Every player named in dialogue or graphics → the form Don says |
| `brief.md` | Owner's notes, chosen angle, extra sources with dates |
| `review.md` | Cold-edit findings and playback notes |
| `handoff.md` | Written at delivery so a later thread can resume |

## Capture the week

```
npm run coachs:prepare -- --slug 2026-10-26 --recap
npm run coachs:prepare -- --slug 2026-10-26 --recap --air-date 2026-10-26
npm run coachs:prepare -- --slug rehearsal-2026-10-23 --period 2
npm run coachs:prepare -- --slug rehearsal-2026-10-19 --from local/coachs-corner/episodes/2026-10-19/facts.json
```

- `--recap` selects the previous Toronto Monday–Sunday and matches it to the Fantrax matchup period. Use it on Monday. Add `--air-date` when running it before Monday.
- `--period <n>` is a Fantrax scoring period (the script's `week:`), not a daily roster period. Without `--recap` or `--period`, prepare takes the current period.
- `--from` reuses an existing frozen packet unchanged.
- Fantrax timestamps can stay "active" until Monday's first game. Before calling a matchup final, confirm Sunday's games are over. If not, say so on screen ("as of …") and treat it as provisional.
- Standings and rosters are observed at capture time, even for an older period. A live export cannot reconstruct a past cutoff.

The packet has no transactions, injuries, NHL news or league chat. Research those on the web and record each source and observation time in `brief.md`.

## Players and names

Every player named in dialogue or on a graphic needs birthplace evidence in `facts.players` and an entry in `pronunciations.json`. Once the angle is picked, capture them all:

```
npm run coachs:facts -- --slug 2026-10-26 --refresh --players "Tom Wilson,Brady Tkachuk,Kirill Kaprizov"
```

Refresh keeps the snapshot's period but re-fetches scores and rosters, so reconcile any number already written. It keeps `pronunciations.json`; add new names yourself. Approved Don forms are in `assets/coachs-corner/editorial/continuity.json`. For a new player born outside North America, choose a short, sayable flub and use it every time Don says the name. Decide by birthplace only, never by surname or nationality. The one exception is a player who has represented Canada internationally: he keeps his real name. Set `donName` to the real name and add `"teamCanada": "<source, date>"` to his `pronunciations.json` entry; `coachs:check` then accepts his real surname. When the owner explicitly says Don can say a particular player's name correctly, add `"ownerApproved": "<owner's words, date>"` instead. Ron and graphics always use the real name.

After writing player graphics (`>> player`, `>> gap`, `with "…"`), freeze the episode's player snapshot:

```
npm run coachs:stats -- --slug 2026-10-26
```

It quotes the stats season: the season before the episode, unless the script's front matter names an earlier one with `stats: 2025` (`--season 2025` writes that key for you). Publishing quotes the same season, so the draft's numbers are the published numbers. When two players share a name (two Elias Petterssons on VAN), cite one by Fantrax id, no asterisks, after the quoted name: `>> player "Elias Pettersson" #048x9`. A bare name two players share is a `coachs:check` error listing each candidate's id, team and FPts, and it blocks Publish. All players in a `gap` must share a season. Games played isn't archived and stays null; never derive it from FP/G. A player with no archived record (prospect) gets an honest `pick` or `stat` card instead of a blank player card.

## What's on the shelf

Use the existing catalog only. No new art or sound is made in this workflow; if a beat needs something missing, write around it and list the idea in the handoff.

- **Wardrobe:** the normal red, gold and ivory floral suit, with unprefixed gestures. Use another suit only if the owner asks (`alternate-1-`, `alternate-2-`, `alternate-3-`, `halloween-` prefixes on every Don gesture; see `docs/coachs-corner.md#dons-suits`).
- **Lapel:** `lapel: poppy` in the front matter puts a Remembrance poppy on both hosts for the whole episode, with any suit. Only when the owner asks.
- **Don gestures:** rest, point, thumbs, angry, surprised, lean, stare, pause, tie, mic, pound-ready, pound. **Ron:** rest, skeptical, warning, surprised, down.
- **Deliveries:** normal, yell, sneak, deadpan, firm, mock, warm. `!!…!!` is a yell, `**…**` firm, `{warm: …}` a span.
- **Effects:** `[fx: don happy 4s]` (daisies and sparkles with a twinkle), `[fx: don shocked 800ms]` (silent burst); either host. `sfx:` horn, whistle, buzzer, organ, sting, thud, desk-pound. Desk hit: `[don: pound-ready, 220ms]` then `[don: pound, sfx: desk-pound, 480ms]`.
- **Camera:** `cam:` wide, don, ron, close don, close ron, monitor, auto.
- **Monitor:** off, bars, static, logo, title, team, matchup (add `final` for completed), pick, stat (`with "Player"` for a headshot), list, standings, compare, numbers, gap, player. Syntax in `docs/coachs-corner.md#monitor-graphics`.
- **Flashback:** `[flashback: week N, don: <gesture>]` … `[end flashback]` replays 1–8 lines copied from an approved past episode, in that week's wardrobe and lapel. Syntax, tag rules and when to use one in `docs/coachs-corner.md#flashbacks`.

Put each graphic where its subject is introduced, not at the end of the line that reads its score. A long speech generally needs a talking pose (point, thumbs, angry, rest), not a single-image pose like `lean`.

## Check and watch

```
npm run coachs:check -- --slug 2026-10-26
```

It reports parser errors, week/season mismatches, name-rule errors, missing assets and stats, runtime, word counts, and a `voice` profile beside the pilot's (Ron's share of words, Don's yell lines, interruptions, long Ron lines) with `flags`. Errors must be fixed. Flags tell you where to reread; they are not quotas and passing them proves nothing about comedy.

Preview: start the `next-dev` server from `.claude/launch.json` with `preview_start` (it may take another port if 3000 is busy), then open `/coachs-corner/local/<slug>`. **Reload draft files** picks up edits. The screenplay panel can play from any line.

You can't hear the audio. Say so in the handoff rather than implying it was auditioned. Watch for: the cold open, every monitor cut against the words it illustrates, text overflow on long lines, long silent holds, the ending, and console errors. Run `npm run test:coachs` only if you changed engine code, which this workflow normally doesn't.

## Publishing

Publishing is the owner's job: they paste `script.txt` into `/admin/coachs-corner` and press Publish. Never publish, and never write to the database.

## Approving

After the owner says an episode is approved:

1. Copy `script.txt` to `assets/coachs-corner/editorial/approved/<slug>/script.txt`.
2. Write `players.json` there: the frozen `facts.players` rows (id, name, headshot, nhlTeam, positions, season, fpts, fpg, games) for every player shown on a graphic, including `with` headshots.
3. Write `feedback.md` there: the owner's verdict in their words, what they changed, what worked.
4. Ask which running bits should carry forward. Add only those to `continuity.json` (episodes, threads, predictions, pronunciations Don actually spoke), each with its anchor line. Mark resolved predictions `resolved` with the result.
5. Lasting voice corrections go in `assets/coachs-corner/editorial/voice-notes.md`, dated, with the owner's words and a before/after line. Scene-only notes stay in `feedback.md`.
