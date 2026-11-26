---
status: accepted
---

# Link previews follow the page, not its query

Player, team and season pages get their own link preview. Player comparison, head-to-head, draft steal and award pages keep the site-wide preview, and no work is planned to give them one. Comparison and head-to-head choose their subjects in the query string, and social sites fetch a page's link preview without it. A preview for each query would need its own route that reads the query, plus metadata that reads it too, which turns the static comparison page dynamic and opens image rendering to any pair a stranger types.

## Considered Options

- **A link preview for each comparison or head-to-head query**: every pair would unfurl with its own image, at the cost of dynamic pages, an uncacheable image per pair and a route anyone can make render.
- **A link preview for each award or draft steal**: their share card links carry no winner or steal number, so there is nothing to choose one by.

## Consequences

- A draft steal link is a season URL (`/season/{year}?draft=steals`), so it unfurls with that season's link preview. Keeping the site-wide preview there would mean reading the query in the season page's metadata, and the season page would stop being static.
- Award pages show the site-wide preview even though each winner has a share card.
