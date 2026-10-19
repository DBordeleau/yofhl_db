# Coach's Corner assets

Use [robots-v2](robots-v2/) for the Coach's Corner segment: 81 transparent poses, comprising 15 Don poses in each of five wardrobes and 6 Ron poses. The Don wardrobes are normal, Halloween and Alternate suits 1, 2 and 3. Each pose has a 1254 × 1254 PNG original and 640 px / 1254 px AVIF and WebP exports. The player prefers AVIF and falls back to the original WebP. Run `npm run coachs:assets` after artwork edits; see [generation and rollback instructions](../../docs/coachs-corner.md#avif-artwork-and-rollback).

Don's original red floral suit is the normal/default wardrobe. The [suit selection rules](../../docs/coachs-corner.md#dons-suits) cover the default and explicit variants. The [Halloween guide](robots-v2/halloween-2026.md) and guides for [Alternate suit 1](robots-v2/alternate-suit-1.md), [Alternate suit 2](robots-v2/alternate-suit-2.md) and [Alternate suit 3](robots-v2/alternate-suit-3.md) cover their pose sets and screenplay usage. Alternate suit 1 is turquoise paisley with a cobalt polka-dot tie. Alternate suit 2 adapts Cherry's real sky-blue daisy suit and ivory tie. Alternate suit 3 adapts his rainbow plaid outfit with a blue dotted tie. All three alternates have no holiday theme.

Don sits on the left and faces right. Ron sits on the right and faces left.

- [Asset manifest](robots-v2/manifest.json): pose IDs, file paths, dimensions and mouth pairs.
- [Preview](robots-v2/preview.html): the original pose viewer.

## Scripts

Episodes are written in the screenplay format described in [docs/coachs-corner.md](../../docs/coachs-corner.md) and published from `/admin/coachs-corner`. The opening-week pilot is bundled in `lib/coachs-corner/pilot.ts`.

The earlier JSON format (`scenes/opening-week.scene.json`, `scene.schema.json` and `SCENE-FORMAT.md`) is superseded and no longer read by the site.
