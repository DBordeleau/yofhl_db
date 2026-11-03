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
