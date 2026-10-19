# Don's Alternate suit 2

Alternate suit 2 adapts Don Cherry's real sky-blue daisy suit: white flowers with yellow centres, ample blue between the flowers, and an ivory satin tie. The clothing reference is the Coach's Corner broadcast photograph reproduced in Courtney French's [May 15, 2017 suit gallery](https://www.theodysseyonline.com/don-cherry-suits). The photograph's broadcast date is unverified. The robot retains its existing jacket cut, shirt, pocket square and microphone; it does not copy the photograph's human anatomy, vest or boutonniere.

The owner asked to retain this design as Alternate suit 2 alongside the paisley Alternate suit 1. Both are nonholiday wardrobes for occasional use. Keep the daisy pattern, blue/white/yellow palette and ivory tie when extending it. Fifteen transparent poses cover Don's complete repertoire, including the desk-pound preparation and contact. Don keeps his silver face, cyan eyes, connected white moustache and goatee, and the original gestures.

Open [the Alternate suit 2 pose viewer](alternate-suit-2-preview.html) to inspect the set beside Ron. The [full catalog](preview.html) contains all wardrobes. The viewer swaps whole illustrations; check speaking animation in the actual player.

## Files

The wardrobe ID is `alternate-suit-2`; every artwork filename starts with `don-alternate-2-`. The suffixes are `default`, `talk`, `point`, `point-talk`, `angry-talk`, `surprised`, `stare`, `pause`, `tie-adjust`, `lean-camera`, `mic-remove`, `thumbs-up`, `thumbs-up-talk`, `desk-pound` and `desk-pound-ready`.

Each pose has an original 1254 × 1254 transparent PNG master, full-size WebP and AVIF, and 640-pixel WebP and AVIF. Preserve the full square canvas when placing them. All masters were edited with the built-in `image_gen.imagegen` tool and copied unchanged. WebP quality is 94; AVIF follows the repository's existing quality-65, 4:4:4 recipe. The exact prompts, repository reference paths and PNG SHA-256 hashes are in [prompts-alternate-suit-2.json](prompts-alternate-suit-2.json).

## Episode use

The original red floral suit remains Don's normal/default suit. Select Alternate suit 2 only when the episode brief requests it, and record the choice in the handoff. Follow [Don's suits](../../../docs/coachs-corner.md#dons-suits) when selecting or adding a wardrobe.

Use `alternate-2-` explicitly on every Don line, inline cue, delivery span that names a gesture, and `then` pose. Start with `[don: alternate-2-rest]`. That opening pose does not carry the outfit into later dialogue. Ordinary `DON:` and `DON (yell):` lines select the normal wardrobe. The shared opening and closing bumper also keeps the normal wardrobe.

```text
[don: alternate-2-rest, ron: rest]
DON (alternate-2-rest): You like the suit, Ron?
RON: I can see it from here.
DON (alternate-2-point): You could see it from the parking lot.
[don: alternate-2-tie, 700ms]
DON (alternate-2-angry, yell): That's called presence!
[don: alternate-2-pound-ready, 220ms]
[don: alternate-2-pound, sfx: desk-pound, 480ms]
DON (alternate-2-thumbs, then alternate-2-stare): Anyway.
```

The 12 gestures are `alternate-2-rest`, `alternate-2-point`, `alternate-2-thumbs`, `alternate-2-angry`, `alternate-2-surprised`, `alternate-2-lean`, `alternate-2-stare`, `alternate-2-pause`, `alternate-2-tie`, `alternate-2-mic`, `alternate-2-pound-ready` and `alternate-2-pound`. The three talking pairs keep the closed-mouth body fixed beneath a mouth overlay. Open-mouth expressions return to `alternate-2-rest`; closed-mouth poses hold their selected pose. Tie sound, lean close-up and desk-pound motion use the existing timing.

A local 54-second [studio audition](/coachs-corner/local/don-alternate-suit-2-assets) exercises all poses. Its screenplay and review records live in `local/coachs-corner/episodes/don-alternate-suit-2-assets/`. It is an unpublished asset check, not a regular episode. The owner's request to retain the wardrobe does not publish this audition. Small print differences between gestures are expected from separate generated illustrations; the talking overlay keeps the clothing fixed during speech.
