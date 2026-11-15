// The award vote's Fantrax reads, in memory. A test changes what Fantrax says by changing `state`: its skater and
// goalie tables are kept per date range, so a read of any range the test hasn't set fails, as an unexpected
// request would. A read fails while its name is in `down`, and reads of any other league or season fail, as
// Fantrax's would. `onRead` runs before every read (a test's clock can advance there, as a slow Fantrax's would).
import type { AwardVoteFantrax, AwardVoteLeagueInfo, AwardVoteRange, FantraxDayRosters, RangedGoalie, RangedSkater } from './ports';

export type MemoryAwardVoteRead = keyof AwardVoteFantrax;

/** a range's key in the state's tables: `YYYY-MM-DD..YYYY-MM-DD` */
export const rangeKey = ({ startDate, endDate }: { startDate: string; endDate: string }) => `${startDate}..${endDate}`;

export interface MemoryAwardVoteFantraxState {
    leagueId: string;
    leagueInfo: AwardVoteLeagueInfo;
    /** Fantrax's skater table over each date range, by `rangeKey` */
    skaters: Record<string, RangedSkater[]>;
    /** Fantrax's goalie table over each date range, by `rangeKey` */
    goalies: Record<string, RangedGoalie[]>;
    /** each roster period's rosters, by roster period number */
    rosters: Record<number, FantraxDayRosters>;
    /** reads that fail */
    down: Set<MemoryAwardVoteRead>;
    /** every read made, in order: its name and the range or roster period asked for */
    reads: string[];
    onRead?: (read: MemoryAwardVoteRead) => void;
}

export function createMemoryAwardVoteFantrax(state: MemoryAwardVoteFantraxState): AwardVoteFantrax {
    const read = <T>(name: MemoryAwardVoteRead, leagueId: string, asked: string, value: () => T | undefined): Promise<T> => {
        state.reads.push(`${name} ${asked}`.trim());
        state.onRead?.(name);
        if (state.down.has(name)) return Promise.reject(new Error(`Fantrax ${name} returned 503`));
        if (leagueId !== state.leagueId) return Promise.reject(new Error(`Fantrax ${name} returned 404`));
        const answer = value();
        if (answer === undefined) return Promise.reject(new Error(`Fantrax has no ${name} for ${asked}`));
        return Promise.resolve(structuredClone(answer));
    };
    const ranged = <T>(name: 'skaters' | 'goalies', range: AwardVoteRange, tables: Record<string, T[]>) =>
        read(name, range.leagueId, rangeKey(range), () => range.seasonYear === state.leagueInfo.seasonYear ? tables[rangeKey(range)] : undefined);
    return {
        leagueInfo: leagueId => read('leagueInfo', leagueId, '', () => state.leagueInfo),
        skaters: range => ranged('skaters', range, state.skaters),
        goalies: range => ranged('goalies', range, state.goalies),
        dayRosters: (leagueId, rosterPeriod) => read('dayRosters', leagueId, String(rosterPeriod), () => state.rosters[rosterPeriod]),
    };
}
