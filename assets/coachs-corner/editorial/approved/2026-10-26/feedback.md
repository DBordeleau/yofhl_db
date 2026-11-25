# October 26 approval record

Week 2 recap (October 19–25, 2026), aired Monday October 26 and published as "Say thank you" at `/coachs-corner/week-2-say-thank-you`. The accompanying script.txt is the published screenplay, copied from `local/coachs-corner/episodes/2026-10-26/script.txt` (sha256 `a274057b…`). It matched the text published in the admin editor byte for byte. players.json freezes the 2025–26 YOFHL rows for the six headshot cards (Hellebuyck, McDavid, Draisaitl, Wilson, Silovs, Nylander). Don wore the Halloween suit (`halloween-2026`) for the whole episode, at the owner's request.

Produced by a scheduled overnight run. The owner left the angle to Claude ("it's your call on the angle"). The chosen angle was loyalty: Hellebuyck skipping camp, Mercer showing up, and Eric dropping Wilson two days after Don's warning.

## Owner verdict, October 26, 2026

> "Okay can you ship this so it becomes available as the latest episode on the live site?"

> "Yes approve it"

The owner signed in to the admin page, and Claude published at their request.

## What the owner changed

Revision 3 (14 notes), the main pass:

- The cold open was stiff, switching between warm, spooky and firm deliveries. It was rewritten in one plain voice, keeping the parts the owner liked: "say thank you at every door" and the apple / "cheap house. Keep walking."
- "Put up the Varrock thing" was too abrupt. Ron now leads into "last week's featured matchup", and the graphic says so.
- New recurring segment: the "Featured matchup picks" scoreboard, with first pick alternating each week.
- "I said thirty-seven" was cut: "They won't remember specific stat numbers week to week." Ron's goalie reason is kept, and Don challenges it as an excuse.
- McDavid: Ron gets more flair ("Only Mario Lemieux has started hotter"). There is no junior-club glaze; Don treats him as one of the greats.
- Draisaitl → "Dry saddle".
- No overt "ENOUGH DILLON" rant; the shift to the rest of the league is now natural.
- Pat: a general bounce-back pep talk rather than "Rough week, buddy", leading into Eric giving up on Wilson.
- Kaley: West Texas left the shutout goalie (Silovs) out to dry, losing by 75.
- Nick: 0-2 despite the second-most points in the league.
- The Week 3 matchup is introduced as the featured matchup.
- A new outro (callback to the apple line and Wilson: "You say thank you!"), and a less forced Tkachuk segue.
- Fullscreen chyron overlapping Don's opening plate: fixed in the player CSS. The fix is not yet deployed.

Revision 4:

- The McDavid speech had a stiff, weird cadence ("feels terrible to listen to"). It's now one normal-speed line.
- Wilson segue: "Speaking of quitting on your guys. Tom Wilson. Dropped by the Lalibirdies."
- The McTavish / "McTavitch" exchange was cut: "Everyone sees McTavish as a Canadian, he plays for Canada internationally."
- Silovs → "ARTHUR SLIVERS".
- Don gives Nick advice on breaking the curse.

Revision 5: "Don would never forget to include Bobby Orr alongside Mario, Wayne and McDavid." Orr now comes first.

At publish time, the team code `Reaper` became `Carolina`, because the live editor didn't recognise it.

## Lasting rules from this episode

Added to `voice-notes.md` with the owner's approval: players who represent Canada keep their real names (the `teamCanada` field in pronunciations.json, enforced by `coachs:check`), and Bobby Orr comes first whenever Don lists the greats. The scoreboard segment was added to `continuity.json` as `featured-picks-scoreboard`.

## What worked and may be reused

- "THE CURSE DOESN'T KNOW THAT!" after Ron's "It's fantasy hockey." Don's certainty against Ron's literal correction.
- "That's vandalism." / "That's tradition." Ron's two words, Don's narrowing.
- "Dan's team?" / "The Devils. Dan has the New Purrsey Devils." / "I know what Dan has." A lapse built from the week's real trade.
- "NINE HUNDRED THOUSAND DOLLARS! To not be in Winnipeg!… Cold? Put on a coat!" The owner kept the Hellebuyck rant untouched.
- "THAT'S AN EXCUSE, RON… And you still picked the wrong team." Don winning the pick and rubbing it in.
- The outro callback: "Somebody hands you an apple, keep walking. Somebody hands you Tom Wilson--" / "Don." / "You say thank you!"
