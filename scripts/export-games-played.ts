// Read-only export: games played (GLOSSARY.md) for every player season from 2018–19 through 2025–26, skaters and
// goalies, from each past YOFHL league's signed-out Fantrax skater and goalie tables, written to the games-played
// history file the season import reads (scripts/db/lib/games-played.ts). Changes nothing in the database. It fails if
// a player season with FPts in a season's "Player Stats.csv" has no games played in Fantrax's tables.
//
//   node --import tsx scripts/export-games-played.ts
//
// The CSVs are read from data/ (or YOFHL_DATA_DIR); each raw page is saved under output/games-played/.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadGoalieTable } from '../lib/fantrax/goalie-table';
import { loadSkaterTable } from '../lib/fantrax/skater-table';
import { parsePlayerStats } from './db/lib/fantrax';
import { GAMES_PLAYED_HISTORY, matchGamesPlayed, type GamesPlayedHistory } from './db/lib/games-played';

const DATA_DIR = process.env.YOFHL_DATA_DIR ?? 'data';
const OUTPUT = 'output/games-played';
// the same leagues the record book's category export reads (scripts/export-record-player-stats.ts)
const seasons = [
    [2019, 'cbeezjr4jmmz6dgo'], [2020, '8zqaak59juzrzfr5'], [2021, 'og1gnuxxkboae8ug'], [2022, 'z7jzx67oku2xdvgj'],
    [2023, 'bibpb81hl8dwz8ih'], [2024, '9k4ujgoolm6sflk7'], [2025, 'ikr0y4idm0rhf8v7'], [2026, 'gl4i2lrcmfblkbwq'],
] as const;

async function main() {
    const history: GamesPlayedHistory = { fetchedAt: new Date().toISOString(), source: 'Fantrax regular-season skater and goalie games played', coverage: [], players: [] };
    await mkdir(OUTPUT, { recursive: true });
    for (const [year, leagueId] of seasons) {
        const archive = parsePlayerStats(path.join(DATA_DIR, `${year - 1}-${year} Player Stats.csv`));
        const save = (table: string) => (raw: unknown, page: number) => writeFile(`${OUTPUT}/${year}-${table}-${page}.json`, JSON.stringify(raw));
        const skaters = await loadSkaterTable(leagueId, year, { onPage: save('skaters') });
        const goalies = await loadGoalieTable(leagueId, year, { onPage: save('goalies') });
        if (skaters.seasonCode !== goalies.seasonCode) throw new Error(`${year}: the skater and goalie tables are for different seasons`);
        const rows = matchGamesPlayed(year, archive, [...skaters.skaters, ...goalies.goalies]);
        history.players.push(...rows);
        history.coverage.push({ year, leagueId, seasonCode: skaters.seasonCode, players: rows.length });
        console.log(`${year - 1}-${year}: ${rows.length} of ${archive.length} exported player seasons have games played; ${skaters.skaters.length} skaters and ${goalies.goalies.length} goalies validated`);
    }
    await writeFile(GAMES_PLAYED_HISTORY, `${JSON.stringify(history)}\n`);
    console.log(`Saved ${history.players.length} player seasons to ${GAMES_PLAYED_HISTORY}. No database changes.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
