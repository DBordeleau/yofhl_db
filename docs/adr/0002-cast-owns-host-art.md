---
status: accepted
---

# Cast owns host art; the art manifest stays a catalog

Everything that turns a host, gesture and mouth state into artwork lives in `lib/coachs-corner/cast.ts`: the wardrobe list, the action table, art IDs, mouth clips and lapel spots. No other runtime code names a `don-`/`ron-` art ID or parses one. The art manifest (`assets/coachs-corner/robots-v2/manifest.json`) records the same wardrobes and mouth pairs for the catalog previews and provenance, but runtime code never reads it; a test fails if cast and the manifest disagree. Before this, wardrobe knowledge was split across cast, artwork, studio, the home hero and the share card, and each new suit meant widening two regexes that had already drifted apart.

## Considered Options

- **Generate cast from the manifest**: the manifest lives outside `public/` and carries prompts, labels and dates the player doesn't need. It also doesn't know actions, aliases, what happens after speaking, mouth clips or lapel spots, so cast would still have to hold those. Reading it at runtime would ship the whole catalog in the client bundle, and generating code from it would add a build step.
- **Keep the knowledge where it was and add tests**: the tests would have to know every place that names art, which was the problem.

## Consequences

- A new wardrobe is one entry in cast's wardrobe list plus its asset files and manifest record. Mouth clips and lapel spots come from the normal poses.
- `scripts/coachs-corner/verify-publishing.mjs` is a deploy checker, not runtime code. It reads its mouth-pair list from the manifest and keeps literal art IDs for the URLs it checks.
