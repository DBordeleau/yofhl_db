import { readFileSync } from 'node:fs';
import { seasonLabel } from '@/lib/seasons';

// The games-played history file (league/games-played-history.json): games played (GLOSSARY.md) for every player
// season from 2018–19 through 2025–26, skaters and goalies, read once from Fantrax's signed-out skater and goalie
// tables by scripts/export-games-played.ts. The season import writes each covered season's onto its player
// seasons; it is frozen at 2025–26, and later seasons' games played live only on the player seasons the season
// sync writes. Only career FP/G uses them. See docs/adr/0010-games-played-from-fantrax.md.

export const GAMES_PLAYED_HISTORY = 'league/games-played-history.json';

/** one player season's games played; a player season with none has no row */
export interface GamesPlayedRow {
    /** bare Fantrax player ID */
    id: string;
    /** season end year */
    year: number;
    gamesPlayed: number;
}

export interface GamesPlayedHistory {
    fetchedAt: string;
    source: string;
    /** each season the file covers: its Fantrax league and season code, and how many player seasons have a row */
    coverage: { year: number; leagueId: string; seasonCode: string; players: number }[];
    players: GamesPlayedRow[];
}

/** The history file at `file`, or a rejection when a row is invalid or repeated or a season's count is off. */
export function readGamesPlayedHistory(file: string): GamesPlayedHistory {
    const history = JSON.parse(readFileSync(file, 'utf8')) as GamesPlayedHistory;
    if (!Array.isArray(history?.coverage) || !Array.isArray(history.players)) throw new Error(`${file} is not a games-played history file`);
    const covered = new Set(history.coverage.map((season) => season.year));
    const seen = new Set<string>();
    for (const row of history.players) {
        const key = `${row?.id}:${row?.year}`;
        if (typeof row?.id !== 'string' || !row.id || !covered.has(row.year) || !Number.isInteger(row.gamesPlayed) || row.gamesPlayed < 1 || seen.has(key)) {
            throw new Error(`${file} has an invalid or repeated row: ${JSON.stringify(row)}`);
        }
        seen.add(key);
    }
    for (const season of history.coverage) {
        const rows = history.players.filter((row) => row.year === season.year).length;
        if (rows !== season.players) throw new Error(`${file} lists ${rows} player seasons for ${seasonLabel(season.year)}, not ${season.players}`);
    }
    return history;
}

/** Season `year`'s games played by player ID, or null when the file doesn't cover the season. */
export function seasonGamesPlayed(history: GamesPlayedHistory, year: number): ReadonlyMap<string, number> | null {
    if (!history.coverage.some((season) => season.year === year)) return null;
    return new Map(history.players.filter((row) => row.year === year).map((row) => [row.id, row.gamesPlayed]));
}

/**
 * The export's rows for season `year`: each of the season's exported player seasons (`archive`) that has games played
 * in Fantrax's tables (`tables`, skaters and goalies), or a rejection naming the player seasons with FPts that have none.
 * A player eligible as a skater and a goalie is in both tables, with the same games played in each.
 */
export function matchGamesPlayed(year: number, archive: { id: string; fpts: number }[], tables: { id: string; gamesPlayed: number }[]): GamesPlayedRow[] {
    const games = new Map<string, number>();
    for (const { id, gamesPlayed } of tables) {
        if (games.has(id) && games.get(id) !== gamesPlayed) {
            throw new Error(`Fantrax lists player ${id} with ${games.get(id)} and ${gamesPlayed} games played in ${seasonLabel(year)}'s skater and goalie tables`);
        }
        games.set(id, gamesPlayed);
    }
    const missing = archive.filter((player) => player.fpts !== 0 && !games.get(player.id));
    if (missing.length) {
        throw new Error(`${missing.length} player seasons with FPts in ${seasonLabel(year)} have no games played in Fantrax's tables: ${missing.slice(0, 5).map((p) => p.id).join(', ')}`);
    }
    return archive.flatMap(({ id }) => (games.get(id) ? [{ id, year, gamesPlayed: games.get(id)! }] : []));
}
