// Read-only export. Completed seasons are bundled with Records; page views make no extra API calls.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { parseCategoryPage, type CategorySeason } from '../lib/records/player-stats';

const seasons = [
    [2019, 'cbeezjr4jmmz6dgo'], [2020, '8zqaak59juzrzfr5'], [2021, 'og1gnuxxkboae8ug'], [2022, 'z7jzx67oku2xdvgj'],
    [2023, 'bibpb81hl8dwz8ih'], [2024, '9k4ujgoolm6sflk7'], [2025, 'ikr0y4idm0rhf8v7'], [2026, 'gl4i2lrcmfblkbwq'],
] as const;
async function main() {
    const players: CategorySeason[] = [];
    const coverage: { year: number; leagueId: string; seasonCode: string; players: number }[] = [];
    await mkdir('output/record-player-stats', { recursive: true });
    for (const [year, leagueId] of seasons) {
        const archive = parse(await readFile(`data/${year - 1}-${year} Player Stats.csv`, 'utf8'), { columns: true, skip_empty_lines: true, bom: true }) as { ID: string; Position: string; FPts: string }[];
        const ids = new Set(archive.filter(p => !p.Position.split(',').includes('G')).map(p => p.ID.replace(/\*/g, '')));
        const found = new Set<string>(), allIds = new Set<string>();
        let pageCount = 1, total = 0, seasonCode: string | undefined;
        for (let page = 1; page <= pageCount; page++) {
            const response = await fetch(`https://www.fantrax.com/fxpa/req?leagueId=${leagueId}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000),
                body: JSON.stringify({ msgs: [{ method: 'getPlayerStats', data: {
                    leagueId, view: 'STATS', statusOrTeamFilter: 'ALL', positionOrGroup: 'HOCKEY_SKATING',
                    pageNumber: String(page), maxResultsPerPage: '10000', miscDisplayType: '1', ...(seasonCode ? { seasonOrProjection: seasonCode } : {}),
                } }] }),
            });
            if (!response.ok) throw new Error(`Fantrax HTTP ${response.status}`);
            const raw = await response.json();
            const result = parseCategoryPage(raw.responses?.[0]?.data, year, page);
            await writeFile(`output/record-player-stats/${year}-${page}.json`, JSON.stringify(raw));
            if (page > 1 && (total !== result.pagination.totalNumResults || pageCount !== result.pagination.totalNumPages)) throw new Error('Pagination changed during export');
            pageCount = result.pagination.totalNumPages; total = result.pagination.totalNumResults; seasonCode = result.seasonCode;
            if (pageCount > 100) throw new Error('Unexpected pagination');
            for (const id of result.allIds) { if (allIds.has(id)) throw new Error(`Repeated player ${id}`); allIds.add(id); }
            for (const player of result.players) if (ids.has(player.id)) { players.push(player); found.add(player.id); }
        }
        if (allIds.size !== total) throw new Error(`Incomplete pagination for ${year}`);
        const missing = archive.filter(p => ids.has(p.ID.replace(/\*/g, '')) && Number(p.FPts.replace(/,/g, '')) > 0 && !found.has(p.ID.replace(/\*/g, '')));
        if (missing.length) throw new Error(`Missing ${missing.length} scoring skaters in ${year}: ${missing.slice(0, 5).map(p => p.ID).join(', ')}`);
        coverage.push({ year, leagueId, seasonCode: seasonCode!, players: found.size });
        console.log(`${year - 1}-${year}: ${found.size} archived skaters; ${allIds.size}/${total} API rows validated`);
    }
    await writeFile('lib/records/player-category-history.json', JSON.stringify({ fetchedAt: new Date().toISOString(), source: 'Fantrax regular-season player totals', coverage, players }));
    console.log(`Saved ${players.length} player-seasons. No database changes.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
