# Voice notes

The owner's concrete corrections to Don and Ron, newest first. Read this right before drafting, after the full pilot. Each note pairs what drifted with what the pilot does instead. When the owner gives a lasting correction, add it here with the date and their words. Scene-only notes stay in that episode's `feedback.md`.

The pilot (`assets/coachs-corner/editorial/approved/opening-week/script.txt`) is the voice reference. Later approved episodes are references for facts, bits and continuity, not for how the hosts talk.

## 2026-11-09 — Ron's share drifted back to 41%

Owner, on the Week 4 draft: "I like the overall flow of the draft that was produced, but I worry the runtime is kinda long, and that the ratio of Don/Ron speech has drifted enough to change the feeling of each character's voice."

| | Pilot | Week 4 draft |
| --- | --- | --- |
| Ron's share of words | 22% | 41% |
| Don's average words per line | 13.4 | 8.4 |
| Runtime | 4:23 | 7:44 |

The causes, and what to do instead:

- **Don became a reactor.** He had 80 lines, many of them one to four words ("Again?", "4?", "Fine.", "What?") that only handed the ball back to Ron. Pilot Don holds the floor across several lines and wanders off, and Ron has to catch him.
- **Ron ran the rundown.** He opened all 13 scenes with a fact and a card. In the pilot Don calls for the graphics ("No, put up Wilson.", "Now Jagrtown.") and Ron corrects.
- **Ron became the joke-teller.** "For the team that scored 311." The same needle twice ("You picked Hamhung"). Pilot Ron deflates ("We're on him now.", "We aren't."); he doesn't land punchlines.
- **Junior-club tags became a formula.** There were five in one episode (Erie Otters twice, Thunder Bay, Rimouski, Swift Current). The pilot's one, Medicine Hat, lands because it's rare. Use one or two at most.

Before (Week 4 draft):

> RON: Jagrtown picked up Ryan O'Reilly this morning.
> DON: O'Reilly! Erie Otters. Now there's a fella who comes back. Plays both ends.
> RON (deadpan): For the team that scored 311.
> DON: Somebody over there has to backcheck!

After:

> RON: Jagrtown picked up Ryan O'Reilly this morning.
> DON: O'Reilly! Now there's a fella who comes back. Plays both ends. Somebody over there has to backcheck!

Fix the ratio when drafting, not afterwards. When trimming a draft the owner has already given notes on, keep every line they asked for word for word. A voice pass that rewords owner-requested beats oversteps (owner, 2026-11-09: "Your revisions have over-stepped. Several things you said remained intact are changed.").

## 2026-11-09 — Team names, not owner names

Owner: "Stop saying 'Pat's' and 'Daniel's' use the team names. They should only use owner names when speaking to owners directly."

Refer to teams by team name ("Paddyville's Kyle Connor", "The Hall Monitors dropped him"). Owner names are only for direct address, usually Don leaning into the camera ("Nick. Don't frame it.", "He won you both games, Andrew!", "Brian. Eric. Kaley.").

## 2026-11-02 — Cutter Gauthier keeps his real name

Owner: "Why is Don mispronouncing Cutter Gauthier's name? He can say this one correctly." Then, confirming the exception: "Gauthier is considered an American hockey player by 99.99% of hockey fans, literally no one thinks he's Swedish."

The rule is unchanged: Don mispronounces players born outside North America unless they represent Canada. Gauthier is a named exception. He was born in Skellefteå, Sweden, but he grew up in Arizona and plays for the USA, and fans see him as American. In `pronunciations.json`, give him `"donName": "Gauthier"` and quote the owner in `ownerApproved`; `coachs:check` then accepts the real surname. Don't extend this to other players without the owner's say-so.

Before, in the 2026-11-02 draft:

> DON (surprised): Gotcha?
> RON (deadpan): Gauthier.

After:

> DON (surprised): Gauthier? Sunday?

## 2026-10-26 — Bobby Orr comes first

Owner: "When Don lists the all-time greats, Bobby Orr always comes first. Don's a Boston homer and coached Orr." Earlier in the same revision: "Don would never forget to include Bobby Orr alongside Mario, Wayne and McDavid."

Don coached Orr in Boston, and that pride is personal. Whenever he ranks or lists the greats, Orr is on the list and goes first. Don calls him "Bobby."

Before, in the 2026-10-26 draft:

> DON: Mario! That's who he's with now. Mario, Wayne, and him.

After:

> DON: Mario! That's who he's with now. Bobby, Mario, Wayne, and him. Bobby first. I coached Bobby in Boston.

## 2026-10-26 — Players who represent Canada keep their real names

Owner: "Don uses the real name for any player who represents Canada internationally, even if born outside North America (e.g. Mason McTavish)." Earlier in the same revision: "Everyone sees McTavish as a Canadian, he plays for Canada internationally."

This is an exception to the birthplace rule. Birthplace still decides for everyone else. Before giving a player born outside North America his real name, verify that he has represented Canada internationally, and record the source in `brief.md`. In `pronunciations.json`, give him his real name as `donName` and cite that source in `teamCanada`; `coachs:check` then accepts the real surname. Don't decide by surname or reputation.

The 2026-10-26 draft had Don flub McTavish (born in Zurich) and Ron correct him:

> DON: McTavitch. Peterborough Petes. Good Canadian boy.
> RON (deadpan): Born in Zurich.

The exchange was cut. In future, Don says the name straight:

> DON: McTavish. Peterborough Petes. Good Canadian boy.

## 2026-10-23 — Week 1 drifted from the pilot

Owner: "Oct 19 is approved, but Don's overall voice and tone were better in the pilot. Going forward Don should be more like the pilot than week 1's episode." They agreed the diagnosis below is "bang on".

`npm run coachs:check` now prints a `voice` profile beside the pilot's. Week 1 measured against the pilot:

| | Pilot | Week 1 |
| --- | --- | --- |
| Ron's share of words | 22% | 40% |
| Don lines with a yell | 15 | 0 |
| Interrupted lines (`--`) | 12 | 0 |
| Ron lines over 18 words | 0 | 4 |

These are symptoms. The causes, and what to do instead:

### Ron argues instead of correcting

Week 1, Ron's Week 2 pick (30 words):

> RON: Better teams lose weeks. Kirill Kaprizov had four goals. Oettinger and Swayman gave Monike three wins and a shutout. I prefer that goalie depth with Hellebuyck on Dillon's injured reserve.

Pilot Ron supplies one fact and stops. Don does the arguing, and gets it a bit wrong:

> RON (deadpan): Five more player games.
> DON (yell): WHAT DID I JUST SAY?

Repair pattern: give Ron the single most deflating fact ("Hellebuyck's on Dillon's IR.") and let Don react to it. If Ron must take a side, one short reason, then Don talks over him.

### Ron opens with a paragraph

Week 1 opened on a 29-word Ron announcement. The pilot opens with Ron getting cut off after twelve words, because Don is already pointing at a monitor that isn't on. Start an argument, not a broadcast.

### Don never loses the thread

The pilot's best moments are lapses: "Who took him?" over an empty desk after a tie adjustment, "We'll get to him." / "We're on him now.", the sudden "HOOTERVILLE." Week 1 has none. Its first draft had two good ones that were revised away:

> DON: How many does Dillon NEED? [beat] Who are we on?
> RON (deadpan): Parekh.
> DON: I know that. Leave him out there. Kid needs to play.

Every episode needs at least a couple of these, played through action (stare, tie, wrong graphic) and repaired by Ron in a few words. Keep them; they are not padding.

### Don is too reasonable

Week 1 Don concedes ("Fair."), explains in orderly sentences, and never shouts. Pilot Don treats a correction as an attack ("!!I KNOW IT'S A KEEPER LEAGUE, RON.!!"), narrows his claim when caught ("You can be smart and lose. I coached Boston."), and swings between warmth, contempt and stunned silence. He erupts several times an episode. Use real `!!yell!!` markup and `--` interruptions; caps alone ("I meant DILLON!") do not perform as a yell.

### What Week 1 did well, in pilot style

- "Parekh. Markham boy. Saginaw Spirit. Memorial Cup winner." Short, specific junior-club warmth.
- "Briefly. You said briefly." Don turning Ron's own word against him.
- "Oh, he'll sleep now." Flat deflation after a pedantic correction.
- "Then take it! I said don't get stupid. I didn't say don't trade." Don narrowing his claim under pressure.
- "USA Hockey did." Ron's three-word trigger that starts a whole argument.
