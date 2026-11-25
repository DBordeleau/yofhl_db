// Fantrax's website skater table: every NHL skater's regular-season games played and totals, season to date, read
// page by page with the position table's checks (position-table.ts) and each played skater's skater categories
// (lib/records/player-stats.ts) checked complete. The season sync reads the live season's games played and skater
// categories from it, and the record book's category export (scripts/export-record-player-stats.ts) and the
// games-played export (scripts/export-games-played.ts) read 2019–2026's.
import { eachCategory, PLAYER_STATS, type CategorySeason, type PlayerCategories } from '../records/player-stats';
import type { Fetcher } from './leaders';
import { cellCount, loadPositionTable, parsePositionPage, type PositionPage } from './position-table';

/** each skater on the page who has played, with their skater categories, or a rejection when the page lacks a category column or a played skater's total */
function pageCategories(page: PositionPage, year: number): CategorySeason[] {
    const columns = eachCategory(category => page.columns.indexOf(PLAYER_STATS.find(stat => stat.id === category)!.column));
    if (Object.values(columns).some(index => index < 0)) throw new Error(`Missing stat columns for ${page.seasonName}`);
    return page.rows.filter(row => row.gamesPlayed > 0).map(({ id, cells }) => {
        const totals = eachCategory(category => cellCount(cells[columns[category]]?.content, 'player category total'));
        if (Object.values(totals).some(value => value === null)) throw new Error(`Incomplete categories for ${id}, ${page.seasonName}`);
        return { id, year, ...totals as PlayerCategories };
    });
}

/** One page of Fantrax's skater table: its played skaters' categories and every skater's ID, or a rejection when it is not page `pageNumber` of `year`'s regular-season skater table. */
export function parseCategoryPage(value: unknown, year: number, pageNumber: number) {
    const page = parsePositionPage(value, year, pageNumber, 'HOCKEY_SKATING');
    return { players: pageCategories(page, year), allIds: page.rows.map(row => row.id) };
}

export interface TableSkater {
    /** bare Fantrax player ID */
    id: string;
    /** the NHL regular-season games the skater has appeared in (GLOSSARY.md), 0 for none */
    gamesPlayed: number;
    /** goals, assists, shots, hits and blocks, or null for a skater with no games played */
    categories: PlayerCategories | null;
}

export interface SkaterTable {
    /** the Fantrax code of the season the table is for */
    seasonCode: string;
    /** every skater in the table, in its order */
    skaters: TableSkater[];
}

export async function loadSkaterTable(leagueId: string, seasonYear: number, options: {
    fetcher?: Fetcher;
    /** each page's raw response, as Fantrax sent it */
    onPage?: (raw: unknown, page: number) => unknown;
} = {}): Promise<SkaterTable> {
    const { seasonCode, rows } = await loadPositionTable(leagueId, seasonYear, 'HOCKEY_SKATING', page => {
        const played = new Map(pageCategories(page, seasonYear).map(skater => [skater.id, eachCategory(category => skater[category])]));
        return page.rows.map(({ id, gamesPlayed }) => ({ id, gamesPlayed, categories: played.get(id) ?? null }));
    }, options);
    return { seasonCode, skaters: rows };
}
