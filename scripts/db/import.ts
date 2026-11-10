import { sql } from 'drizzle-orm';
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
        const rows = Object.fromEntries(result.seasons.map((s) => [s.year, s.players])) as Record<number, number>;
        console.log(`Importing ${result.seasons.map((s) => seasonLabel(s.year)).join(', ')} into ${label}`);

        const summary = await db.execute<{
            season_year: number; label: string; playoff_status: string; teams: number; games: number; champion: string | null; ring: number; awards: number;
        }>(sql`
            select s.year as season_year, s.label, s.playoff_status,
                   (select count(*)::int from league.team_seasons t where t.season_year = s.year) as teams,
                   (select count(*)::int from league.matchups m where m.season_year = s.year) as games,
                   (select t.name from league.team_seasons t where t.id = r.champion_team_season_id) as champion,
                   (select count(*)::int from league.championship_rosters c where c.season_year = s.year) as ring,
                   (select count(*)::int from league.awards a where a.season_year = s.year) as awards
            from league.seasons s left join league.season_results r on r.season_year = s.year
            order by s.year`);
        const summaryRows = (Array.isArray(summary) ? summary : (summary as unknown as { rows: typeof summary }).rows) as unknown as {
            season_year: number; label: string; playoff_status: string; teams: number; games: number; champion: string | null; ring: number; awards: number;
        }[];

        console.log('\nseason   teams  players  playoff games  champion                  ring  awards');
        for (const r of summaryRows) {
            const champion = r.playoff_status === 'cancelled' ? '(playoffs cancelled)' : r.champion ?? '—';
            console.log(
                `${r.label.padEnd(8)} ${String(r.teams).padStart(5)}  ${String(rows[r.season_year] ?? '').padStart(7)}  ${String(r.games).padStart(13)}  ${champion.padEnd(24)}  ${String(r.ring).padStart(4)}  ${String(r.awards).padStart(6)}`,
            );
        }
        const needsRing = summaryRows.filter((r) => r.playoff_status === 'complete' && r.ring === 0).map((r) => r.label);
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
