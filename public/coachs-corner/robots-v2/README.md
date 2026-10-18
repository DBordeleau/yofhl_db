# Coach's Corner robot poses

36 transparent cutouts: 15 regular Don poses, 15 Halloween Don poses and 6 Ron poses. Don sits on the left and faces slightly right; Ron sits on the right and faces slightly left. Don's camera-lean pose turns toward the audience.

The [Halloween suit set](halloween-2026.md) covers every Don pose. Open its [pose viewer](halloween-preview.html) or read its [generation prompts](prompts-halloween-2026.json). Select `halloween-*` gestures explicitly in a screenplay to use this wardrobe.

Both suits preserve the illustrated robot reference, with silver faceplates, cyan screen eyes, sculpted white hair and Don's connected wraparound moustache and goatee. His original red, gold and ivory floral suit is the normal/default wardrobe. See [Don's suits](../../../docs/coachs-corner.md#dons-suits) for selection rules. The manifest pins `defaultWardrobes.don` to `normal`; existing `don-*` assets and unprefixed gestures keep that suit.

## Files

- PNG files are the original 1254 × 1254 renders.
- WebP files keep the same dimensions and alpha, with quality set to 94 for smaller downloads.
- Both WebP sizes have generated AVIF equivalents. The player prefers AVIF and falls back to WebP; `npm run coachs:assets` builds and versions these static files.
- `preview.html` lets you select poses, check light and dark backgrounds, and step through the script cues. It is a catalog preview, not the current player's mouth animation.
- `manifest.json` lists every asset, its wardrobe, use, dimensions and website URL, plus the default wardrobe and variant prompt records.
- `cue-sheet.json` maps 48 script beats to pose IDs. Match these to your eventual voice track.
- `prompts.json` records the original suit and Ron prompts; `prompts-halloween-2026.json` records the Halloween edits. Images were made with the built-in image_gen tool.

## Place the characters

Use equal square image boxes and align them at the bottom. Keep the full transparent canvas rather than trimming each pose separately. The site paths start with `/coachs-corner/robots-v2/`.

The arms and hands are visible as though the hosts are seated at a desk. Add a separate desk layer if needed; the image files contain no desk or background.

The preview opens with a layered desk. Compare **Hands above desk**, **Desk over hands** and **No desk** to see how the composition works. The images themselves remain transparent.

The character sits behind the tabletop. A second copy of the same image is clipped to the forearms and hands and drawn above the tabletop; the desk's front panel sits below their hands. Small contact shadows help the resting arms feel attached to the surface. This hides the torso cutoff without painting over the gestures.

`desk-preview.css` defines the desk geometry and layer order. `desk-preview.js` defines normalized arm masks for pointing, thumbs-up, tie adjustment, microphone removal and Ron's stop gesture. Other poses use a shared lower-arm region. Keep both image copies aligned and update them together when changing poses; new poses may need their own mask. These masks are for this preview's desk height.

## Switch poses

For ordinary speech, use `don-default` / `don-talk` and `ron-default` / `ron-talk`. Matching mouth pairs also exist for Don's point and thumbs-up.

The player keeps the closed-mouth body visible and fades only a clipped face region from the talking illustration over it. Swapping whole images on every syllable makes the clothing flicker because the illustrations differ. Gesture changes still use complete poses. Follow the [artwork checklist](../../../docs/coachs-corner.md#adding-or-replacing-artwork) for face clips, format generation and playback checks when adding or replacing poses.

If you add a talking shake to the layered preview, apply the same transform to the base image and foreground copy, with their transform origins near `50% 90%`. Transforming their shared parent would create a stacking context and prevent the hands from appearing above the separate tabletop. Keep movement subtle, stop it during silent beats, and respect reduced-motion preferences.

Use `don-stare` after "Hamhung Hall Monitors" and `don-pause` before "Paddyville." The cue sheet includes suggested silent holds. Those durations are editorial starting points.

## Pose inventory

| Character | Pose IDs |
| --- | --- |
| Normal Don, default suit | default, talk, point, point-talk, angry-talk, surprised, stare, pause, tie-adjust, lean-camera, mic-remove, thumbs-up, thumbs-up-talk, desk-pound, desk-pound-ready |
| Halloween Don | The same 15 suffixes, prefixed with `don-halloween-` |
| Ron | default, talk, skeptical-talk, look-down, warning, surprised |

Each ID has its character prefix, for example `don-point-talk.webp`.

The canonical scene is implemented in `components/coachs-corner/`; review changed art in its real episode player before publishing.
