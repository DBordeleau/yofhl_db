// The pilot episode, bundled so /coachs-corner always has a show even before any episode is
// published from the admin. It's also the worked example of the script format (docs/coachs-corner.md).

export const PILOT_SLUG = 'opening-week';

export const PILOT_SCRIPT = String.raw`---
title: Draft and opening matchups
week: 1
season: 2027
date: 2026-10-15
segment: 4:23
---

# Cold open: Don is already pointing at a monitor that isn't on.
[don: point, ron: rest]
>> off

RON: The YOFHL draft was Saturday, and we've got the opening matchups--

DON (point): Yeah. And put the thing up. [>> bars] The other thing. [>> static] With the kid.
  [>> list "Standings" HH 0-0, HUNG 0-0, JAGR 0-0, Lali 0-0, NPD 0-0, PVLS 0-0, Reapers 0-0, SKGS 0-0, TEEHAW 0-0, VWIZ 0-0]
  No, that's the standings. I don't want the standings. [>> off]

RON (deadpan): The draft. [>> title "The Draft" "2026–27 season"]

DON: !!THE DRAFT.!! That's what I said. Now, [>> pick 1 "Gavin McKenna"] McKenney goes first--

RON (deadpan): McKenna.

DON: !!I KNOW THE KID.!! {warm: Terrific kid.}
  {warm thumbs: Medicine Hat Tigers. Loved watching him there. Those hands. The Hat! That's a hockey town.}
  [rest] And what does he do? Off to Penn State last year. NCAA. {slow: I call that selling out.}

RON (rest): What's wrong with being paid for your name, image and likeness? That's NIL, Don.

DON: Yeah. And the Tigers helped make that name--

RON: He's allowed to pick what suits his hockey and his wallet. Best decision for him.

DON: For him. Yeah. {warm: Hell of a player.} But those people in Medicine Hat-- !!YOU DON'T JUST WALK OUT ON THEM!!!

[ron: down, 450ms] Ron looks down.

DON: And then Boldy. [>> pick 2 "Matt Boldy"] Good player.
  Then this Stenborg fella goes third. [>> pick 3 HH "Ivar Stenberg"]

RON (deadpan): Ivar Stenberg.

DON: Yeah. And you've got fellas sitting there, played in the league, can help you {firm slow: NOW,}
  and Jeremy's taking a kid because some guy on the computer says--

RON (deadpan): It's a keeper league.

DON: !!I KNOW IT'S A KEEPER LEAGUE, RON.!! **You think I came in here and didn't know that?** I've been doing this--

[don: tie, 1.25s] Adjusts tie. Looks down at an empty patch of desk.

DON (deadpan, slow, then pause): Who took him?

RON: Jeremy. Hooterville.

DON (deadpan): Yeah. [beat] Well. [beat] We'll get to him.

RON (deadpan): [don: stare] We're on him now.

DON (firm, point): No, put up Wilson.

RON: Tom Wilson went seventy-sixth. [>> player "Tom Wilson" Lali hearts "76th overall"]

DON: {yell surprised slow: SEVENTY-SIXTH!} [beat] There. There's your league. Right there. Seventy-six. Big fella.
  Goes to the net. Nobody wants him. Everybody wants little Noodles and Hishner--

RON (deadpan): [>> gap "Tom Wilson" "William Nylander" "Nico Hischier"] Nylander and Hischier are very good players.

DON (firm): [>> player "Tom Wilson" Lali hearts "76th overall"] !!DID I SAY THEY WEREN'T?!! You do this every week. I say Wilson's a good player and now I hate everybody.

RON: You called them--

DON: Eric got him. {warm thumbs: Good for Eric. Smart.} Now who's Eric playing?

RON: Andrew. [>> matchup Lali 147.35 HUNG 161.8] The Hall Monitors.

DON (surprised, slow): The what?

RON: [don: stare] Hamhung Hall Monitors.

[don: stare, 1.9s] Don stares.

DON (deadpan, slow, then stare): Alright.

RON: Andrew's slightly ahead.

DON (deadpan): Well, there you go.

RON (deadpan): You just said Eric was smart.

DON: He **IS** smart. Doesn't mean he's winning. You can be smart and lose. {deadpan slow: I coached Boston.}

[don: stare, ron: down, 1.15s] Ron looks down.

DON (firm, slow, then stare): Don't start.

RON (deadpan, rest): I didn't say anything.

DON: {deadpan: You were going to.} [450ms] Now Jagrtown. [>> matchup JAGR 179.1 SKGS 157.85] Nick. He's got the most points, right?
  Him and the Skittle--

RON (deadpan): Skellige Sirens. Monike.

DON: Yeah. They're right there together. Couple points. **But Nick's played five more games!** {yell slow: FIVE!}
  {firm fast: Don't sit there telling everybody what a genius you are.} !!You've had five more guys go out!!!

RON (deadpan): Five more player games.

DON (yell): WHAT DID I JUST SAY?

RON (deadpan, rest): It's a close matchup.

DON (deadpan): It's very close. I just said that. Good matchup. Leave it alone.

[don: pause, 2.8s] Long pause.

DON (deadpan, slower): Paddyville. [>> matchup PVLS VWIZ]

RON: Pat's trailing Dillon by quite a bit.

DON: Yeah, I saw that. Forty-something. Lucifers. You name your team that, you better show up.
  **You can't be the Lucifers and get pushed around all night.** Call yourself the Pat Something.
  {deadpan slow: The Pats.} [beat] Then nobody expects anything.

RON: Kyle Connor was his first pick.

DON (warm): Good player. Shoots. I like him. Doesn't fool around. See, that's what I'm--

[don: point, ron: surprised, 100ms] Points suddenly.

DON (firm, point): !!HOOTERVILLE.!! Go back. [>> matchup HH NPD]

RON: Jeremy's ahead of New Purrsey.

DON (yell): ONE GOAL. [>> numbers HH 1 goal, 18 assists]

RON (deadpan): Eighteen assists.

DON (firm): !!ONE GOAL, RON.!! Whole team. Everybody's out there going, {mock: "Here, you take it. No, you take it."}
  !!SHOOT THE DAMN THING.!!

RON (deadpan): They're winning.

DON (yell, fast): That's what makes it worse! Dan! You're losing to this!
  The whole team's afraid to shoot and you're sitting there behind them!

[don: lean, 260ms] Leans into camera.

DON (firm, lean): I wouldn't say a WORD in the group chat. {deadpan slow: Nothing.} [beat] Put the phone in a drawer.
  You're done talking until somebody scores.

RON: Carolina's also ahead of West Texas.
  [>> compare Reapers 158 TEEHAW 114.1, G 12 8, A 13 10, SOG 49 37, GWG 3 1, STP 8 2, Hit 29 17, Blk 23 13]

DON: Brian. Yeah. [>> compare Reapers 158 TEEHAW 114.1, G 12 8, A 13 10, SOG 49 37, GWG 3 1, STP 8 2, *Hit 29 17, Blk 23 13] Twice the hits. I saw that. That's what happens. You go in there, finish your check--

RON (deadpan): There are other scoring categories.

DON (deadpan): Oh, here we go.

RON: I'm just--

DON (firm): No, you don't like hitting. Never have.

RON (deadpan): We're discussing fantasy hockey.

DON (yell): AND THEY'RE LOSING AT IT.

RON: Kaley's still got until Monday.

DON (yell, fast): Well, good! Get going! Everybody's got until Monday! {firm rest: Why are we sitting here handing out trophies on Thursday?}

RON (deadpan): We aren't.

DON (deadpan): Alright then.

[don: mic, 950ms] Starts removing microphone.

RON (warning): We've got twenty seconds.

DON (firm, lean): I want to say one thing. You boys. [beat] Set your lineups. All this talk. All week.
  Trades, prospects, whatever. Then Sunday it's {mock slow: "Oh, I was busy."}
  {firm fast: You weren't busy Saturday when you were telling everybody their picks were horsesh--}

RON (firm, warning): Don.

DON (firm): !!BAD PICKS.!! I said bad picks.

[don: thumbs, 320ms] Thumbs up.

DON (warm, slow, thumbs): [>> player "Tom Wilson" Lali hearts "76th overall"] Wilson. [300ms] Seventy-sixth. [350ms] Unbelievable.

[1.5s]
`;
