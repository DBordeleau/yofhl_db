# Monday recap and rehearsal

The owner posts Monday evening and needs a reviewed draft several hours beforehand. The editorial week is Monday through Sunday in America/Toronto. This preference was confirmed on October 18, 2026. Start production Monday morning or early afternoon; record the intended review deadline in the brief. If the owner gives an exact posting time, work backward from it with room for their review.

The reusable [Monday kickoff prompt](../assets/monday-kickoff.txt) leaves room for the owner's topics and an optional review deadline. It starts production when invoked; it does not create a recurring automation.

## Use the owner's notes

Read the notes before choosing the episode's argument. Separate requested inclusions from suggestions, record factual claims that need evidence, and keep any private league context local. If a required topic cannot be supported, report the gap and a possible treatment in the brief/review instead of silently dropping it or inventing the premise. Mention the final inclusion or unresolved issue in the handoff. Optional angles can give way to a stronger story.

Fit requested material into Don's motives and Ron's replies. Don's junior-club affection needs a relevant player and verified history; a topic request is not a reason for Ron to lecture or for Don to deliver a prepared essay. Use the current facts to choose the grievance and ending, with the accepted pilot as the voice reference.

## Select the week

For a regular Monday recap, use `coachs:prepare -- --slug <air-date> --recap`. It selects the previous Toronto calendar Monday through Sunday and matches that window to Fantrax's weekly matchup calendar. The script's week is the returned matchup period number, not the daily roster period. Plain `prepare` selects the current period and can select the new week after Monday rollover.

Fantrax's timestamps can remain open until the next Monday's first game. Preserve those source timestamps and the packet's raw phase. They are not a requirement to delay the episode until evening. Identify the covered Monday/Sunday dates in the brief, and check that the included Sunday games and matchup scores are settled before describing winners. If results are still unsettled, use an explicit as-of caption and present the remaining result as provisional. Stat corrections remain possible even after rollover.

`--recap` fails when no weekly period matches, including before the first eligible week. Inspect the actual scoring calendar and use an explicit `--period` for an irregular period or rehearsal; explain its coverage. Do not subtract one from a daily roster period or assume every scoring period is seven days. Standings and rosters remain observations at capture time, even for an older matchup week.

Freeze the league packet before writing. If another research pass adds identity, birthplace, junior history or archived stats, preserve the score/roster snapshot and record the separate evidence time. `coachs:stats` preserves the live snapshot. A full `facts --refresh` advances it and requires reconciling every factual line and graphic.

## Rehearse the real delivery

Use a separate local slug and leave the accepted pilot untouched. Before Sunday finishes, a live rehearsal is a clearly labelled week-so-far episode. It tests writing, character consistency, assets, review and playback; it cannot certify Sunday's final outcomes. Use a genuine archived completed packet if one is available, never invented final scores.

Give a fresh writer the skill, accepted references and frozen packet without this chat's working history. Preserve the first complete screenplay as `script.v1.txt`. Have a separate editor read those same sources and the complete draft. Record actual defects and revisions in `review.md`, including the weakest scene and its repair. The producer should resolve factual mistakes, weak exchanges, repetitive pilot jokes and broken cues before asking the owner to watch.

Measure time to first complete draft and to reviewed playback. Track agent revision passes, factual repairs, missing assets and unresolved issues. A parser pass and runtime near four minutes establish technical facts, not comic quality. Keep short scenes when they work; extend a short episode with a worthwhile story rather than pauses or filler.

After the owner watches, request a few anchored reactions: where Don stopped sounding like Don, where Ron over-explained, and which exchange dragged or landed. Save the accepted change and its reason. Update the bible only for an explicit lasting preference; keep scene-specific feedback with the episode. A successful rehearsal reduces uncertainty but does not prove every future week's humour will land.

## October 18 calibration

The rehearsal reached a tighter 3:37 after the editor replaced orderly advice with Ron's objections and Don's defensive replies, shortened the score recital, moved graphics to their introductions and released a long static pose. These are worked lessons in [editorial review](review.md), not a new required plot or runtime. The Sunday score snapshot and unapproved jokes remain local rehearsal material; Monday needs a fresh packet and its own angle.

The first new desk effect passed technical checks but the owner heard a wooden-block note and could not see a convincing hit. The revised action received "That's better" on October 18. Preserve the narrower [physical-action lesson](production.md#physical-actions). That response supports the revised action; it does not establish approval of the entire rehearsal, a recurring desk-pound gag or new character canon.

## Late revisions

Read `handoff.md`, the entire current script, the brief/review, bible and approved continuity. Back up the accepted draft before editing. Establish the insertion anchor, intended argument and added runtime from the user's request. Keep the existing fact snapshot and accepted surrounding dialogue; research only the added material. Reuse assets when they perform the action, and narrow the writer/editor pass to the addition and its transitions.

After validation and playback, update the handoff's script hash, runtime, changes and remaining issues. Local drafts are gitignored: a new chat needs the same checkout or an explicitly copied episode directory. User acceptance of a revision remains distinct from publication.
