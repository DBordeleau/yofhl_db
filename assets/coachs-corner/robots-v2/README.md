# Coach's Corner robot poses

81 transparent cutouts: 15 Don poses in each of five wardrobes, normal, Halloween and Alternate suits 1, 2 and 3, plus 6 Ron poses. Don sits on the left and faces slightly right; Ron sits on the right and faces slightly left. Don's camera-lean pose turns toward the audience.

The [Halloween suit set](halloween-2026.md) covers every Don pose. Open its [pose viewer](halloween-preview.html) or read its [generation prompts](prompts-halloween-2026.json). Select `halloween-*` gestures explicitly in a screenplay to use this wardrobe.

The [Alternate suit 1 set](alternate-suit-1.md) uses a turquoise jacket with pink and yellow paisley and a cobalt polka-dot tie. Open its [pose viewer](alternate-suit-1-preview.html) or read its [generation prompts](prompts-alternate-suit-1.json). Select `alternate-1-*` gestures explicitly to use it.

The [Alternate suit 2 set](alternate-suit-2.md) adapts Cherry's real sky-blue daisy suit and ivory tie; the guide records the source photograph. Open its [pose viewer](alternate-suit-2-preview.html) or read its [generation prompts](prompts-alternate-suit-2.json). Select `alternate-2-*` gestures explicitly to use it.

The [Alternate suit 3 set](alternate-suit-3.md) adapts Cherry's rainbow plaid outfit photographed on May 28, 2008. Open its [pose viewer](alternate-suit-3-preview.html) or read its [generation prompts](prompts-alternate-suit-3.json). Select `alternate-3-*` gestures explicitly to use it. Each alternate covers all 15 Don poses and has no holiday theme.

All suits preserve the illustrated robot reference, with silver faceplates, cyan screen eyes, sculpted white hair and Don's connected wraparound moustache and goatee. His original red, gold and ivory floral suit is the normal/default wardrobe. See [Don's suits](../../../docs/coachs-corner.md#dons-suits) for selection rules. The manifest pins `defaultWardrobes.don` to `normal`; existing normal `don-*` assets and unprefixed gestures keep that suit.

## Files

- PNG files are the original 1254 × 1254 renders.
- WebP files keep the same dimensions and alpha, with quality set to 94 for smaller downloads.
- Both WebP sizes have generated AVIF equivalents. Only the AVIF files ship: `npm run coachs:assets` copies them to `public/coachs-corner/media/` under hashed names. This folder is not deployed; the WebP files stay here for the catalog previews and set each AVIF's dimensions.
- `preview.html` lets you select poses, check light and dark backgrounds, and step through the script cues. Open it directly from this folder. It is a catalog preview, not the current player's mouth animation.
- `manifest.json` lists every asset, its wardrobe, use, dimensions and asset name, plus the default wardrobe and variant prompt records.
- `cue-sheet.json` maps 48 script beats to pose IDs. Match these to your eventual voice track.
- `prompts.json` records the original suit and Ron prompts. `prompts-halloween-2026.json`, `prompts-alternate-suit-1.json`, `prompts-alternate-suit-2.json` and `prompts-alternate-suit-3.json` record the optional suit edits. Images were made with the built-in image_gen tool.

## Place the characters

Use equal square image boxes and align them at the bottom. Keep the full transparent canvas rather than trimming each pose separately. Asset names start with `/coachs-corner/robots-v2/`; they are manifest keys, not public paths. The site serves the hashed copies under `/coachs-corner/media/`.

The arms and hands are visible as though the hosts are seated at a desk. Add a separate desk layer if needed; the image files contain no desk or background.

The preview opens with a layered desk. Compare **Hands above desk**, **Desk over hands** and **No desk** to see how the composition works. The images themselves remain transparent.

The character sits behind the tabletop. A second copy of the same image is clipped to the forearms and hands and drawn above the tabletop; the desk's front panel sits below their hands. Small contact shadows help the resting arms feel attached to the surface. This hides the torso cutoff without painting over the gestures.

`desk-preview.css` defines the desk geometry and layer order. `desk-preview.js` defines normalized arm masks for pointing, thumbs-up, tie adjustment, microphone removal and Ron's stop gesture. Other poses use a shared lower-arm region. Keep both image copies aligned and update them together when changing poses; new poses may need their own mask. These masks are for this preview's desk height.

## Switch poses

For ordinary speech in the normal wardrobe, use `don-default` / `don-talk` and `ron-default` / `ron-talk`. Matching mouth pairs also exist for Don's point and thumbs-up. Each of Don's five wardrobes has those three pairs, giving the full catalog 16 mouth pairs including Ron's.

The player keeps the closed-mouth body visible and fades only a clipped face region from the talking illustration over it. Swapping whole images on every syllable makes the clothing flicker because the illustrations differ. Gesture changes still use complete poses. Follow the [artwork checklist](../../../docs/coachs-corner.md#adding-or-replacing-artwork) for face clips, format generation and playback checks when adding or replacing poses.

If you add a talking shake to the layered preview, apply the same transform to the base image and foreground copy, with their transform origins near `50% 90%`. Transforming their shared parent would create a stacking context and prevent the hands from appearing above the separate tabletop. Keep movement subtle, stop it during silent beats, and respect reduced-motion preferences.

Use `don-stare` after "Hamhung Hall Monitors" and `don-pause` before "Paddyville." The cue sheet includes suggested silent holds. Those durations are editorial starting points.

## Pose inventory

| Character | Pose IDs |
| --- | --- |
| Normal Don, default suit | default, talk, point, point-talk, angry-talk, surprised, stare, pause, tie-adjust, lean-camera, mic-remove, thumbs-up, thumbs-up-talk, desk-pound, desk-pound-ready |
| Halloween Don | The same 15 suffixes, prefixed with `don-halloween-` |
| Alternate suit 1 Don | The same 15 suffixes, prefixed with `don-alternate-1-` |
| Alternate suit 2 Don | The same 15 suffixes, prefixed with `don-alternate-2-` |
| Alternate suit 3 Don | The same 15 suffixes, prefixed with `don-alternate-3-` |
| Ron | default, talk, skeptical-talk, look-down, warning, surprised |

Each ID has its character prefix, for example `don-point-talk.webp`.

The canonical scene is implemented in `components/coachs-corner/`; review changed art in its real episode player before publishing.
