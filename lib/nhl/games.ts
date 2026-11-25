// How many NHL regular-season games a player had played before a date, shared by the HTTP and in-memory adapters:
// every earlier season's games, plus that season's games dated strictly before the date. Missing data is never zero:
// no season history, or no games for an earlier season, is null. Only a season with an NHL line has game dates worth
// asking for, so `gameDates` is called only then.
import type { NhlPlayer } from './model';

export async function countGamesBefore(
    seasons: NhlPlayer['seasons'], seasonYear: number, date: string, gameDates: () => Promise<string[]>,
): Promise<number | null> {
    if (!seasons) return null;
    let games = 0;
    for (const [year, line] of Object.entries(seasons)) {
        if (Number(year) >= seasonYear) continue;
        if (line.games === null) return null;
        games += line.games;
    }
    if (!seasons[seasonYear]) return games;
    return games + (await gameDates()).filter(played => played < date).length;
}
