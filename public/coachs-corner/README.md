# Coach's Corner assets

Use [robots-v2](robots-v2/) for the Coach's Corner segment: 19 transparent poses (13 Don, 6 Ron), as 1254 × 1254 PNG originals and 640 px / 1254 px AVIF and WebP exports. The player prefers AVIF and falls back to the original WebP. Run `npm run coachs:assets` after artwork edits; see [generation and rollback instructions](../../docs/coachs-corner.md#avif-artwork-and-rollback).

Don sits on the left and faces right. Ron sits on the right and faces left.

- [Asset manifest](robots-v2/manifest.json): pose IDs, file paths, dimensions and mouth pairs.
- [Preview](robots-v2/preview.html): the original pose viewer.

## Scripts

Episodes are written in the screenplay format described in [docs/coachs-corner.md](../../docs/coachs-corner.md) and published from `/admin/coachs-corner`. The opening-week pilot is bundled in `lib/coachs-corner/pilot.ts`.

The earlier JSON format (`scenes/opening-week.scene.json`, `scene.schema.json` and `SCENE-FORMAT.md`) is superseded and no longer read by the site.
