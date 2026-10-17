import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { FANTRAX_LEAGUE_ID } from '../../lib/fantrax/config';
import { playerName } from '../../lib/fantrax/model';
import { cleanId, normalizeName, positionsFrom, initialDraft, parseWorkspace, type Player, type Snapshot, type Stats } from '../lib/model';
import { historicalCache } from '../lib/history-cache';

const refreshHistory = process.argv.includes('--refresh-history');
const cacheDirectory = resolve('companion/.data/cache');

interface TableRow { scorer: { scorerId: string; name: string; teamShortName?: string; posShortNames: string; icons?: { tooltip?: string; typeId: string }[] }; cells: { content?: string }[] }
interface StatsPage {
    displayedStatusOrTeam: string; displayedSeasonOrProjection: { code: string };
    paginatedResultSet: { totalNumPages: number; pageNumber: number; totalNumResults: number };
    seasonOrProjections: { name: string; code: string }[];
    tableHeader: { cells: { shortName: string }[] }; statsTable: TableRow[];
}
interface LeagueInfo {
    startDate: string; playerInfo: Record<string, { eligiblePos: string; status: string }>;
    scoringSystem: { scoringCategories: Record<string, Record<string, Record<string, string>>> };
}
interface DirectoryPlayer { name: string; team?: string; position: string }
type NhlHistory = { total: number; data: { playerId: number; skaterFullName: string; gamesPlayed: number }[] };
function parseNhlHistory(value: unknown): NhlHistory {
    const history = value as NhlHistory;
    if (!Array.isArray(history?.data) || history.data.length !== history.total || !history.data.length ||
        !history.data.every(p => Number.isInteger(p.playerId) && typeof p.skaterFullName === 'string' && Number.isInteger(p.gamesPlayed) && p.gamesPlayed > 0)) throw new Error('Incomplete NHL career history. Existing snapshot preserved.');
    return history;
}
async function request<T>(url: string, body?: object): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(25000), ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
            if (!response.ok) throw new Error(`Fantrax returned HTTP ${response.status}`);
            const json = await response.json();
            if (json.pageError) throw new Error(`Fantrax: ${json.pageError.title ?? json.pageError.code}`);
            return json;
        } catch (error) { if (attempt === 2) throw error; await new Promise(r => setTimeout(r, 500 * (attempt + 1))); }
    }
    throw new Error('Fantrax unavailable');
}
async function page(position: string, season?: string, number = 1): Promise<StatsPage> {
    const response = await request<{ responses: { data: StatsPage }[] }>(`https://www.fantrax.com/fxpa/req?leagueId=${FANTRAX_LEAGUE_ID}`, {
        msgs: [{ method: 'getPlayerStats', data: { leagueId: FANTRAX_LEAGUE_ID, view: 'STATS', statusOrTeamFilter: 'ALL', positionOrGroup: position,
            pageNumber: String(number), maxResultsPerPage: '500', miscDisplayType: '1', ...(season ? { seasonOrProjection: season } : {}) } }],
    });
    const data = response.responses?.[0]?.data;
    if (!data?.statsTable || !data.tableHeader?.cells || data.displayedStatusOrTeam !== 'ALL' || data.paginatedResultSet?.pageNumber !== number ||
        (season && data.displayedSeasonOrProjection?.code !== season)) throw new Error('Fantrax returned an unexpected player table. Existing snapshot preserved.');
    return data;
}
const numeric = (value: string | undefined) => {
    if (!value || /^(?:-|—|N\/A)$/.test(value.trim())) return null;
    const number = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(number) ? number : null;
};
async function allStats(position: string, season: string) {
    const first = await page(position, season), results = new Map<string, { stats: Stats; age: number | null; note: string; row: TableRow }>();
    const pages = first.paginatedResultSet.totalNumPages;
    if (!Number.isInteger(pages) || pages < 1 || pages > 100) throw new Error('Unexpected Fantrax pagination.');
    function add(data: StatsPage) {
        for (const row of data.statsTable) {
            if (results.has(row.scorer.scorerId)) throw new Error('Fantrax repeated a player across pages. Please retry sync.');
            const cells = Object.fromEntries(data.tableHeader.cells.map((header, i) => [header.shortName, numeric(row.cells[i]?.content)]));
            const categories = Object.fromEntries(['G', 'A', 'SOG', 'GWG', 'STP', 'Hit', 'Blk', 'W', 'OL+ShL', 'SHO', 'SV%'].filter(key => cells[key] != null).map(key => [key, cells[key]]));
            results.set(row.scorer.scorerId, { row, age: cells.Age ?? null,
                note: (row.scorer.icons ?? []).filter(icon => /injur|day.to.day|suspend|out indefinitely/i.test(icon.tooltip ?? '')).map(icon => (icon.tooltip ?? '').replace(/<[^>]+>/g, '')).join(' · '),
                stats: { games: cells.GP ?? null, points: cells.FPts ?? null, perGame: cells['FP/G'] ?? null, categories } });
        }
    }
    add(first);
    for (let number = 2; number <= pages; number++) add(await page(position, season, number));
    if (results.size !== first.paginatedResultSet.totalNumResults) throw new Error('Player table changed during sync. Retry to get a complete snapshot.');
    console.log(`${position} ${season}: ${results.size} players`);
    return results;
}
type StatsEntries = [string, { stats: Stats; age: number | null; note: string; row: TableRow }][];
function parseStatsEntries(value: unknown): StatsEntries {
    const entries = value as StatsEntries;
    const numericOrNull = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value));
    if (!Array.isArray(entries) || !entries.length || !entries.every(entry => {
        if (!Array.isArray(entry) || entry.length !== 2) return false;
        const [id, player] = entry;
        return typeof id === 'string' && !!id && player?.row?.scorer?.scorerId === id &&
            typeof player.row.scorer.name === 'string' && typeof player.row.scorer.posShortNames === 'string' &&
            typeof player.note === 'string' && numericOrNull(player.age) && player.stats &&
            [player.stats.games, player.stats.points, player.stats.perGame].every(numericOrNull) &&
            player.stats.categories && Object.values(player.stats.categories).every(numericOrNull);
    }) || new Set(entries.map(([id]) => id)).size !== entries.length) throw new Error('Invalid historical player cache.');
    return entries;
}
async function historicalStats(position: string, seasonCode: string, seasonName: string, scoring: LeagueInfo['scoringSystem']) {
    const key = JSON.stringify(['fantrax-stats-v1', FANTRAX_LEAGUE_ID, seasonName, position, scoring]);
    const entries = await historicalCache(cacheDirectory, key, async () => [...await allStats(position, seasonCode)], parseStatsEntries, refreshHistory);
    return new Map(entries);
}
async function main() {
    const url = process.env.DATABASE_URL_V2 ?? process.env.DATABASE_URL;
    if (!url) throw new Error('Set DATABASE_URL_V2 in the repo’s .env.local to read Varrock’s keepers.');
    const sql = neon(url);
    const [info, directory, keeperRows, archive, earlierNhl] = await Promise.all([
        request<LeagueInfo>(`https://www.fantrax.com/fxea/general/getLeagueInfo?leagueId=${FANTRAX_LEAGUE_ID}`),
        request<Record<string, DirectoryPlayer>>('https://www.fantrax.com/fxea/general/getPlayerIds?sport=NHL'),
        sql`select kept_ids, roster, submitted_at from league.keeper_submissions where franchise_id = 4 and season_year = 2027`,
        sql`select replace(player_id, '*', '') as id, fpts::float8 as points, fpg::float8 as per_game from league.player_seasons where season_year = 2026`,
        historicalCache(cacheDirectory, 'nhl-skater-career-v1-through-20232024',
            () => request<NhlHistory>('https://api.nhle.com/stats/rest/en/skater/summary?isAggregate=true&isGame=false&start=0&limit=-1&cayenneExp=gameTypeId%3D2%20and%20seasonId%3C%3D20232024'), parseNhlHistory, refreshHistory),
    ]);
    const nhlNames = new Map<string, Set<number>>(), directoryNames = new Map<string, number>();
    for (const p of earlierNhl.data) {
        const name = normalizeName(p.skaterFullName), ids = nhlNames.get(name) ?? new Set<number>();
        ids.add(p.playerId); nhlNames.set(name, ids);
    }
    for (const p of Object.values(directory)) {
        const name = normalizeName(playerName(p.name)); directoryNames.set(name, (directoryNames.get(name) ?? 0) + 1);
    }
    if (!keeperRows.length) throw new Error('Varrock has no saved 2026–2027 keeper submission.');
    if (!info.startDate.startsWith('2026') || !info.playerInfo || !Object.keys(info.playerInfo).length) throw new Error('Expected the 2026–2027 YOFHL league.');
    const scoring = info.scoringSystem.scoringCategories;
    const expected = { G: { Default: 'points5', D: 'points6' }, A: { Default: 'points3', D: 'points4' }, SOG: { Default: 'points0.25' }, Hit: { Default: 'points0.25' }, Blk: { Default: 'points0.5' }, STP: { Default: 'points1' }, GWG: { Default: 'points1' } };
    for (const [stat, positions] of Object.entries(expected)) for (const [position, points] of Object.entries(positions)) {
        if (scoring.SKATING?.[stat]?.[position] !== points) throw new Error('YOFHL scoring changed. Review the companion scoring model before syncing.');
    }
    for (const [stat, points] of Object.entries({ W: 'points6', SHO: 'points4', 'OL+ShL': 'points2' })) if (scoring.GOALIE?.[stat]?.Default !== points) throw new Error('Goalie scoring changed. Review the companion model.');
    if (Object.keys(scoring.GOALIE).length !== 4 || scoring.GOALIE['SV%']?.Default !== 'range0|0|0|NULL$0.01|0.799|0|NULL$0.8|0.849|0|NULL$0.85|0.899|0|NULL$0.9|0.919|2|NULL$0.92|0.929|4|NULL$0.93|0.939|8|NULL$0.94|1|10|NULL') throw new Error('Goalie save-percentage scoring changed. Review the companion model.');
    const options = (await page('HOCKEY_SKATING')).seasonOrProjections;
    const projection = options.find(s => s.name === 'Projected - Season')?.code;
    const previous = options.find(s => s.name === '2025-26 Reg Season - YTD')?.code;
    const older = options.find(s => s.name === '2024-25 Reg Season - YTD')?.code;
    if (!projection || !previous || !older) throw new Error('Fantrax did not offer the expected seasons and projections.');
    const [skaters, goalies, pastSkaters, pastGoalies, olderSkaters, olderGoalies] = await Promise.all([
        allStats('HOCKEY_SKATING', projection), allStats('POS_201', projection),
        historicalStats('HOCKEY_SKATING', previous, '2025-26', info.scoringSystem), historicalStats('POS_201', previous, '2025-26', info.scoringSystem),
        historicalStats('HOCKEY_SKATING', older, '2024-25', info.scoringSystem), historicalStats('POS_201', older, '2024-25', info.scoringSystem),
    ]);
    const projected = new Map([...skaters, ...goalies]), past = new Map([...pastSkaters, ...pastGoalies]), oldest = new Map([...olderSkaters, ...olderGoalies]);
    const historical = new Map(archive.map(row => [row.id, row]));
    const roster = keeperRows[0].roster as { id: string; name: string; position: string; status: string; nhlTeam: string }[];
    const keeperIds = [...new Set([...(keeperRows[0].kept_ids as string[]), ...roster.filter(p => p.status === 'MINORS').map(p => p.id)].map(cleanId))];
    const warnings: string[] = [];
    const players: Player[] = [];
    for (const [id, leaguePlayer] of Object.entries(info.playerInfo)) {
        const details = directory[id], stats = projected.get(id), old = past.get(id), saved = roster.find(p => cleanId(p.id) === id);
        const positions = positionsFrom(leaguePlayer.eligiblePos);
        const name = details ? playerName(details.name) : stats?.row.scorer.name ?? old?.row.scorer.name ?? saved?.name;
        if (!positions.length || !name) { warnings.push(`Player ${id} could not be identified and was excluded.`); continue; }
        const archived = historical.get(id);
        const previousStats = old?.stats && ((old.stats.games ?? 0) > 0 || (old.stats.points ?? 0) > 0) ? old.stats
            : archived ? { games: null, points: archived.points, perGame: archived.per_game, categories: {} } : null;
        const projectedStats = stats?.stats && (previousStats || (stats.stats.games ?? 0) > 0 || (stats.stats.points ?? 0) > 0) ? stats.stats : null;
        players.push({ id, name, positions, team: stats?.row.scorer.teamShortName ?? details?.team ?? saved?.nhlTeam ?? '',
            available: leaguePlayer.status === 'FA' || leaguePlayer.status === 'W', age: stats?.age ?? old?.age ?? null, note: stats?.note || old?.note || '',
            projected: projectedStats, previous: previousStats,
            // Two-season games played drive the injury flag (skaters) and the Calder-style prospect filter (everyone).
            gamesPlayed: { '2024-25': oldest.get(id)?.stats.games ?? null, '2025-26': old?.stats.games ?? null },
            ...(!positions.includes('G') ? { nhlBefore2024: directoryNames.get(normalizeName(name)) === 1 && nhlNames.get(normalizeName(name))?.size === 1 } : {}) });
    }
    for (const id of keeperIds) if (!players.some(p => p.id === id)) throw new Error(`Keeper ${id} is missing from the player catalogue. Existing snapshot preserved.`);
    const snapshot: Snapshot = { version: 1, season: '2026–2027', fetchedAt: new Date().toISOString(), players, keeperIds,
        minorIds: roster.filter(p => p.status === 'MINORS' && p.id !== '05xct').map(p => cleanId(p.id)),
        keeperSavedAt: new Date(keeperRows[0].submitted_at).toISOString(), warnings };
    parseWorkspace({ snapshot, draft: initialDraft(snapshot) });
    const dir = resolve('companion/.data'); await mkdir(dir, { recursive: true });
    const file = resolve(dir, 'snapshot.json');
    try { await writeFile(resolve(dir, 'snapshot.previous.json'), await readFile(file)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    await writeFile(file + '.tmp', JSON.stringify(snapshot)); await rename(file + '.tmp', file);
    console.log(`Saved ${players.length} players, ${keeperIds.length} keepers and ${players.filter(p => p.available).length} available players to companion/.data/snapshot.json.`);
    console.log('Existing browser picks and imported CSV pools are preserved. Use Reload data in the app to apply this snapshot.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Data sync failed.'); process.exitCode = 1; });
