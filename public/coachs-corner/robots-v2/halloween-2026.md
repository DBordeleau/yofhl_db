# Don's Halloween suit

Fifteen transparent poses cover Don's complete current repertoire, including the desk-pound preparation and contact. The suit is midnight purple with orange pumpkins, ivory ghosts, black bats and orange vines, plus an orange-and-black striped tie. Don keeps his silver face, cyan eyes, connected white moustache and goatee, and the original gestures.

Open [the Halloween pose viewer](halloween-preview.html) to inspect the set beside Ron. The [full catalog](preview.html) contains both wardrobes. The viewer swaps whole illustrations; check speaking animation in the actual player.

## Files

Every filename starts with `don-halloween-`. The suffixes are `default`, `talk`, `point`, `point-talk`, `angry-talk`, `surprised`, `stare`, `pause`, `tie-adjust`, `lean-camera`, `mic-remove`, `thumbs-up`, `thumbs-up-talk`, `desk-pound` and `desk-pound-ready`.

Each pose has an original 1254 × 1254 PNG, full-size WebP and AVIF, and 640-pixel WebP and AVIF. Preserve the full square canvas when placing them. Empty areas have real alpha transparency. The original PNGs are unchanged copies of the generated images. WebP quality is 94; AVIF follows the repository's existing quality-65, 4:4:4 recipe.

The exact prompts, repository reference paths and PNG SHA-256 hashes are in [prompts-halloween-2026.json](prompts-halloween-2026.json). All images were edited with the built-in `image_gen.imagegen` tool on October 18, 2026. Each edit used the matching original pose and the new Halloween costume reference. No CLI image generator was used.

## Episode use

The owner accepted this artwork on October 18, 2026. Halloween is an optional wardrobe; the original red floral suit remains Don's normal/default suit. Follow [Don's suits](../../../docs/coachs-corner.md#dons-suits) when selecting or adding a wardrobe.

Select the Halloween gestures explicitly on every Don line and pose cue. Start with `[don: halloween-rest]`. Ordinary `DON:` and `DON (yell):` lines still select the regular wardrobe. The shared opening and closing bumper also keeps the regular wardrobe.

```text
[don: halloween-rest]
DON (halloween-rest): Look at this suit, Ron.
DON (halloween-point): Put the thing up.
DON (halloween-thumbs): That's a good one.
DON (halloween-angry, yell): I SAID THE OTHER THING.
[don: halloween-pound-ready, 220ms]
[don: halloween-pound, sfx: desk-pound, 480ms]
DON (halloween-rest): There.
```

The 12 gesture names are `halloween-rest`, `halloween-point`, `halloween-thumbs`, `halloween-angry`, `halloween-surprised`, `halloween-lean`, `halloween-stare`, `halloween-pause`, `halloween-tie`, `halloween-mic`, `halloween-pound-ready` and `halloween-pound`. The player chooses the open/closed artwork for the three talking pairs and keeps the body fixed beneath the mouth overlay. Tie sound, lean close-up and desk-pound motion follow their existing timing.

A local, unpublished 59-second asset audition is available at `/coachs-corner/local/don-halloween-2026-assets`. It contains test dialogue and covers every pose. It is not the upcoming Halloween episode. Review notes, timecodes and hashes are in `local/coachs-corner/episodes/don-halloween-2026-assets/`.

The suit pattern has small differences between gestures because each is a generated illustration. The original red-suit files remain available.
