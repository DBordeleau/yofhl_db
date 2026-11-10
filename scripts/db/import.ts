import { seasonLabel } from '@/lib/seasons';
import { connect } from './lib/connect';
import { loadLeagueConfig } from './lib/league-config';
import { importSeasons, readLegacySeeds } from './lib/season-import';

// Loads Fantrax CSVs from data/ into the database.
//
//   npm run db:import            every season found in data/
//   npm run db:import -- 2026    just the 2025–26 season (also accepts 2025-2026 or 2025-26)
//
// The rules live in the season import module (scripts/db/lib/season-import.ts). This script parses
// the arguments, applies migrations, runs the import, prints its summary and clears the site cache.

const DATA_DIR = process.env.YOFHL_DATA_DIR ?? 'data';
const LEGACY_AWARDS = 'league/seed/legacy-awards.json';
const LEGACY_ROSTERS = 'league/seed/legacy-championship-rosters.json';

const parseSeasonArg = (arg: string) => {
    const m = arg.match(/^(?:\d{4}-)?(\d{2}|\d{4})$/);
    if (!m) throw new Error(`Don't understand season "${arg}". Use the end year, e.g. 2026 or 2025-26.`);
    return m[1].length === 2 ? 2000 + parseInt(m[1], 10) : parseInt(m[1], 10);
};

const main = async () => {
    const config = loadLeagueConfig();
    const seasons = process.argv.slice(2).map(parseSeasonArg);
    const legacy = readLegacySeeds(LEGACY_AWARDS, LEGACY_ROSTERS);

    const { db, label, migrate, close } = await connect();
    try {
        // schema first, so the admin panel's bracket corrections can be read and validated with the CSVs
        await migrate();
        const result = await importSeasons({ db, config, dataDir: DATA_DIR, seasons, legacy });
        if (!result.ok) {
            console.error(`Import stopped, nothing was written. Fix these and run it again:\n\n${result.errors.map((e) => `  • ${e}`).join('\n')}\n`);
            process.exitCode = 1;
            return;
        }
        const notes = result.legacyNotes;
        console.log(`Importing ${result.seasons.map((s) => seasonLabel(s.year)).join(', ')} into ${label}`);

        // oldest first, as the summary has always printed
        const statuses = [...result.statuses].sort((a, b) => a.year - b.year);
        console.log('\nseason   teams  players  playoff games  champion                  ring  awards');
        for (const s of statuses) {
            const champion = s.playoffStatus === 'cancelled' ? '(playoffs cancelled)' : s.champion ?? '—';
            console.log(
                `${s.label.padEnd(8)} ${String(s.teams).padStart(5)}  ${String(s.players).padStart(7)}  ${String(s.games).padStart(13)}  ${champion.padEnd(24)}  ${String(s.roster).padStart(4)}  ${String(s.awards).padStart(6)}`,
            );
        }
        const needsRing = statuses.filter((s) => s.playoffStatus === 'complete' && s.roster === 0).map((s) => s.label);
        if (needsRing.length) console.log(`\nNo championship roster yet for ${needsRing.join(', ')}: set it in the admin panel.`);
        if (notes.length) console.log(`\nLegacy award notes:\n${notes.map((n) => `  • ${n}`).join('\n')}`);

        // tell the site to drop its cached pages so the new data shows up
        const site = process.env.SITE_URL;
        const secret = process.env.REVALIDATE_SECRET;
        if (site && secret) {
            const res = await fetch(new URL('/api/revalidate', site), { method: 'POST', headers: { authorization: `Bearer ${secret}` } });
            console.log(res.ok ? `\nCleared the site cache at ${site}.` : `\nCouldn't clear the site cache at ${site} (${res.status}). Redeploy or POST /api/revalidate to show the new data.`);
        } else {
            console.log("\nSet SITE_URL and REVALIDATE_SECRET to clear the live site's cache automatically after an import.");
        }
    } finally {
        await close();
    }
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
