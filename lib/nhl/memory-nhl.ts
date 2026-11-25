// The NHL module in memory, for every caller's tests: NHL players held by NHL identity, the league's verified
// identities by Player ID, and the same match rule as the NHL module over the held players (their one team standing
// for current and last team). Tests arrange `players`, `verified`, `failing` and `down` directly, and read what was
// asked from `identified` and `read`.
import { matchIdentity } from './match';
import type { IdentifyRequest, Nhl, NhlIdentity, NhlPlayer, NhlSeasonLine } from './model';

export interface MemoryNhlState {
    players: Record<NhlIdentity, NhlPlayer>;
    /** the league's verified identities: each Player ID's NHL identity */
    verified: Record<string, NhlIdentity>;
    /** Player IDs and names whose identify fails, and NHL identities whose read fails, as an NHL outage would */
    failing: Set<string | NhlIdentity>;
    /** every request fails */
    down: boolean;
    /** every player identify was asked for, in order */
    identified: IdentifyRequest[];
    /** every NHL identity a player was read for, in order */
    read: NhlIdentity[];
}

export const memoryNhlState = (state: Partial<MemoryNhlState> = {}): MemoryNhlState =>
    ({ players: {}, verified: {}, failing: new Set(), down: false, identified: [], read: [], ...state });

/** an NHL regular-season line, every stat not given missing */
export const nhlSeason = (line: Partial<NhlSeasonLine> = {}): NhlSeasonLine =>
    ({ games: null, goals: null, assists: null, points: null, wins: null, goalsAgainstAverage: null, savePercentage: null, ...line });

/** an NHL player with no NHL seasons, born March 1, 2004, unless given */
export const nhlPlayer = (player: Partial<NhlPlayer> = {}): NhlPlayer => ({
    nhlId: 8480000, name: 'Test Player', birthDate: '2004-03-01', birthCountry: null, birthCity: null, headshot: null,
    team: null, position: 'C', seasons: {}, ...player,
});

const outage = () => Promise.reject(new Error('The NHL returned 503'));

export function createMemoryNhl(state: MemoryNhlState): Nhl {
    return {
        identify: async player => {
            state.identified.push(structuredClone(player));
            if (state.down || state.failing.has(player.name) || (player.playerId && state.failing.has(player.playerId))) return outage();
            const verified = player.playerId ? state.verified[player.playerId] : undefined;
            if (verified !== undefined) return verified;
            const candidates = Object.values(state.players).map(held => ({ nhlId: held.nhlId, name: held.name, position: held.position, teams: [held.team] }));
            return matchIdentity(player, candidates);
        },
        player: async nhlId => {
            state.read.push(nhlId);
            if (state.down || state.failing.has(nhlId)) return outage();
            const player = state.players[nhlId];
            if (!player) throw new Error(`The NHL returned 404 for player ${nhlId}`);
            return structuredClone(player);
        },
    };
}
