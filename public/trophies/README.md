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

The shared catalogue in [lib/awards.ts](../../lib/awards.ts) defines each trophy's image, display label, stored name, and team/player scope. [components/trophy-icons.tsx](../../components/trophy-icons.tsx) renders the artwork. The gallery has two team trophies and six individual awards.

Display labels differ from some stored names:

| Display label | Stored name |
| --- | --- |
| Hasek Award | Hasek Trophy |
| Danny Briere Trophy | Danny Briere Award |
| Teemu Selanne Trophy | Teemu Trophy |

Preserve the stored names when changing labels or artwork. Existing winner records and award URLs use those names, with spaces replaced by underscores in URLs. Individual award definitions also live in [league/league.yml](../../league/league.yml); the admin panel stores their winners separately.

When replacing artwork, keep the transparent background, update the catalogue if the path changes, and check the gallery, award winner page, and team/player trophy cases. Team logos use a separate [era-based mapping and sync command](../../docs/data.md#franchises-defunct-teams-and-logos).
