# Don's Alternate suit 3

Alternate suit 3 adapts Don Cherry's rainbow madras plaid outfit photographed on May 28, 2008. The reference is the first photograph in [Sports Illustrated's fashion gallery](https://www.si.com/nhl/2008/06/02/02don-cherrys-fashion-statements), credited to Bruce Bennett/Getty Images. The jacket has overlapping red, orange, yellow, green, blue and purple checks. Its blue tie has small white dots and a red-orange-yellow band across the centre.

This is a nonholiday wardrobe. Keep the plaid grid, mixed bright colours and distinctive tie when extending the set. The robot keeps its existing silver face, cyan eyes, connected white moustache and goatee, jacket cut, white shirt/cuffs, pocket square and black lapel microphone. The clothing reference does not change the robot's anatomy or add the photograph's boutonniere or handheld broadcast microphone.

Open [the Alternate suit 3 pose viewer](alternate-suit-3-preview.html) to inspect the set beside Ron. The [full catalog](preview.html) contains all wardrobes. The viewer swaps whole illustrations; check mouth animation in the actual player.

## Files

The wardrobe ID is `alternate-suit-3`; every artwork filename starts with `don-alternate-3-`. The 15 suffixes are `default`, `talk`, `point`, `point-talk`, `angry-talk`, `surprised`, `stare`, `pause`, `tie-adjust`, `lean-camera`, `mic-remove`, `thumbs-up`, `thumbs-up-talk`, `desk-pound` and `desk-pound-ready`.

Each pose uses the full 1254 × 1254 transparent PNG canvas, with full-size and 640-pixel WebP/AVIF exports. Preserve the canvas and alpha when placing the artwork. The existing export recipe uses WebP quality 94 and AVIF quality 65 with 4:4:4 colour. Exact built-in imagegen prompts, reference paths and source hashes are recorded in [prompts-alternate-suit-3.json](prompts-alternate-suit-3.json).

## Episode use

The original red floral suit remains Don's normal/default. Select Alternate suit 3 explicitly in the brief and retain that choice in the handoff. Follow [Don's suits](../../../docs/coachs-corner.md#dons-suits) for the full wardrobe rules.

Use `alternate-3-` on every Don line, inline cue, delivery span that names a gesture, and `then` pose. Starting with `[don: alternate-3-rest]` alone does not carry the outfit into later dialogue. Ordinary `DON:` and `DON (yell):` select the normal wardrobe. The shared opening and closing bumper also uses the normal suit.

```text
[don: alternate-3-rest, ron: rest]
DON (alternate-3-point): Every square has a job, Ron.
RON: What about the tie?
[don: alternate-3-tie, 700ms]
DON (alternate-3-thumbs): Supervising.
[don: alternate-3-pound-ready, 220ms]
[don: alternate-3-pound, sfx: desk-pound, 480ms]
DON (alternate-3-rest, then alternate-3-stare): Good crew.
```

The 12 gestures are `alternate-3-rest`, `alternate-3-point`, `alternate-3-thumbs`, `alternate-3-angry`, `alternate-3-surprised`, `alternate-3-lean`, `alternate-3-stare`, `alternate-3-pause`, `alternate-3-tie`, `alternate-3-mic`, `alternate-3-pound-ready` and `alternate-3-pound`. The rest, point and thumbs talking pairs keep the closed body fixed beneath a mouth overlay. Open-mouth expressions return to `alternate-3-rest`; closed-mouth poses hold their selected gesture. Lean close-up, tie Foley and desk motion keep the existing timing.

The [local studio audition](/coachs-corner/local/don-alternate-suit-3-assets) covers the complete set. Its script, timings and review records are in `local/coachs-corner/episodes/don-alternate-suit-3-assets/`. Technical and visual review findings belong in those records. Creating this wardrobe does not approve or publish the audition as an episode.
