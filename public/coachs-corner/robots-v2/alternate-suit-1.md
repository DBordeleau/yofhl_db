# Don's Alternate suit 1

Alternate suit 1 gives Don a turquoise jacket with oversized hot-pink and acid-yellow paisley, midnight-blue and gold scroll accents, and a cobalt tie with chartreuse polka dots. It is an original costume design with no holiday theme. Keep that palette, paisley pattern and polka-dot tie when extending it.

The owner asked to retain this design as Alternate suit 1 alongside the real-suit daisy design, [Alternate suit 2](alternate-suit-2.md). Fifteen transparent poses cover Don's complete repertoire, including the desk-pound preparation and contact. Don keeps his silver face, cyan eyes, connected white moustache and goatee, and the original gestures.

Open [the Alternate suit 1 pose viewer](alternate-suit-1-preview.html) to inspect the set beside Ron. The [full catalog](preview.html) contains all wardrobes. The viewer swaps whole illustrations; check speaking animation in the actual player.

## Files

The wardrobe ID is `alternate-suit-1`; every artwork filename starts with `don-alternate-1-`. The suffixes are `default`, `talk`, `point`, `point-talk`, `angry-talk`, `surprised`, `stare`, `pause`, `tie-adjust`, `lean-camera`, `mic-remove`, `thumbs-up`, `thumbs-up-talk`, `desk-pound` and `desk-pound-ready`.

Each pose has an original 1254 × 1254 transparent PNG master, full-size WebP and AVIF, and 640-pixel WebP and AVIF. Preserve the full square canvas when placing them. All masters were edited with the built-in `image_gen.imagegen` tool and copied unchanged. WebP quality is 94; AVIF follows the repository's existing quality-65, 4:4:4 recipe. The exact prompts, repository reference paths and PNG SHA-256 hashes are in [prompts-alternate-suit-1.json](prompts-alternate-suit-1.json).

## Episode use

The original red floral suit remains Don's normal/default suit. Select Alternate suit 1 only when the episode brief requests it, and record the choice in the handoff. Follow [Don's suits](../../../docs/coachs-corner.md#dons-suits) when selecting or adding a wardrobe.

Use `alternate-1-` explicitly on every Don line, inline cue, delivery span that names a gesture, and `then` pose. Start with `[don: alternate-1-rest]`. That opening pose does not carry the outfit into later dialogue. Ordinary `DON:` and `DON (yell):` lines select the normal wardrobe. The shared opening and closing bumper also keeps the normal wardrobe.

```text
[don: alternate-1-rest, ron: rest]
DON (alternate-1-rest): You like the suit, Ron?
RON: I can see it from here.
DON (alternate-1-point): You could see it from the parking lot.
[don: alternate-1-tie, 700ms]
DON (alternate-1-angry, yell): That's called presence!
[don: alternate-1-pound-ready, 220ms]
[don: alternate-1-pound, sfx: desk-pound, 480ms]
DON (alternate-1-thumbs, then alternate-1-stare): Anyway.
```

The 12 gestures are `alternate-1-rest`, `alternate-1-point`, `alternate-1-thumbs`, `alternate-1-angry`, `alternate-1-surprised`, `alternate-1-lean`, `alternate-1-stare`, `alternate-1-pause`, `alternate-1-tie`, `alternate-1-mic`, `alternate-1-pound-ready` and `alternate-1-pound`. The three talking pairs keep the closed-mouth body fixed beneath a mouth overlay. Open-mouth expressions return to `alternate-1-rest`; closed-mouth poses hold their selected pose. Tie sound, lean close-up and desk-pound motion use the existing timing.

A local 53-second [studio audition](/coachs-corner/local/don-alternate-suit-1-assets) exercises all poses. Its screenplay and review records live in `local/coachs-corner/episodes/don-alternate-suit-1-assets/`. It is an unpublished asset check, not a regular episode. The owner's request to retain the wardrobe does not publish this audition. Small print differences between gestures are expected from separate generated illustrations; the talking overlay keeps the clothing fixed during speech.
