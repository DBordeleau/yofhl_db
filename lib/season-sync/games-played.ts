// Games played (GLOSSARY.md): each player's NHL regular-season games so far, from Fantrax's skater table for a
// skater and its goalie table for a goalie, onto every player season the run keeps. Only career FP/G uses them.
// A player who has games played is kept even with no points and no roster spot, as the season import keeps them;
// Fantrax's player table lists only players with points or a roster spot, so such a player is named from
// Fantrax's player directory.
import type { PlayerSeasonRow } from './player-seasons';
import type { FantraxGoalie, FantraxSkater, SeasonSyncPorts } from './ports';

/**
 * Each player's games played by player ID, from both tables, or a rejection when a table has an invalid or repeated
 * player. A player eligible as a skater and a goalie is in both tables, with the same games played in each.
 */
export function gamesPlayedByPlayer(skaters: FantraxSkater[], goalies: FantraxGoalie[]): Map<string, number> {
    const games = new Map<string, number>();
    const add = (table: string, players: { id: string; gamesPlayed: number }[]) => {
        const seen = new Set<string>();
        for (const { id, gamesPlayed } of players) {
            if (!id || id.includes('*')) throw new Error(`Fantrax's ${table} table has an invalid player (${JSON.stringify(id)}).`);
            if (seen.has(id)) throw new Error(`Fantrax's ${table} table has player ${id} more than once.`);
            if (!Number.isInteger(gamesPlayed) || gamesPlayed < 0) throw new Error(`Fantrax's ${table} table has invalid games played for player ${id}.`);
            if (games.has(id) && games.get(id) !== gamesPlayed) {
                throw new Error(`Fantrax lists player ${id} with ${games.get(id)} games played in its skater table and ${gamesPlayed} in its goalie table.`);
            }
            seen.add(id);
            games.set(id, gamesPlayed);
        }
    };
    add('skater', skaters);
    add('goalie', goalies);
    return games;
}

/**
 * The player seasons of players with games played whom Fantrax's player table doesn't list (no points, no roster
 * spot): free agents with no points, named from Fantrax's player directory, which is read only when there are any.
 */
export async function playedWithoutPointsRows(ports: SeasonSyncPorts, games: Map<string, number>, listed: Set<string>): Promise<PlayerSeasonRow[]> {
    const unlisted = [...games].filter(([id, gamesPlayed]) => gamesPlayed > 0 && !listed.has(id));
    if (!unlisted.length) return [];
    const directory = await ports.fantrax.playerDirectory();
    return unlisted.map(([id, gamesPlayed]) => {
        const player = directory[id];
        if (!player?.name) throw new Error(`Fantrax's player directory has no player ${id}, who has games played.`);
        return { id, name: player.name, teamSeasonId: null, nhlTeam: player.nhlTeam, positions: player.positions, fpts: 0, fpg: 0, gamesPlayed };
    });
}
