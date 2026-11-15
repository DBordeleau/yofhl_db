// Fantrax's website stats table over a date range: each NHL player's fantasy points, games played and categories
// between two days, signed out. The award vote's prepare reads through it (lib/award-vote/award-vote.ts). See
// "Reading Fantrax by date range" in issue #147.
import { globalFetch, numericStat, websiteRequest, type Fetcher } from './leaders';
import { fantraxByDateSeasonName } from './season';

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

/**
 * A goalie's totals. Fantrax's table shows the categories its league scores, so the categories every league has
 * scored are always there, and the others only when that league's table has their column (the 2025-26 league scores
 * OL+ShL and SV%, the 2026-27 league OL+ShL, GA and SV); each is null where Fantrax shows no value.
 */
export interface RangedGoalie extends RangedPlayer {
    gamesPlayed: number;
    wins: number;
    shutouts: number;
    /** overtime and shootout losses (OL+ShL) */
    overtimeLosses?: number | null;
    goalsAgainst?: number | null;
    saves?: number | null;
    /** e.g. 0.915 */
    savePercentage?: number | null;
}

const SKATER_COLUMNS = {
    gamesPlayed: '2010#2100#-1', goals: '2010#2130#-1', assists: '2010#2090#-1', shots: '2010#2270#-1', hits: '2010#2147#-1', blocks: '2010#2092#-1',
} as const;
const GOALIE_COLUMNS = { gamesPlayed: '2020#2100#-1', wins: '2020#231b#-1', shutouts: '2020#2290#-1' } as const;
/** the goalie categories a league may not score, read when its table has the column */
const GOALIE_OPTIONAL_COLUMNS = {
    overtimeLosses: '2020#232c#-1', goalsAgainst: '2020#2140#-1', saves: '2020#2230#-1', savePercentage: '2020#2330#-1',
} as const;

/** one page of a range's table (`players` in Fantrax's order), with how many pages and players the whole table has */
export interface RangedPage<Player> {
    players: Player[];
    pages: number;
    total: number;
}

/** every NHL skater's totals over the range, in Fantrax's order (fantasy points descending) */
export function loadRangedSkaters(range: RangedRead, options?: RangedReadOptions): Promise<RangedSkater[]> {
    return loadRanged(range, 'HOCKEY_SKATING', SKATER_COLUMNS, options);
}

/** every NHL goalie's totals over the range, in Fantrax's order (fantasy points descending) */
export function loadRangedGoalies(range: RangedRead, options?: RangedReadOptions): Promise<RangedGoalie[]> {
    return loadRanged(range, 'POS_201', GOALIE_COLUMNS, options, GOALIE_OPTIONAL_COLUMNS);
}

/** one page (from 1) of every NHL skater's totals over the range, for a caller that reads the pages apart */
export function loadRangedSkaterPage(range: RangedRead, page: number, options?: RangedReadOptions): Promise<RangedPage<RangedSkater>> {
    return loadRangedPage(range, 'HOCKEY_SKATING', SKATER_COLUMNS, page, options);
}

/** one page (from 1) of every NHL goalie's totals over the range, for a caller that reads the pages apart */
export function loadRangedGoaliePage(range: RangedRead, page: number, options?: RangedReadOptions): Promise<RangedPage<RangedGoalie>> {
    return loadRangedPage(range, 'POS_201', GOALIE_COLUMNS, page, options, GOALIE_OPTIONAL_COLUMNS);
}

/** every NHL player's fantasy points over the range, without games played or categories (Fantrax's all-positions table has neither) */
export function loadRangedPoints(range: RangedRead, options?: RangedReadOptions): Promise<RangedPlayer[]> {
    return loadRanged(range, 'ALL', {}, options);
}

/**
 * The by-date code of a season year (e.g. `SEASON_31l_BY_DATE` for 2026), from the seasons a one-row stats page
 * offers. Throws when Fantrax offers no date ranges for that season.
 */
export async function findByDateSeasonCode(leagueId: string, seasonYear: number, { fetcher = globalFetch }: Pick<RangedReadOptions, 'fetcher'> = {}): Promise<string> {
    const data = await websiteRequest(leagueId, 'getPlayerStats', {
        leagueId, view: 'STATS', statusOrTeamFilter: 'ALL', positionOrGroup: 'ALL', sortType: 'SCORE', sortReversed: false, miscDisplayType: '1',
        scoringCategoryType: '5', pageNumber: '1', maxResultsPerPage: '1',
    }, 'player stats seasons', fetcher) as { seasonOrProjections?: { code?: unknown; name?: unknown; timeframeTypeCode?: unknown }[] } | undefined;
    const name = fantraxByDateSeasonName(seasonYear);
    const season = Array.isArray(data?.seasonOrProjections) ? data.seasonOrProjections.find(item => item?.name === name) : undefined;
    if (typeof season?.code !== 'string' || !season.code.endsWith('_BY_DATE') || season.timeframeTypeCode !== 'BY_DATE') {
        throw new Error(`Fantrax offers no "${name}" stats`);
    }
    return season.code;
}

interface RangedStatsPage {
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
/** a full page takes far longer than Fantrax's other answers, as the skater table's large pages do (skater-table.ts) */
const PAGE_TIMEOUT_MS = 30_000;

type Ranged<Columns extends Record<string, string>, Optional extends Record<string, string> = Record<never, string>> =
    RangedPlayer & { [Name in keyof Columns]: number } & { [Name in keyof Optional]?: number | null };

async function loadRanged<Columns extends Record<string, string>, Optional extends Record<string, string> = Record<never, string>>(
    range: RangedRead, positionOrGroup: string, columns: Columns, options: RangedReadOptions = {}, optional?: Optional,
): Promise<Ranged<Columns, Optional>[]> {
    const { startDate, endDate } = range;
    const players = new Map<string, Ranged<Columns, Optional>>();
    let pageCount = 1, total = 0;
    for (let page = 1; page <= pageCount; page++) {
        const read = await loadRangedPage(range, positionOrGroup, columns, page, options, optional);
        if (page > 1 && (read.total !== total || read.pages !== pageCount)) {
            throw new Error(`Fantrax's ${startDate}..${endDate} table changed between pages`);
        }
        ({ pages: pageCount, total } = read);
        for (const player of read.players) {
            if (players.has(player.id)) throw new Error(`Fantrax's ${startDate}..${endDate} table has player ${player.id} more than once`);
            players.set(player.id, player);
        }
    }
    if (players.size !== total) throw new Error(`Fantrax returned an incomplete ${startDate}..${endDate} table`);
    return [...players.values()];
}

// shortcut: Fantrax's website stats endpoint is undocumented; replace it when a supported player-stats API is available.
/** `columns` must all be in the table; each of `optional` is read when the table has it and left out when it hasn't */
async function loadRangedPage<Columns extends Record<string, string>, Optional extends Record<string, string> = Record<never, string>>(
    { leagueId, seasonCode, startDate, endDate }: RangedRead, positionOrGroup: string, columns: Columns, page: number,
    { fetcher = globalFetch, pageSize = MAX_PAGE_SIZE }: RangedReadOptions = {}, optional?: Optional,
): Promise<RangedPage<Ranged<Columns, Optional>>> {
    if (!seasonCode.endsWith('_BY_DATE') || !isDate(startDate) || !isDate(endDate) || startDate > endDate) {
        throw new Error(`${seasonCode} ${startDate}..${endDate} is not a Fantrax date range`);
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) throw new Error(`Fantrax page size ${pageSize} is not 1 to ${MAX_PAGE_SIZE}`);
    if (!Number.isInteger(page) || page < 1 || page > MAX_PAGES) throw new Error(`Fantrax page ${page} is not 1 to ${MAX_PAGES}`);
    const data = await websiteRequest(leagueId, 'getPlayerStats', {
        leagueId, view: 'STATS', statusOrTeamFilter: 'ALL', positionOrGroup, sortType: 'SCORE', sortReversed: false, miscDisplayType: '1',
        // categories only come back with the scoring category type left out, and the all-positions table has none
        ...(positionOrGroup === 'ALL' ? { scoringCategoryType: '5' } : {}),
        seasonOrProjection: seasonCode, timeframeTypeCode: 'BY_DATE', startDate, endDate,
        pageNumber: String(page), maxResultsPerPage: String(pageSize),
    }, 'ranged player stats', fetcher, PAGE_TIMEOUT_MS) as RangedStatsPage | undefined;
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
    const { totalNumPages: pages, totalNumResults: total } = pagination;
    if (pages > MAX_PAGES) throw new Error(`Fantrax's ${startDate}..${endDate} table has an unexpected ${pages} pages`);
    // the ranged table has no overall-rank column, so every column is found by key
    const header = data.tableHeader.cells.map(cell => cell?.key);
    const indexes = new Map(['age', 'fpts', 'fptsPerGame', ...Object.values(columns)].map(key => {
        const index = header.indexOf(key);
        if (index < 0) throw new Error(`Fantrax's ranged player stats have no ${key} column`);
        return [key, index];
    }));
    const offered = Object.entries(optional ?? {}).filter(([, key]) => header.includes(key));
    for (const [, key] of offered) indexes.set(key, header.indexOf(key));
    const column = (key: string) => indexes.get(key)!;
    const players = new Map<string, Ranged<Columns, Optional>>();
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
            ...Object.fromEntries(offered.map(([name, key]) => [name, stat(key)])),
        } as Ranged<Columns, Optional>;
        players.set(player.id, player);
    }
    return { players: [...players.values()], pages, total };
}
