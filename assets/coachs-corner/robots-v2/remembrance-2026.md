# Don's Remembrance Day suit

An original Remembrance Day wardrobe requested November 9, 2026. Don wears charcoal-black tailoring covered in scarlet poppies with black centres and muted green leaves, with a burgundy-red tie, white shirt and white pocket square. His robot identity and original pose geometry are preserved.

Open the [pose viewer](remembrance-2026-preview.html) or [full catalog](preview.html). All 15 poses have transparent WebP and AVIF exports at 1254 × 1254 and 640 × 640. Only optimized exports are committed. The untrimmed PNG masters are preserved locally, byte-identical to built-in imagegen outputs, and excluded from Git. WebP uses quality 94; AVIF uses quality 65 and 4:4:4 colour. [Exact generation prompts and hashes](prompts-remembrance-2026.json) record provenance.

The wardrobe ID is `remembrance-2026`. Artwork IDs start with `don-remembrance-`. Select the suit explicitly with `remembrance-` on every Don line, inline cue, gesture span and `then` pose. The opening cue alone does not carry the suit into subsequent dialogue. See [Don's suits](../../../docs/coachs-corner.md#dons-suits).

```text
[don: remembrance-rest, ron: rest]
DON (remembrance-rest): Red poppies, Ron.
DON (remembrance-point, then remembrance-stare): Right there.
```

The twelve gestures are `remembrance-rest`, `remembrance-point`, `remembrance-thumbs`, `remembrance-angry`, `remembrance-surprised`, `remembrance-lean`, `remembrance-stare`, `remembrance-pause`, `remembrance-tie`, `remembrance-mic`, `remembrance-pound-ready` and `remembrance-pound`. Rest, point and thumbs each have closed/open mouth pairs. The runtime keeps the body fixed and overlays only the talking face region.

Poppies are part of the printed jacket, with no separate lapel pin baked in. `lapel: poppy` still adds the existing pin to both hosts, including with this suit. Normal red floral remains the default and is used by the shared bumper. No calendar switch is added.

The local studio audition at `/coachs-corner/local/don-remembrance-2026-assets` exercised every pose. Its script and review records are local working files, not committed episodes. The original artwork audition passed 117 feature tests and eight isolated production checks. The optimized-only packaging also passed 142 feature tests on the current master base. Browser checks covered full-screen playback, three mouth overlays, light/dark comparisons and a 390-pixel viewport. Physical devices and Safari were not tested.

Run `npm run coachs:assets` to verify and publish the committed AVIF exports under immutable URLs. A checkout without the local PNGs uses the existing AVIF bytes after checking their hashes and dimensions against `avif-build.json`. A missing or corrupt export fails with an instruction to restore its master, rather than recompressing a lossy WebP. Keep the PNGs locally if regenerating artwork.
