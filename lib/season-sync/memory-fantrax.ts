// The season sync's Fantrax reads, in memory. A test changes what Fantrax says by changing `state`, and makes a
// read fail by adding its name to `down`. Reads of any other league fail, as Fantrax's would.
import type { FantraxLeagueInfo, FantraxPlayer, FantraxStanding, SeasonSyncFantrax } from './ports';

export type MemoryFantraxRead = keyof SeasonSyncFantrax;

export interface MemoryFantraxState {
    leagueId: string;
    leagueInfo: FantraxLeagueInfo;
    standings: FantraxStanding[];
    /** Fantrax's whole player stats table: every NHL player, scored or not */
    players: FantraxPlayer[];
    /** reads that fail */
    down: Set<MemoryFantraxRead>;
}

export function createMemoryFantrax(state: MemoryFantraxState): SeasonSyncFantrax {
    const read = <T>(name: MemoryFantraxRead, leagueId: string, value: () => T): Promise<T> => {
        if (state.down.has(name)) return Promise.reject(new Error(`Fantrax ${name} returned 503`));
        if (leagueId !== state.leagueId) return Promise.reject(new Error(`Fantrax ${name} returned 404`));
        return Promise.resolve(structuredClone(value()));
    };
    return {
        leagueInfo: leagueId => read('leagueInfo', leagueId, () => state.leagueInfo),
        standings: leagueId => read('standings', leagueId, () => state.standings),
        // Fantrax's reads: the scorers (both signs) and every rostered player
        players: (leagueId, seasonYear) => seasonYear === state.leagueInfo.seasonYear
            ? read('players', leagueId, () => state.players.filter(player => player.points !== 0 || player.teamId !== null))
            : Promise.reject(new Error('Fantrax returned the wrong scoring season')),
    };
}
