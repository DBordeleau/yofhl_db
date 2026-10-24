# Coach's Corner scene format v1

The [opening-week scene](scenes/opening-week.scene.json) contains the complete transcript: 68 speaking turns and nine stage directions, in 77 ordered events. Dialogue is split into 163 runs so delivery, speed and pose can change within a turn. The [original transcript](../../assets/coachs-corner/scripts/opening-week.transcript.txt) preserves the source wording.

Give the engine these three files:

- `/coachs-corner/scenes/opening-week.scene.json`: dialogue, performance choices and timing.
- `/coachs-corner/scene.schema.json`: JSON Schema, draft 7, for structural validation.
- `assets/coachs-corner/robots-v2/manifest.json`: pose files, character ownership and mouth pairs.

This is an engine input contract. Playback has not been implemented. Version 1 uses text reveal timing; it contains no recorded or generated speech. At the authored speeds and pauses, the opening scene lasts approximately **3 minutes 57 seconds**. WPM values and pause lengths are editable performance choices.

## Events

Process `events` in array order. Each event finishes before the next begins. IDs are stable references for editing, debugging and replay; their numeric suffixes are not timestamps.

| Type | Purpose | Duration |
| --- | --- | --- |
| `say` | One speaker's caption, with one or more speech runs | Sum of run reveal times, run holds and the line hold |
| `stage` | A silent action, such as pointing or removing the microphone | `durationMs` |
| `pause` | Deliberate silence, optionally with reaction poses | `durationMs` |

`direction` is a human-readable stage note. The engine executes the structured fields; it does not speak the note or infer additional actions from its prose.

## Dialogue and inheritance

A `say` event requires `id`, `type`, `speaker` and `runs`. Each run requires `text`. Other fields can be omitted using these defaults:

| Setting | Resolution order |
| --- | --- |
| Delivery | `run.delivery` → `event.delivery` → `timing.defaultDelivery` |
| Speed | `run.wpm` → `event.wpm` → `timing.defaultWpm` |
| Speaking pose | `run.pose` → `event.pose` → `characters[speaker].talkPose` |
| Hold after a run | `run.holdAfterMs` → `timing.defaultRunHoldMs` |
| Hold after a line | `event.holdAfterMs` → `timing.defaultLineHoldMs` |
| Pose after speech | `event.afterPose` → `characters[speaker].idlePose` |
| Ending | `event.ending` → `complete` |

Resolve each run independently. A yell override on one run must not leak into the next run. Explicit zero values override defaults.

At the start of a `say` event, clear the previous caption and identify the speaker. Set every other character to its `idlePose`, except where `listenerPoses` specifies a reaction. Apply the effective speaking pose at each run's start. Listener reactions persist through that event.

Append run text to the same caption without adding or removing spaces. Preserve newlines, punctuation, capitalization and deliberate name mistakes. Render text as text, not HTML. Each run retains its own typography until the caption is cleared; only the currently revealing run has active text motion. Do not infer delivery from capitals or punctuation.

For example, this event excerpt makes Don yell, soften, then return to normal:

```json
{
  "id": "example-line",
  "type": "say",
  "speaker": "don",
  "delivery": "normal",
  "wpm": 184,
  "pose": "don-talk",
  "afterPose": "don-default",
  "runs": [
    { "text": "I KNOW THE KID.", "delivery": "yell", "pose": "don-angry-talk", "wpm": 177, "holdAfterMs": 140 },
    { "text": " Terrific kid.", "delivery": "warm", "wpm": 164, "holdAfterMs": 140 },
    { "text": " And then Boldy.", "holdAfterMs": 0 }
  ]
}
```

## Speed, pauses and interruptions

`wpm` is words per minute for caption reveal. A word is a nonempty whitespace-delimited token, including attached punctuation. Reveal one token at the start of each `60000 / wpm` millisecond slot, preserving surrounding whitespace. Consume the full final slot before beginning the hold. Do not split a token across runs.

For a run with `N` tokens:

```text
run duration = N × 60000 / effective WPM + effective run hold
say duration = sum of run durations + effective line hold
```

`autoPunctuationPauses` is false. All punctuation pauses are already authored as holds; adding more would slow the scene twice. Internal sentence pauses belong to `run.holdAfterMs`. The supplied scene uses a zero hold on every final run and puts the final gap in `event.holdAfterMs`.

During a run hold, keep the caption, stop speech motion and use the closed mouth partner if available. At the end of all runs and their holds, apply `afterPose`, stop speech motion, and consume the line hold. Keep that caption until a new `say` event or a `caption: "clear"` action.

`ending: "interrupted"` names the next speaker in `interruptedBy`. `ending: "self-cutoff"` marks a speaker abandoning a thought before a stage action or continuation. Both require a zero final run hold and zero line hold. Finish the written text at its em dash and begin the next event immediately. These markers do not create simultaneous dialogue, remove words or add a pause; any intervening stage event still takes its specified time.

## Delivery styles

Style definitions live in `deliveryStyles`. Delivery and pose are independent: Don can yell while pointing, or speak calmly while leaning toward the camera. Speed is controlled separately with `wpm`.

| Style | Caption treatment | Character motion |
| --- | --- | --- |
| `normal` | Base size, weight 500 | Small bob |
| `yell` | 1.32× size, weight 800, shaking text | Stronger shake |
| `deadpan` | Base size, weight 500 | Still |
| `firm` | 1.08× size, weight 700 | Small bob |
| `mocking` | Base size, italic | Bob |
| `warm` | Base size, weight 600 | Small bob |

`fontScale` multiplies the engine's responsive base caption size. `fontWeight` and `fontStyle` map to CSS values. Motion is applied through transforms, without shifting surrounding layout. `offsetPx` and `rotationDeg` are peak displacement and rotation; `hz` is cycles per second. `none` has no displacement. For a reproducible implementation, use `t` in seconds since run start and `s = sin(2π × hz × t)`: `bob` translates vertically by `offsetPx × s`; `shake` translates horizontally by `offsetPx × s`. Both rotate by `rotationDeg × s`.

Apply character motion to the speaker's outer wrapper, keeping pose images aligned inside it. Stop and reset motion during holds, silent events and after speech. Add a new named style to `deliveryStyles` to introduce another treatment; do not embed typography markup in dialogue.

## Poses and mouth movement

Look up pose IDs in the asset manifest and use each asset's `url`. Preserve the full square canvas and bottom-center placement across poses. Don occupies the left seat and Ron the right, facing inward.

Crossfade ordinary pose changes over `timing.poseTransitionMs`. This runs concurrently with the event and does not add time. If another pose replaces a transition already in progress, retarget from the current displayed blend rather than briefly showing an obsolete pose. If consecutive events leave no time to display an `afterPose`, the next event's pose takes precedence.

Use only the manifest's `mouthPairs`, whose entries are `[closedPose, openPose]`. While revealing speech with a paired pose, alternate the open and closed images over `mouthCycleMs`: open for the first half, closed for the second. The supplied 190 ms cycle gives each half 95 ms. Fade mouth changes over `mouthTransitionMs` (70 ms here), capped at half a cycle. Start the cycle again for each run; begin cycling after any initial pose transition finishes, without extending the run's timing.

Some expressive poses have no closed mouth partner. Hold the selected illustration and use its delivery's character motion; do not substitute unrelated artwork. During a run hold, an unpaired pose remains static. `afterPose` explicitly returns the character to an appropriate listening face afterward.

When reduced motion is requested, disable text and character motion, mouth cycling and crossfades. Show each selected pose statically, preserving typography, dialogue timing and pauses.

## Stage actions and silence

Both silent event types stop speech motion and apply any `poses` at the start. Unspecified characters keep their current pose. `caption` is required: `keep` retains the last line, while `clear` removes it. A pause's omitted `transitionMs` defaults to zero; a stage event supplies it explicitly.

`durationMs` is the entire silent interval, **including** the pose transition. A 2,800 ms pause with a 180 ms transition takes 2,800 ms total:

```json
{
  "id": "example-long-pause",
  "type": "pause",
  "direction": "Long pause.",
  "poses": { "don": "don-pause", "ron": "ron-default" },
  "transitionMs": 180,
  "durationMs": 2800,
  "caption": "clear"
}
```

Apply `initialState` before the timeline begins. Stage `props` patches persist until changed; omitted values are retained. Version 1 defines only `monitorPower` (`off` or `on`). The opening scene starts with the monitor off and supplies no graphics or scoreboard changes. Dialogue requesting a graphic does not itself change the monitor.

At the end of the timeline, stop playback and retain the final poses and caption until the host UI dismisses or replays the scene.

## Validation and future audio

Validate JSON against the schema, then check references against the asset manifest. Reject duplicate event IDs; unknown speakers, styles or poses; poses belonging to another character; a speaker listed in `listenerPoses`; split tokens; silent transitions longer than their events; and interrupted lines whose `interruptedBy` differs from the next speaker. Cutoffs must have zero trailing holds. An active motion needs positive `hz`; `none` must have zero motion values.

The repository's authoring check validates the schema, assets, timing constraints and an exact reconstruction of the source transcript:

```sh
node output/coachs-corner/validate-scene.cjs
```

The earlier [48-cue sheet](../../assets/coachs-corner/robots-v2/cue-sheet.json) is an asset preview aid. Use the full 77-event scene for playback. Edit the scene JSON directly; `output/coachs-corner/structure-scene.cjs` is the original authoring generator and regenerating it overwrites those edits.

For voiced playback, add an explicit audio mode and timing contract in a later format version. Bind clips or word timestamps to stable event/run positions and use their actual durations. WPM in this version is a text pacing target, not measured speech timing.
