import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { SQL } from 'drizzle-orm';

// The season archive every page lists seasons from (GLOSSARY.md, "Seasons"), read through the real migrations.
test('the season archive lists champion and cancelled seasons, and leaves an incomplete import as the current season', async t => {
    const client = new PGlite();
    const db = drizzle(client);
    const originalUrl = process.env.DATABASE_URL_V2;
    const originalMode = process.env.NODE_ENV;
    // Next installs these globals in a server render; use its real unstable_cache with a local backend.
    const globals = ['AsyncLocalStorage', '__incrementalCache'] as const;
    const descriptors = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    t.after(async () => {
        t.mock.restoreAll();
        await client.close();
        if (originalUrl === undefined) delete process.env.DATABASE_URL_V2; else process.env.DATABASE_URL_V2 = originalUrl;
        if (originalMode === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: originalMode });
        globals.forEach((key, i) => { if (descriptors[i]) Object.defineProperty(globalThis, key, descriptors[i]!); else Reflect.deleteProperty(globalThis, key); });
    });
    process.env.DATABASE_URL_V2 = 'postgresql://test:test@localhost/test';
    Object.assign(process.env, { NODE_ENV: 'test' });
    Object.defineProperty(globalThis, 'AsyncLocalStorage', { value: AsyncLocalStorage, configurable: true });
    const entries = new Map<string, unknown>();
    Object.defineProperty(globalThis, '__incrementalCache', { configurable: true, value: {
        generateSimpleCacheKey: async (key: string) => key,
        get: async (key: string) => entries.get(key) ?? null,
        set: async (key: string, value: unknown) => { entries.set(key, { value }); },
    } });
    const runtime = await import('./db');
    let queries = 0;
    t.mock.method(runtime.getDb(), 'execute', (query: SQL) => { queries++; return db.execute(query); });
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('Tests must not access the network'); });
    await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
    await client.exec(`
        insert into league.seasons values (2020, '2019–20', 'cancelled'), (2026, '2025–26', 'complete'), (2027, '2026–27', 'complete');
        insert into league.franchises (id, display_name, first_season) values (1, 'One', 2020), (2, 'Two', 2020);
        insert into league.team_seasons (id, season_year, franchise_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against)
        values (1, 2026, 1, 'Team One', 'Team One', 'T1', 1, 1, 10, 5, 0, 1000, 500), (2, 2026, 2, 'Team Two', 'Team Two', 'T2', 1, 2, 5, 10, 0, 900, 600);
        insert into league.matchups (season_year, stage, round, bracket, slot, away_team_season_id, home_team_season_id, away_score, home_score, winner_team_season_id)
        values (2026, 'playoff', 1, 'championship', 1, 1, 2, 100, 90, 1);
        refresh materialized view league.season_results;
    `);
    const { getBannerSeasons, getSeasonArchive } = await import('./league');

    const archive = await getSeasonArchive();
    assert.deepEqual(archive.published.map(season => [season.year, season.team]), [[2026, 'Team One'], [2020, null]]);
    assert.equal(archive.latest?.year, 2026);
    assert.equal(archive.current?.year, 2027, 'the 2027 import has no champion yet');
    assert.deepEqual(archive.seasons.map(season => season.year), [2020, 2026, 2027]);

    const before = queries;
    await getBannerSeasons();
    await getSeasonArchive();
    assert.equal(queries, before, 'the archive shares the banner seasons cache entry');
});
