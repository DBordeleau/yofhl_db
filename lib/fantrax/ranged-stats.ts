// Fantrax's website stats table over a date range: each NHL player's fantasy points, games played and categories
// between two days, signed out. Built for the award vote's prepare; nothing calls it yet. See "Reading Fantrax by
// date range" in issue #147.
import { globalFetch, numericStat, websiteRequest, type Fetcher } from './leaders';

/** a date range in one Fantrax season */
export interface RangedRead {
    leagueId: string;
    /** the season's by-date code, e.g. `SEASON_31l_BY_DATE`; any season Fantrax offers, read against the current league */
    seasonCode: string;
    /** first day, `YYYY-MM-DD` */
    startDate: string;
    /** last day, `YYYY-MM-DD`, inclusive; the same as `startDate` for a single day */
    endDate: string;
}

export interface RangedReadOptions {
    fetcher?: Fetcher;
    /** rows per request, at most Fantrax's cap of 5000 */
    pageSize?: number;
}

/** one player's totals over the range. Fantrax's status column (current ownership, not ownership on those dates) is left out. */
export interface RangedPlayer {
    /** bare Fantrax player ID */
    id: string;
    name: string;
    /** Fantrax's positions, e.g. `C,RW` */
    positions: string;
    /** NHL team abbreviation, or null when Fantrax gives none */
    nhlTeam: string | null;
    /** age now, by Fantrax's age column */
    age: number | null;
    points: number;
    /** null for a player with no games in the range */
    perGame: number | null;
}

export interface RangedSkater extends RangedPlayer {
    gamesPlayed: number;
    goals: number;
    assists: number;
    shots: number;
    hits: number;
    blocks: number;
}

export interface RangedGoalie extends RangedPlayer {
    gamesPlayed: number;
    wins: number;
    goalsAgainst: number;
    saves: number;
    shutouts: number;
}

const SKATER_COLUMNS = {
    gamesPlayed: '2010#2100#-1', goals: '2010#2130#-1', assists: '2010#2090#-1', shots: '2010#2270#-1', hits: '2010#2147#-1', blocks: '2010#2092#-1',
} as const;
const GOALIE_COLUMNS = {
    gamesPlayed: '2020#2100#-1', wins: '2020#231b#-1', goalsAgainst: '2020#2140#-1', saves: '2020#2230#-1', shutouts: '2020#2290#-1',
} as const;

/** every NHL skater's totals over the range, in Fantrax's order (fantasy points descending) */
export function loadRangedSkaters(range: RangedRead, options?: RangedReadOptions): Promise<RangedSkater[]> {
    return loadRanged(range, 'HOCKEY_SKATING', SKATER_COLUMNS, options);
}

/** every NHL goalie's totals over the range, in Fantrax's order (fantasy points descending) */
export function loadRangedGoalies(range: RangedRead, options?: RangedReadOptions): Promise<RangedGoalie[]> {
    return loadRanged(range, 'POS_201', GOALIE_COLUMNS, options);
}

/** every NHL player's fantasy points over the range, without games played or categories (Fantrax's all-positions table has neither) */
export function loadRangedPoints(range: RangedRead, options?: RangedReadOptions): Promise<RangedPlayer[]> {
    return loadRanged(range, 'ALL', {}, options);
}

interface RangedPage {
    displayedPosOrGroup: string;
    displayedSeasonOrProjection: { code: string; timeframeTypeCode: string };
    displayedSelections: { displayedStartDate: number; displayedEndDate: number };
    paginatedResultSet: { pageNumber: number; totalNumResults: number; totalNumPages: number };
    tableHeader: { cells: { key?: string }[] };
    statsTable: {
        scorer: { scorerId: string; name: string; posShortNames: string; teamShortName?: string };
        cells: { content?: string }[];
    }[];
}

const EASTERN_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Fantrax echoes each day as the instant of midnight Eastern at its start; null for anything else */
function easternDate(instant: unknown) {
    return typeof instant === 'number' && Number.isFinite(instant) ? EASTERN_DATE.format(instant) : null;
}

/** a real calendar day written `YYYY-MM-DD` */
function isDate(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

const MAX_PAGE_SIZE = 5000;
const MAX_PAGES = 20;

// shortcut: Fantrax's website stats endpoint is undocumented; replace it when a supported player-stats API is available.
async function loadRanged<Columns extends Record<string, string>>(
    { leagueId, seasonCode, startDate, endDate }: RangedRead, positionOrGroup: string, columns: Columns,
    { fetcher = globalFetch, pageSize = MAX_PAGE_SIZE }: RangedReadOptions = {},
): Promise<(RangedPlayer & { [Name in keyof Columns]: number })[]> {
    if (!seasonCode.endsWith('_BY_DATE') || !isDate(startDate) || !isDate(endDate) || startDate > endDate) {
        throw new Error(`${seasonCode} ${startDate}..${endDate} is not a Fantrax date range`);
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) throw new Error(`Fantrax page size ${pageSize} is not 1 to ${MAX_PAGE_SIZE}`);
    const players = new Map<string, RangedPlayer & { [Name in keyof Columns]: number }>();
    let pageCount = 1, total = 0;
    for (let page = 1; page <= pageCount; page++) {
        const data = await websiteRequest(leagueId, 'getPlayerStats', {
            leagueId, view: 'STATS', statusOrTeamFilter: 'ALL', positionOrGroup, sortType: 'SCORE', sortReversed: false, miscDisplayType: '1',
            // categories only come back with the scoring category type left out, and the all-positions table has none
            ...(positionOrGroup === 'ALL' ? { scoringCategoryType: '5' } : {}),
            seasonOrProjection: seasonCode, timeframeTypeCode: 'BY_DATE', startDate, endDate,
            pageNumber: String(page), maxResultsPerPage: String(pageSize),
        }, 'ranged player stats', fetcher) as RangedPage | undefined;
        if (!data) throw new Error('Fantrax returned no ranged player stats');
        // a malformed ranged request still gets HTTP 200 with season-to-date totals, sometimes under the by-date code
        if (data.displayedSeasonOrProjection?.code !== seasonCode || data.displayedSeasonOrProjection.timeframeTypeCode !== 'BY_DATE') {
            throw new Error(`Fantrax answered a ${seasonCode} range with another season or timeframe`);
        }
        if (easternDate(data.displayedSelections?.displayedStartDate) !== startDate || easternDate(data.displayedSelections.displayedEndDate) !== endDate) {
            throw new Error(`Fantrax answered ${startDate}..${endDate} with other dates`);
        }
        if (data.displayedPosOrGroup !== positionOrGroup) throw new Error(`Fantrax answered a ${positionOrGroup} range with another position group`);
        const pagination = data.paginatedResultSet;
        if (!Array.isArray(data.statsTable) || !Array.isArray(data.tableHeader?.cells) || pagination?.pageNumber !== page ||
            !Number.isInteger(pagination.totalNumResults) || pagination.totalNumResults < 0 || !Number.isInteger(pagination.totalNumPages) ||
            pagination.totalNumPages !== Math.max(1, Math.ceil(pagination.totalNumResults / pageSize)) ||
            data.statsTable.length !== Math.max(0, Math.min(pageSize, pagination.totalNumResults - (page - 1) * pageSize))) {
            throw new Error('Fantrax returned an incomplete or unexpected ranged player stats page');
        }
        if (page > 1 && (pagination.totalNumResults !== total || pagination.totalNumPages !== pageCount)) {
            throw new Error(`Fantrax's ${startDate}..${endDate} table changed between pages`);
        }
        ({ totalNumPages: pageCount, totalNumResults: total } = pagination);
        if (pageCount > MAX_PAGES) throw new Error(`Fantrax's ${startDate}..${endDate} table has an unexpected ${pageCount} pages`);
        // the ranged table has no overall-rank column, so every column is found by key
        const header = data.tableHeader.cells.map(cell => cell?.key);
        const indexes = new Map(['age', 'fpts', 'fptsPerGame', ...Object.values(columns)].map(key => {
            const index = header.indexOf(key);
            if (index < 0) throw new Error(`Fantrax's ranged player stats have no ${key} column`);
            return [key, index];
        }));
        const column = (key: string) => indexes.get(key)!;
        for (const row of data.statsTable) {
            const scorer = row?.scorer;
            if (typeof scorer?.scorerId !== 'string' || !scorer.scorerId || typeof scorer.name !== 'string' || !scorer.name ||
                typeof scorer.posShortNames !== 'string' || (scorer.teamShortName != null && typeof scorer.teamShortName !== 'string') ||
                !Array.isArray(row.cells)) throw new Error('Fantrax ranged player is invalid');
            if (players.has(scorer.scorerId)) throw new Error(`Fantrax's ${startDate}..${endDate} table has player ${scorer.scorerId} more than once`);
            const stat = (key: string) => numericStat(row.cells[column(key)]?.content);
            const player = {
                id: row.scorer.scorerId, name: row.scorer.name, positions: row.scorer.posShortNames, nhlTeam: row.scorer.teamShortName ?? null,
                age: stat('age'), points: stat('fpts') ?? 0, perGame: stat('fptsPerGame'),
                ...Object.fromEntries(Object.entries(columns).map(([name, key]) => [name, stat(key) ?? 0])),
            } as RangedPlayer & { [Name in keyof Columns]: number };
            players.set(player.id, player);
        }
    }
    if (players.size !== total) throw new Error(`Fantrax returned an incomplete ${startDate}..${endDate} table`);
    return [...players.values()];
}
