// The Pick'em module (GLOSSARY.md, "Pick'em"): every rule of the contest. Pages, server actions and the Fantrax
// refresh call its operations and hold no Pick'em rules of their own. Each operation takes the current time.
//
// Its interface is four operations; each lives in its own file and is assembled here:
//  - savePickemPick (save-pickem-pick.ts): save or clear one Pick'em pick
//  - readWeek (read-week.ts): one week, for nobody or the signed-in owner
//  - readPickemLeaderboard (pickem-leaderboard.ts): a season's Pick'em leaderboard, and its winner once the season is complete
//  - settle (settle.ts): record each locked week, freeze each settled one and mark a season complete, run by the
//    evening Fantrax refresh
//
// Every read takes a season year: the season being played is the live season's, and a past season is read from
// Pick'em's own record alone (seasons.ts, past-season.ts).
//
// Pairings, week dates, scores and final weeks come from the live season module only, turned into franchises
// with the Fantrax team mapping. Everything stored is keyed by season year, week and franchise (ADR 0005).
import { createReadPickemLeaderboard } from './pickem-leaderboard';
import type { PickemPorts } from './ports';
import { createReadWeek } from './read-week';
export type { PickemWeekOption } from './week-switcher';
import { createSavePickemPick } from './save-pickem-pick';
import { createSettle } from './settle';

export type { PickemPorts } from './ports';
export type { LeagueStanding, MatchupPair, PickemFranchise, PickemLaunch, PickemMatchup, PickemPick } from './model';
export type { SavePickemPickInput, SavePickemPickRejection, SavePickemPickResult } from './save-pickem-pick';
export type { Asker, PickemWeek, ReadWeekInput, ReadWeekResult, YourPickem, YourPickemPick } from './read-week';
export type { PickemLeaderboard, PickemLeaderboardEntry, ReadPickemLeaderboardInput, ReadPickemLeaderboardResult } from './pickem-leaderboard';
export type { PickemPickOutcome } from './results';
export type { PickemWhoIsIn } from './whos-in';
export type { PickemEntry, PickemMatchupBreakdown, PickemMatchupResult } from './locked-week';
export type { SettleInput, SettleResult } from './settle';

export function createPickem(ports: PickemPorts) {
    return {
        savePickemPick: createSavePickemPick(ports),
        readWeek: createReadWeek(ports),
        readPickemLeaderboard: createReadPickemLeaderboard(ports),
        settle: createSettle(ports),
    };
}

export type Pickem = ReturnType<typeof createPickem>;
