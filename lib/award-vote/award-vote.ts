// The award vote module wired to production: the real clock, Fantrax over HTTP (league info and daily rosters
// through the Fantrax client, date-range totals through the ranged-stats reader, under the season's own by-date
// code), the NHL's player search and profiles (nhl-lookup.ts), and the app's database.
import { rows, writeInOrder } from '@/lib/data/db';
import { createFantraxClient } from '@/lib/fantrax/fantrax-client';
import { findByDateSeasonCode, loadRangedGoalies, loadRangedSkaters } from '@/lib/fantrax/ranged-stats';
import { createAwardVote } from './create-award-vote';
import { createNhlLookup } from './nhl-lookup';
import type { AwardVoteRange } from './ports';

const client = createFantraxClient();

// one lookup per league and season while the server runs; a failed one is tried again next time
const seasonCodes = new Map<string, Promise<string>>();
function seasonCode(leagueId: string, seasonYear: number) {
    const key = `${leagueId} ${seasonYear}`;
    if (!seasonCodes.has(key)) {
        seasonCodes.set(key, findByDateSeasonCode(leagueId, seasonYear).catch(error => { seasonCodes.delete(key); throw error; }));
    }
    return seasonCodes.get(key)!;
}
const rangedRead = async ({ leagueId, seasonYear, startDate, endDate }: AwardVoteRange) =>
    ({ leagueId, seasonCode: await seasonCode(leagueId, seasonYear), startDate, endDate });

export const awardVote = createAwardVote({
    clock: { now: () => Date.now() },
    fantrax: {
        leagueInfo: async leagueId => {
            const { firstPlayoffWeek, ...info } = await client.leagueInfo(leagueId);
            if (firstPlayoffWeek === null) throw new Error(`Fantrax league ${leagueId} has no playoff weeks`);
            return { ...info, firstPlayoffWeek };
        },
        skaters: async range => loadRangedSkaters(await rangedRead(range)),
        goalies: async range => loadRangedGoalies(await rangedRead(range)),
        dayRosters: (leagueId, rosterPeriod) => client.dayRosters(leagueId, rosterPeriod),
    },
    nhl: createNhlLookup(),
    db: { rows, writeInOrder },
});
