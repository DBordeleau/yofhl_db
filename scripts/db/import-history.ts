import { prepareHistory, writeHistory } from './lib/history';
import { loadLeagueConfig } from './lib/league-config';
import { connect } from './lib/connect';

async function main() {
    const prepared = prepareHistory(process.env.YOFHL_DATA_DIR ?? 'data', loadLeagueConfig());
    console.log(`${prepared.events.length} transactions, ${prepared.assets.length} assets, ${prepared.picks.length} draft slots; ${prepared.players.length} identified players.`);
    console.log(`${prepared.skippedLineups} lineup-only rows excluded. Draft seasons: ${prepared.draftYears.join(', ')}.`);
    if (process.argv.includes('--dry-run')) return;
    const connection = await connect();
    try {
        await connection.migrate();
        await writeHistory(connection.db, prepared);
        console.log('History imported atomically. Existing standings, awards, rosters and lotteries were preserved.');
        const site = process.env.SITE_URL;
        const secret = process.env.REVALIDATE_SECRET;
        if (site && secret) {
            const res = await fetch(new URL('/api/revalidate', site), { method: 'POST', headers: { authorization: `Bearer ${secret}` } });
            if (!res.ok) throw new Error(`History imported, but cache revalidation failed (${res.status}).`);
            console.log('Site cache cleared.');
        }
    } finally {
        await connection.close();
    }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
