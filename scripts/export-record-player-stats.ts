// Read-only export. Completed seasons are bundled with Records; page views make no extra API calls.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { loadSkaterTable } from '../lib/fantrax/skater-table';
import type { CategorySeason } from '../lib/records/player-stats';
import { csvPlayerId } from './db/lib/fantrax';

const seasons = [
    [2019, 'cbeezjr4jmmz6dgo'], [2020, '8zqaak59juzrzfr5'], [2021, 'og1gnuxxkboae8ug'], [2022, 'z7jzx67oku2xdvgj'],
    [2023, 'bibpb81hl8dwz8ih'], [2024, '9k4ujgoolm6sflk7'], [2025, 'ikr0y4idm0rhf8v7'], [2026, 'gl4i2lrcmfblkbwq'],
] as const;
async function main() {
    const players: CategorySeason[] = [];
    const coverage: { year: number; leagueId: string; seasonCode: string; players: number }[] = [];
    await mkdir('output/record-player-stats', { recursive: true });
    for (const [year, leagueId] of seasons) {
        const file = `data/${year - 1}-${year} Player Stats.csv`;
        const archive = (parse(await readFile(file, 'utf8'), { columns: true, skip_empty_lines: true, bom: true }) as { ID: string; Position: string; FPts: string }[])
            .map((p, i) => ({ ...p, id: csvPlayerId(p.ID, file, i) }));
        const ids = new Set(archive.filter(p => !p.Position.split(',').includes('G')).map(p => p.id));
        const found = new Set<string>();
        const table = await loadSkaterTable(leagueId, year, {
            onPage: (raw, page) => writeFile(`output/record-player-stats/${year}-${page}.json`, JSON.stringify(raw)),
        });
        for (const { id, categories } of table.skaters) if (categories && ids.has(id)) { players.push({ id, year, ...categories }); found.add(id); }
        const missing = archive.filter(p => ids.has(p.id) && Number(p.FPts.replace(/,/g, '')) > 0 && !found.has(p.id));
        if (missing.length) throw new Error(`Missing ${missing.length} scoring skaters in ${year}: ${missing.slice(0, 5).map(p => p.id).join(', ')}`);
        coverage.push({ year, leagueId, seasonCode: table.seasonCode, players: found.size });
        console.log(`${year - 1}-${year}: ${found.size} archived skaters; ${table.skaters.length} API rows validated`);
    }
    await writeFile('lib/records/player-category-history.json', JSON.stringify({ fetchedAt: new Date().toISOString(), source: 'Fantrax regular-season player totals', coverage, players }));
    console.log(`Saved ${players.length} player-seasons. No database changes.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
