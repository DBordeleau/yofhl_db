# Opening-week approval record

The owner accepted the refined opening-week revision on October 17, 2026: **"okay looks good make this the new episode 1"**. The accompanying script.txt is the accepted screenplay, copied exactly from local/coachs-corner/episodes/opening-week-late-revision/script.txt and installed as PILOT_SCRIPT in lib/coachs-corner/pilot.ts. It keeps the opening-week slug, Week 1, 2027 season and October 15, 2026 episode date.

The former accepted screenplay and this record's earlier version are preserved under revisions/before-mckenna-2026-10-17/. The original source was the owner's quality reference when commissioning the workflow.

## Accepted revision

The owner retained the Medicine Hat affection and asked the producer personally to loosen the NCAA rant, make Ron's NIL explanation a restrained devil's-advocate response, and remove the flat/bold delivery. The accepted passage starts "And what does he do? Off to Penn State last year" and ends with Don's "YOU DON'T JUST WALK OUT ON THEM!" Ron reacts silently, then Don resumes "And then Boldy." The McKenney/McKenna correction, original fantasy figures, callbacks and ending remain intact.

The owner also requested a louder Ron default for every episode. The shared studio bank now uses Ron gain 2 rather than 1.5 (about +2.5 dB); the voice design and other mix levels are unchanged. Twelve audio tests passed for that change.

Accepted timing: 4:26.061 action/dialogue, 4:32.061 including the bumper, and 4:33.861 including the end card. The added scene is 30.875 seconds over the former pilot. Sources for the 2025–26 Penn State move and general NIL meaning remain in the local episode brief. No specific financial deal is asserted.

After accepting the episode, the owner requested the existing YOFHL DB figures in the three-player graphic. The accompanying players.json freezes the exact 2025–26 rows from league.player_seasons, read October 17, 2026 at 21:15:13 UTC: Wilson 372 FPts, Nylander 378.25 (+6.25), Hischier 382.25 (+10.25). The runtime copy is lib/coachs-corner/pilot-players.json; the local preview contains identical statistics. This prevents future seasons from changing the historical comparison. FP/G is 5.17, 5.82 and 4.66 respectively. Games played was not stored and is left null. Query provenance is in the local episode's player-stat-evidence.json.

All 51 Coach's Corner tests pass, and the episode validator now reports zero diagnostics. The existing nullable-player-snapshot migration (0011) was applied to repair the regular episode route; no episode record was inserted or published. The normal Episode 1 route serves the accepted script and frozen player data.

## Explicit character guidance accepted October 17, 2026

The owner requested a focused late revision after "I KNOW THE KID. / Terrific kid." and explicitly directed: "Canadian players' junior teams are a lasting personality quirk: Don loves naming their junior clubs, takes pride in those towns and organizations, and treats that background as proof he knows the player." The owner also specified: "Use it when relevant; it is not a mandatory joke every episode."

This recurring trait is approved and recorded in show bible version 3 and continuity preference canadian-junior-clubs. Verify the player and club relationship. Do not invent personal coaching history for Don.

The accepted application is affection for Gavin McKenna's Medicine Hat Tigers years, followed by resentment at his move to Penn State for 2025–26. "Selling out" is Don's emotional opinion, with his admiration still visible. Ron explains NIL briefly and defends the player's choice; Don gets the last spoken word in that dispute before returning to Boldy. Approval of this episode does not establish a permanent feud, recurring NCAA complaint, prediction or required ending.

The revised script is now the canonical bundled Episode 1. No database episode overrides the bundled pilot; the read-only episode-list check returned no records at promotion. The local draft remains available as the production record. This promotion changes the project source and accepted archive; it does not record a database publication or deployment.
