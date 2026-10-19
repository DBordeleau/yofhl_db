import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { PgDialect } from 'drizzle-orm/pg-core';
import { finalWeekQuery } from './final-weeks';

test('manual Finals persist independently of archive seasons and are scoped to the league, season and week', async () => {
    const client = new PGlite();
    try {
        await migrate(drizzle(client), { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
        const run = async (year: number, period: number, final: boolean) => {
            const compiled = new PgDialect().sqlToQuery(finalWeekQuery(year, period, final));
            await client.query(compiled.sql, compiled.params);
        };
        await run(2026, 1, true); await run(2026, 1, true); await run(2026, 2, true); await run(2027, 1, true);
        await client.exec("insert into league.fantrax_final_weeks (league_id, season_year, period) values ('another-league', 2026, 1)");
        assert.equal((await client.query('select * from league.fantrax_final_weeks')).rows.length, 4);
        await run(2026, 1, false);
        const remaining = (await client.query<{ league_id: string; season_year: number; period: number }>('select * from league.fantrax_final_weeks')).rows;
        assert.equal(remaining.length, 3);
        assert.ok(remaining.some(row => row.league_id === 'another-league'));
        assert.ok(remaining.some(row => row.season_year === 2027));
        assert.ok(remaining.some(row => row.period === 2));
    } finally { await client.close(); }
});
