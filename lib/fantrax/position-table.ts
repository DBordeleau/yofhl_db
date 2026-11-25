// Fantrax's website stats table for one position group (skaters or goalies): every NHL player in the group, with
// their regular-season games played and totals, season to date, read page by page. Each page is checked to be
// the complete regular-season table of the season asked for. The skater table (skater-table.ts) and the goalie
// table (goalie-table.ts) are built on it.
import { fantraxSeasonName } from './season';
import { globalFetch, type Fetcher } from './leaders';

export type PositionGroup = 'HOCKEY_SKATING' | 'HOCKEY_GOALIE';

export interface PositionRow {
    /** bare Fantrax player ID */
    id: string;
    /** the NHL regular-season games the player has appeared in (GLOSSARY.md), 0 when Fantrax shows none */
    gamesPlayed: number;
    /** the row's cells, in the header's order */
    cells: { content?: string }[];
}

export interface PositionPage {
    rows: PositionRow[];
    /** the column short names ("GP", "G", …), in the cells' order */
    columns: string[];
    pagination: { pageNumber: number; totalNumResults: number; totalNumPages: number };
    /** the Fantrax code of the season the table is for */
    seasonCode: string;
    /** "2025-26 Reg Season - YTD" */
    seasonName: string;
}

interface RawPage {
    displayedView: string;
    displayedPosOrGroup: string;
    displayedStatusOrTeam: string;
    displayedSeasonOrProjection: { name: string; code: string; timeframeTypeCode: string };
    paginatedResultSet: { pageNumber: number; totalNumResults: number; totalNumPages: number };
    tableHeader: { cells: { shortName: string }[] };
    statsTable: { scorer: { scorerId: string }; cells: { content?: string }[] }[];
}

/** a whole, non-negative count from a cell, or null when Fantrax shows none ("", "-", "—", "N/A") */
export function cellCount(content: string | undefined, what: string): number | null {
    if (content == null || /^(?:-|—|N\/A)?$/.test(content.trim())) return null;
    const result = Number(content.replace(/,/g, ''));
    if (!Number.isInteger(result) || result < 0) throw new Error(`Invalid ${what}`);
    return result;
}

/** One page of the group's table, or a rejection when it is not page `pageNumber` of `year`'s regular-season table for the group. */
export function parsePositionPage(value: unknown, year: number, pageNumber: number, group: PositionGroup): PositionPage {
    const data = value as RawPage;
    const name = fantraxSeasonName(year);
    if (data?.displayedView !== 'STATS' || data.displayedPosOrGroup !== group || data.displayedStatusOrTeam !== 'ALL' ||
        data.displayedSeasonOrProjection?.name !== name || data.displayedSeasonOrProjection.timeframeTypeCode !== 'YEAR_TO_DATE' ||
        !data.displayedSeasonOrProjection.code.startsWith('SEASON_') || !Array.isArray(data.statsTable) || !Array.isArray(data.tableHeader?.cells) ||
        data.paginatedResultSet?.pageNumber !== pageNumber || !Number.isInteger(data.paginatedResultSet.totalNumPages) || data.paginatedResultSet.totalNumPages < 1 ||
        !Number.isInteger(data.paginatedResultSet.totalNumResults) || data.paginatedResultSet.totalNumResults < 1) throw new Error(`Unexpected Fantrax stats page for ${name}`);
    const columns = data.tableHeader.cells.map(cell => cell.shortName);
    const gamesPlayedColumn = columns.indexOf('GP');
    if (gamesPlayedColumn < 0) throw new Error(`Missing stat columns for ${name}`);
    const seen = new Set<string>();
    const rows = data.statsTable.map(row => {
        const id = row.scorer?.scorerId;
        if (!id || seen.has(id) || !Array.isArray(row.cells)) throw new Error('Missing or duplicate player in stats page');
        seen.add(id);
        return { id, gamesPlayed: cellCount(row.cells[gamesPlayedColumn]?.content, `games played for ${id}, ${name}`) ?? 0, cells: row.cells };
    });
    return { rows, columns, pagination: data.paginatedResultSet, seasonCode: data.displayedSeasonOrProjection.code, seasonName: name };
}

const MAX_PAGES = 100;
const LABEL: Record<PositionGroup, string> = { HOCKEY_SKATING: 'skater', HOCKEY_GOALIE: 'goalie' };

/**
 * Every row of the group's table across its pages, each page turned into rows by `read`, or a rejection when a page
 * is unexpected, the table changes between pages, a player is listed twice or a page is short.
 */
// shortcut: Fantrax's website stats endpoint is undocumented; replace it when a supported player-stats API is available.
export async function loadPositionTable<Row extends { id: string }>(leagueId: string, seasonYear: number, group: PositionGroup,
    read: (page: PositionPage) => Row[], options: {
        fetcher?: Fetcher;
        /** each page's raw response, as Fantrax sent it */
        onPage?: (raw: unknown, page: number) => unknown;
    } = {}): Promise<{ seasonCode: string; rows: Row[] }> {
    const { fetcher = globalFetch, onPage } = options;
    const label = LABEL[group];
    const rows = new Map<string, Row>();
    let pageCount = 1, total = 0, seasonCode: string | undefined;
    for (let page = 1; page <= pageCount; page++) {
        const response = await fetcher(`https://www.fantrax.com/fxpa/req?leagueId=${encodeURIComponent(leagueId)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(30000),
            body: JSON.stringify({ msgs: [{ method: 'getPlayerStats', data: {
                leagueId, view: 'STATS', statusOrTeamFilter: 'ALL', positionOrGroup: group,
                pageNumber: String(page), maxResultsPerPage: '10000', miscDisplayType: '1', ...(seasonCode ? { seasonOrProjection: seasonCode } : {}),
            } }] }),
        });
        if (!response.ok) throw new Error(`Fantrax ${label} table returned ${response.status}`);
        const raw = await response.json();
        const result = parsePositionPage(raw?.responses?.[0]?.data, seasonYear, page, group);
        await onPage?.(raw, page);
        if (page > 1 && (total !== result.pagination.totalNumResults || pageCount !== result.pagination.totalNumPages)) {
            throw new Error(`Fantrax's ${label} table for ${seasonYear} changed between pages`);
        }
        ({ totalNumPages: pageCount, totalNumResults: total } = result.pagination);
        seasonCode = result.seasonCode;
        if (pageCount > MAX_PAGES) throw new Error(`Fantrax's ${label} table for ${seasonYear} has an unexpected ${pageCount} pages`);
        for (const row of read(result)) {
            if (rows.has(row.id)) throw new Error(`Fantrax's ${label} table for ${seasonYear} has player ${row.id} more than once`);
            rows.set(row.id, row);
        }
    }
    if (rows.size !== total) throw new Error(`Fantrax returned an incomplete ${label} table for ${seasonYear}`);
    return { seasonCode: seasonCode!, rows: [...rows.values()] };
}
