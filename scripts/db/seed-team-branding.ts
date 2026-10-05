import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { connect } from './lib/connect';
import { parseTeamColours } from '../../lib/team-branding';

// One-time launch seed from the approved browser export. Never overwrite owner edits.
async function main() {
    const input: Record<string, unknown> = JSON.parse(await readFile('league/seed/team-branding.json', 'utf8'));
    const palettes = Object.entries(input).map(([key, value]) => {
        const id = Number(key);
        const branding = parseTeamColours(value, id);
        if (!/^[1-9]\d*$/.test(key) || !Number.isSafeInteger(id) || !branding) throw new Error(`Invalid branding for franchise ${key}.`);
        return { id, branding };
    });
    const connection = await connect();
    try {
        const saved = await connection.db.transaction(async tx => {
            let count = 0;
            for (const { id, branding } of palettes) {
                const existing = await tx.execute(sql`select id from league.franchises where id = ${id} and folded_after_season is null`) as { rows?: unknown[]; length?: number };
                if (!(existing.rows?.length ?? existing.length)) throw new Error(`Active franchise ${id} not found.`);
                const result = await tx.execute(sql`
                    insert into league.team_management as m (franchise_id, branding) values (${id}, ${JSON.stringify(branding)}::jsonb)
                    on conflict (franchise_id) do update set branding = excluded.branding, version = m.version + 1
                    where m.branding is null returning franchise_id
                `) as { rows?: unknown[]; length?: number };
                count += result.rows?.length ?? result.length ?? 0;
            }
            return count;
        });
        console.log(`Saved ${saved} launch palettes to ${connection.label}; ${palettes.length - saved} existing palettes preserved.`);
    } finally { await connection.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Branding seed failed.'); process.exitCode = 1; });
