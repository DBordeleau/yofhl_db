# YOFHL

The Ye Olde Fantasy Hockey League: a keeper fantasy hockey league among friends, played on Fantrax since 2018. This site is its archive, live scoreboard and show.

## Teams

**Franchise**:
One club's continuous membership in the league, kept across renames, rebrands and owner changes. Paddyville Lucifers and Hub City Hyman Hounds are the same franchise.
_Avoid_: team (when you mean the persistent club), club

**Team season**:
How a franchise was entered in one season: its name, abbreviation, logo and owner that year.
_Avoid_: stint, era

**Current identity**:
The name, abbreviation and logo a franchise shows today. The owner's chosen name and logo win; otherwise it is the latest team season's, or the franchise's own before its first season.
_Avoid_: display name, current team name

**Season identity**:
The name, abbreviation and logo a franchise showed in a given season, taken from that team season. History always shows the season identity, so Hub City stays Hub City in 2020.
_Avoid_: historical name, old name

**Former names**:
Every season identity name a franchise has used that differs from its current identity.

**Club name**:
A current identity name split into place and nickname ("Paddyville" / "Lucifers"). A franchise renamed by its owner has no split; its full name is its nickname.
_Avoid_: short name

**Defunct**:
A franchise that folded after a given season and no longer plays. It keeps its history.
_Avoid_: retired, inactive

## Seasons

**Season year**:
The year a season ends in. `2027` is the 2026–27 season. Every URL, slug, column, variable and file past the Fantrax adapter uses it; Fantrax's own start year never leaves `lib/fantrax/`.
_Avoid_: start year, Fantrax year

**Published season**:
A season with a champion, or one whose playoffs were cancelled. Only published seasons get pages, banners, picker entries and search results. Ask the season archive (`lib/seasons.ts`) instead of writing another filter.
_Avoid_: completed season, archived season

**Latest season**:
The newest published season.

**Current season**:
The newest season in the database that is not yet published, or none. It is not derived from Fantrax.
_Avoid_: live season, active season

**Cancelled season**:
A season whose playoffs did not happen (2019–20). It is published and has no champion.

**Draft year**:
The calendar year a draft or lottery is held in: the season year minus one. "2026 Draft" and "2026 Draft Pick, Round 1" belong to the 2026–27 season. This matches Fantrax and the NHL and is not drift.
_Avoid_: draft season

## Editing

**Curated edit**:
A change an admin or owner makes through the site (identity, profile, curated history), as opposed to data synced from Fantrax. Each kind is one function in the curated edit module (`lib/data/curated-edits.ts`) that checks, writes, refreshes views and expires cached pages.
_Avoid_: admin write, mutation

## Coach's Corner

**Script**:
The plain-text screenplay an episode is written and stored as: front matter, lines, stage directions and monitor cues.
_Avoid_: screenplay (in code), source

**Episode**:
Everything a surface needs from one script, compiled once by the episode module (`lib/coachs-corner/episode.ts`): meta, diagnostics, timeline, audio cues, opening picture, pull quote, label, player refs and summary.
_Avoid_: show (the whole program is the show)

**Player snapshot**:
The frozen stats for every player an episode cites, from the episode's stats season (the season before the episode's, unless the script names an earlier one). Players are resolved by name, or by Fantrax id when names collide. Stored on the episode when it's published.
_Avoid_: player stats (when you mean the frozen set), studio players

**Stats season**:
The one completed season an episode's player cards quote: the season before the episode's, or the earlier one its `stats:` key names. Never a player's latest row.
_Avoid_: last season (in code), most recent season

**Timeline**:
A script compiled to absolute show times: when every word, mouth flap, pose, monitor cut, camera shot and sound happens.

**Spoken form**:
How the voice and timing read a word of dialogue: the word itself, or for one with digits, the number as a broadcaster says it ("1910-1911" is "nineteen-ten, nineteen-eleven"). The speech plate always shows the word as written.
_Avoid_: pronunciation (that's Don's name flubs)

**Show time**:
The episode's own clock, in milliseconds from the start of the intro. The intro always runs at 1×; speed applies to the segment only.

**Jump**:
A change of show time that skips the moments between: a seek, a scrub, a line skip, or a replay from the end. The studio cuts straight to the frame a jump lands on.
_Avoid_: cut (that's the monitor changing graphic)

**Intro**:
The first six seconds of show time, when the bumper and theme play.

**Segment**:
The part of the show after the intro, where the hosts talk. As a length, it is the runtime minus the intro. Only the production tools (the editor's readout, the local draft report) show it.

**Runtime**:
Show time at normal speed from the start of the intro to the end of the last line: what the player clock shows. It is the only length viewers see, and the one stored with each episode.
_Avoid_: duration, length (unqualified)

**Label**:
An episode's slot on the schedule: "Pilot" for the pilot, otherwise "Week N" from the script's week, otherwise none.
_Avoid_: slot label, week label

**Opening picture**:
What the studio shows before the first play: the set as the segment begins, from the cues ahead of the first line or reaction.
_Avoid_: poster frame

**Host**:
Don or Ron, a character who sits at the desk and has one or more wardrobes.

**Wardrobe**:
One outfit a host can be drawn in, such as Don's normal floral suit, Halloween or Remembrance Day. Normal is the default; a script picks another by prefixing its gestures (`remembrance-point`).
_Avoid_: suit, outfit, costume

**Action**:
What a host physically does at the desk, such as rest, point, stare or pound, with no wardrobe attached.
_Avoid_: move

**Gesture**:
An action in a wardrobe, as a script writes it: `halloween-point`, or plain `point` for the normal wardrobe.
_Avoid_: pose (when you mean what the script asks for)

**Pose**:
One drawn image of a host in a wardrobe, with the mouth closed or open. A talking gesture has two poses; the rest have one.
_Avoid_: gesture (when you mean the image), frame
