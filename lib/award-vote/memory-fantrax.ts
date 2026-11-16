// The award vote's Fantrax reads, in memory. A test changes what Fantrax says by changing `state`: its skater,
// goalie and all-positions points tables are kept per date range, so a read of any range the test hasn't set fails,
// as an unexpected request would. A read fails while its name is in `down`, and reads of any other league or season
// fail, as Fantrax's would. `onRead` runs before every read (a test's clock can advance there, as a slow Fantrax's
// would). A table is one page unless `pageSize` is set; a read of a later page is named with its number.
import type { AwardVoteFantrax, AwardVoteLeagueInfo, AwardVoteRange, FantraxDayRosters, RangedGoalie, RangedPage, RangedPlayer, RangedSkater } from './ports';

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
    /** Fantrax's all-positions points table over each date range (a single day, for move value), by `rangeKey` */
    points: Record<string, RangedPlayer[]>;
    /** each roster period's rosters, by roster period number */
    rosters: Record<number, FantraxDayRosters>;
    /** rows per page of a skater, goalie or points table; the whole table by default */
    pageSize?: number;
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
    const ranged = <T>(name: 'skaters' | 'goalies' | 'points', range: AwardVoteRange, page: number, tables: Record<string, T[]>) =>
        read<RangedPage<T>>(name, range.leagueId, page > 1 ? `${rangeKey(range)} page ${page}` : rangeKey(range), () => {
            const table = range.seasonYear === state.leagueInfo.seasonYear ? tables[rangeKey(range)] : undefined;
            if (!table) return undefined;
            const size = state.pageSize ?? Math.max(1, table.length);
            const pages = Math.max(1, Math.ceil(table.length / size));
            return page <= pages ? { players: table.slice((page - 1) * size, page * size), pages, total: table.length } : undefined;
        });
    return {
        leagueInfo: leagueId => read('leagueInfo', leagueId, '', () => state.leagueInfo),
        skaters: (range, page) => ranged('skaters', range, page, state.skaters),
        goalies: (range, page) => ranged('goalies', range, page, state.goalies),
        points: (range, page) => ranged('points', range, page, state.points),
        dayRosters: (leagueId, rosterPeriod) => read('dayRosters', leagueId, String(rosterPeriod), () => state.rosters[rosterPeriod]),
    };
}
