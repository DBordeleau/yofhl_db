// The award vote's NHL player lookup, in memory: `players` is the NHL's record of each Fantrax player by player
// ID, and a player who isn't in it has no NHL match. The lookup always fails for a player in
// `failing`.
import type { AwardVoteNhl, NhlPlayerRecord } from './ports';

export interface MemoryNhlState {
    players: Record<string, NhlPlayerRecord>;
    /** the player IDs whose lookup always fails */
    failing: Set<string>;
    /** every player ID looked up, in order */
    lookups: string[];
}

export function createMemoryNhl(state: MemoryNhlState): AwardVoteNhl {
    return {
        lookup: player => {
            state.lookups.push(player.id);
            if (state.failing.has(player.id)) return Promise.reject(new Error('The NHL player search returned 503'));
            return Promise.resolve(state.players[player.id] ? structuredClone(state.players[player.id]) : null);
        },
    };
}
