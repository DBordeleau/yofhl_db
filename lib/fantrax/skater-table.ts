// Fantrax's website skater table: every NHL skater's regular-season totals, season to date, read page by page and
// checked by the record book's page check (lib/records/player-stats.ts). The season sync reads the live season's
// skater categories from it, and the record book's category export (scripts/export-record-player-stats.ts) read
// 2019–2026's.
import { eachCategory, parseCategoryPage, type PlayerCategories } from '../records/player-stats';
import { globalFetch, type Fetcher } from './leaders';

export interface TableSkater {
    /** bare Fantrax player ID */
    id: string;
    /** goals, assists, shots, hits and blocks, or null for a skater with no games played */
    categories: PlayerCategories | null;
}

export interface SkaterTable {
    /** the Fantrax code of the season the table is for */
    seasonCode: string;
    /** every skater in the table, in its order */
    skaters: TableSkater[];
}

const MAX_PAGES = 100;

// shortcut: Fantrax's website stats endpoint is undocumented; replace it when a supported player-stats API is available.
export async function loadSkaterTable(leagueId: string, seasonYear: number, options: {
    fetcher?: Fetcher;
    /** each page's raw response, as Fantrax sent it */
    onPage?: (raw: unknown, page: number) => unknown;
} = {}): Promise<SkaterTable> {
    const { fetcher = globalFetch, onPage } = options;
    const skaters = new Map<string, TableSkater>();
    let pageCount = 1, total = 0, seasonCode: string | undefined;
    for (let page = 1; page <= pageCount; page++) {
        const response = await fetcher(`https://www.fantrax.com/fxpa/req?leagueId=${encodeURIComponent(leagueId)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(30000),
            body: JSON.stringify({ msgs: [{ method: 'getPlayerStats', data: {
                leagueId, view: 'STATS', statusOrTeamFilter: 'ALL', positionOrGroup: 'HOCKEY_SKATING',
                pageNumber: String(page), maxResultsPerPage: '10000', miscDisplayType: '1', ...(seasonCode ? { seasonOrProjection: seasonCode } : {}),
            } }] }),
        });
        if (!response.ok) throw new Error(`Fantrax skater table returned ${response.status}`);
        const raw = await response.json();
        const result = parseCategoryPage(raw?.responses?.[0]?.data, seasonYear, page);
        await onPage?.(raw, page);
        if (page > 1 && (total !== result.pagination.totalNumResults || pageCount !== result.pagination.totalNumPages)) {
            throw new Error(`Fantrax's skater table for ${seasonYear} changed between pages`);
        }
        ({ totalNumPages: pageCount, totalNumResults: total } = result.pagination);
        seasonCode = result.seasonCode;
        if (pageCount > MAX_PAGES) throw new Error(`Fantrax's skater table for ${seasonYear} has an unexpected ${pageCount} pages`);
        const played = new Map(result.players.map(player => [player.id, eachCategory(category => player[category])]));
        for (const id of result.allIds) {
            if (skaters.has(id)) throw new Error(`Fantrax's skater table for ${seasonYear} has player ${id} more than once`);
            skaters.set(id, { id, categories: played.get(id) ?? null });
        }
    }
    if (skaters.size !== total) throw new Error(`Fantrax returned an incomplete skater table for ${seasonYear}`);
    return { seasonCode: seasonCode!, skaters: [...skaters.values()] };
}
