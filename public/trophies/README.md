# Award artwork

These eight transparent WebP images are the trophy artwork used by the award gallery, winner pages, and trophy components. The selected artwork was approved on 4 October 2026 and exported at quality 92, alpha quality 100.

- jagr-cup.webp: revision-r3/jagr-cup-r3-a.png
- prime-minister.webp: prime-minister-a.png
- wayne-gretzky.webp: wayne-gretzky-a.png
- le-magnifique.webp: le-magnifique-a.png
- bobby-orr.webp: bobby-orr-a.png
- hasek.webp: hasek-b.png
- danny-briere.webp: revision-r2/danny-briere-r2-a.png
- teemu-selanne.webp: revision-r2/teemu-selanne-r2-a.png

The source filenames above are relative to the local `output/award-concepts/2026-10-04/` archive. That archive is not tracked in Git or required to run the app. The WebP files in this directory are tracked.

The award catalogue in [lib/awards.ts](../../lib/awards.ts) defines each trophy's catalogue ID, image, display label, name, and team/player scope. [components/trophy-icons.tsx](../../components/trophy-icons.tsx) renders the artwork. The gallery has two team trophies and six individual awards.

One display label differs from its name: the Teemu Trophy shows as "Teemu Selanne Trophy".

Stored winners are keyed by catalogue ID, so a label can change freely. Preserve the names: award URLs use them, with spaces replaced by underscores. The catalogue is the only place an award is defined; the admin panel stores its winners separately ([ADR 0009](../../docs/adr/0009-awards-are-catalogue-ids.md)).

When replacing artwork, keep the transparent background, update the catalogue if the path changes, and check the gallery, award winner page, and team/player trophy cases. Team logos use a separate [era-based mapping and sync command](../../docs/data.md#franchises-defunct-teams-and-logos).
