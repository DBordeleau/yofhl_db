# Don's Alternate suit 5

Alternate suit 5 adapts the red-orange tartan suit in the owner's attached photograph from November 20, 2026. Broad black bands and thin white lines cross the red-orange jacket. The shirt and pocket square are white; the ivory tie has small dark dots. The photograph supplies the clothing reference. The robot keeps its silver face, cyan eyes, connected white moustache and goatee, existing jacket cut and black lapel microphone.

This is an optional nonholiday wardrobe. Don's original red floral suit remains normal/default. Select `alternate-suit-5` in the episode brief and retain that choice in the handoff.

## Files and prompts

The 15 artwork IDs start with `don-alternate-5-` and use the normal suffixes: `default`, `talk`, `point`, `point-talk`, `angry-talk`, `surprised`, `stare`, `pause`, `tie-adjust`, `lean-camera`, `mic-remove`, `thumbs-up`, `thumbs-up-talk`, `desk-pound` and `desk-pound-ready`.

Only optimized AVIF exports are committed, at 1254 × 1254 and 640 × 640, plus their immutable public copies. AVIF uses the existing quality 65, 4:4:4 recipe. The untrimmed transparent PNG masters and quality 94 WebP authoring exports stay local and are excluded from Git. The [generation record](prompts-alternate-suit-5.json) retains the exact prompts, references and source hashes. The supplied photograph and working audition also stay local.

Run `npm run coachs:assets` to verify the committed AVIF bytes and dimensions against `lib/coachs-corner/avif-build.json` and publish the immutable media. A clean checkout needs neither PNGs nor WebPs. Restore the local master and authoring exports if an AVIF must be regenerated; a missing or corrupt optimized export fails validation.

Open the [AVIF pose viewer](alternate-suit-5-preview.html) for individual artwork. The production workspace also has a [local studio audition](http://localhost:3000/coachs-corner/local/don-alternate-suit-5-assets), which is not committed. The pose viewer swaps complete images; mouth overlay checks belong in the player and `/art-review`.

## Script use

Start with `[don: alternate-5-rest]`. Unnamed gestures inherit that wardrobe, including `DON:` and `DON (yell):`. Prefix every gesture you name, including inline cues, delivery spans and `then` poses. An unprefixed named gesture returns Don to normal. Opening and closing artwork follows the opening wardrobe. See [Don's wardrobes](../../../docs/coachs-corner.md#dons-wardrobes).

```text
[don: alternate-5-rest, ron: rest]
DON (alternate-5-point): Proper jacket.
RON: I can see that.
[don: alternate-5-tie, 700ms]
DON (alternate-5-thumbs, then alternate-5-stare): Good tie, too.
```

The 12 gestures are `alternate-5-rest`, `alternate-5-point`, `alternate-5-thumbs`, `alternate-5-angry`, `alternate-5-surprised`, `alternate-5-lean`, `alternate-5-stare`, `alternate-5-pause`, `alternate-5-tie`, `alternate-5-mic`, `alternate-5-pound-ready` and `alternate-5-pound`. Rest, point and thumbs use the existing fixed-body mouth overlay. No new actions, mouth clips, sounds or timing rules are needed.

The local audition's `brief.md`, `review.md` and `handoff.md` record validation and remaining issues. Creating assets does not approve or publish the audition as an episode.
