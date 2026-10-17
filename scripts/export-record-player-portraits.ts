// Reuse the saved stats export; only the missing goalie snapshot needs an API request.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

interface PhotoPage {
    responses?: { data?: {
        displayedPosOrGroup?: string;
        statsTable?: { scorer?: { scorerId?: string; headshotUrl?: string } }[];
        paginatedResultSet?: { totalNumPages: number };
    } }[];
}

async function main() {
    const folder = 'output/record-player-stats';
    await mkdir(folder, { recursive: true });
    const goalieFile = `${folder}/goalie-portraits.json`;
    try { await readFile(goalieFile); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const leagueId = 'gl4i2lrcmfblkbwq';
        const response = await fetch(`https://www.fantrax.com/fxpa/req?leagueId=${leagueId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000),
            body: JSON.stringify({ msgs: [{ method: 'getPlayerStats', data: {
                leagueId, view: 'STATS', statusOrTeamFilter: 'ALL', positionOrGroup: 'POS_201',
                pageNumber: '1', maxResultsPerPage: '10000', miscDisplayType: '1',
            } }] }),
        });
        if (!response.ok) throw new Error(`Fantrax HTTP ${response.status}`);
        const raw = await response.json() as PhotoPage;
        const data = raw.responses?.[0]?.data;
        if (data?.displayedPosOrGroup !== 'POS_201' || data.paginatedResultSet?.totalNumPages !== 1 || !data.statsTable?.length) throw new Error('Incomplete goalie photo snapshot');
        await writeFile(goalieFile, JSON.stringify(raw));
    }

    const portraits: Record<string, string> = {};
    const files = (await readdir(folder)).filter(file => /^\d{4}-\d+\.json$/.test(file)).sort();
    if (!files.length) throw new Error('Run export-record-player-stats.ts first');
    for (const file of [...files, 'goalie-portraits.json']) {
        const raw = JSON.parse(await readFile(`${folder}/${file}`, 'utf8')) as PhotoPage;
        const table = raw.responses?.[0]?.data?.statsTable;
        if (!table?.length) throw new Error(`Missing player rows in ${file}`);
        for (const { scorer } of table) {
            const id = scorer?.scorerId, url = scorer?.headshotUrl;
            // Ignore generic silhouettes and accept only the named player's actual portrait.
            if (id && /^[a-zA-Z0-9]+$/.test(id) && url && new RegExp(`^https://fantraximg\\.com/si/headshots/NHL/hs${id}_\\d+_\\d+\\.png$`).test(url)) portraits[id] = url;
        }
    }
    await writeFile('lib/records/player-portraits.json', `${JSON.stringify(Object.fromEntries(Object.entries(portraits).sort()), null, 2)}\n`);
    console.log(`Saved ${Object.keys(portraits).length} player portrait URLs. Page views need no player API lookup.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
