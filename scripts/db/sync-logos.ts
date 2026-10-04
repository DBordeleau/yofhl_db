import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { connect } from './lib/connect';
import { loadLeagueConfig } from './lib/league-config';

async function main() {
    const config = loadLeagueConfig();
    for (const franchise of config.franchises) {
        for (const era of franchise.eras) {
            if (era.logo && !existsSync(join('public', era.logo))) throw new Error(`Missing logo: ${era.logo}`);
        }
    }
    const connection = await connect();
    try {
        await connection.db.transaction(async (tx) => {
            for (const franchise of config.franchises) {
                const latest = [...franchise.eras].sort((a, b) => b.from - a.from)[0];
                await tx.execute(sql`update league.franchises set logo_url = ${latest.logo ?? null}
                    where id = ${franchise.id} and logo_url is distinct from ${latest.logo ?? null}`);
                for (const era of franchise.eras) {
                    await tx.execute(sql`update league.team_seasons set logo_url = ${era.logo ?? null}
                        where franchise_id = ${franchise.id} and season_year >= ${era.from}
                          and (${era.to ?? null}::int is null or season_year <= ${era.to ?? null})
                          and logo_url is distinct from ${era.logo ?? null}`);
                }
            }
        });
        console.log('Franchise and historical team logos synced from league/league.yml.');
        if (process.env.SITE_URL && process.env.REVALIDATE_SECRET) {
            const response = await fetch(new URL('/api/revalidate', process.env.SITE_URL), {
                method: 'POST', headers: { authorization: `Bearer ${process.env.REVALIDATE_SECRET}` },
            });
            if (!response.ok) throw new Error(`Logos synced, but cache revalidation failed (${response.status}).`);
            console.log('Site cache cleared.');
        }
    } finally {
        await connection.close();
    }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
