// The Pick'em module (GLOSSARY.md, "Pick'em"): every rule of the contest. Pages, server actions and the Fantrax
// refresh call its operations and hold no Pick'em rules of their own. Each operation takes the current time.
//
// Its interface is four operations; each lives in its own file and is assembled here:
//  - savePick (save-pick.ts): save or clear one Pick'em pick
//  - readWeek (read-week.ts): one week, for nobody or the signed-in owner
//  - settle (settle.ts): record each locked week, run by the evening Fantrax refresh
//  - the season's Pick'em leaderboard is still to come.
//
// Pairings, week dates, scores and final weeks come from the live season module only, turned into franchises
// with the Fantrax team mapping. Everything stored is keyed by season year, week and franchise (ADR 0005).
import type { PickemPorts } from './ports';
import { createReadWeek } from './read-week';
import { createSavePick } from './save-pick';
import { createSettle } from './settle';

export type { PickemPorts } from './ports';
export type { MatchupPair, PickemFranchise, PickemLaunch, PickemMatchup, PickemPick } from './model';
export type { SavePickInput, SavePickRejection, SavePickResult } from './save-pick';
export type { Asker, PickemWeek, ReadWeekInput, ReadWeekResult, YourPickem } from './read-week';
export type { PickemEntry, PickemMatchupBreakdown } from './locked-week';
export type { SettleInput, SettleResult } from './settle';

export function createPickem(ports: PickemPorts) {
    return {
        savePick: createSavePick(ports),
        readWeek: createReadWeek(ports),
        settle: createSettle(ports),
    };
}

export type Pickem = ReturnType<typeof createPickem>;
