// What the moved tests can't show about the disposable league: that Next's real cache still finds the
// stand-in backend (the canary for Next upgrades), that a league leaves the process as it found it, and that
// no other test builds its own database or cache stand-in.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { disposableLeague } from './disposable-league';

const SEED = "insert into league.seasons values (2026, '2025–26', 'complete');";

test("Next's real unstable_cache serves a cached() loader's second read and rereads once its tag expires", async t => {
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: SEED });
    const { sql } = await import('drizzle-orm');
    const { cached, rows } = await import('../data/db');
    const seasons = cached(async () => rows<{ year: number }>(sql`select year from league.seasons`), 'disposable-league-canary', ['canary']);

    assert.deepEqual(await seasons(), [{ year: 2026 }]);
    const afterFirstRead = league.queries();
    assert.equal(afterFirstRead, 1);
    assert.deepEqual(await seasons(), [{ year: 2026 }]);
    assert.equal(league.queries(), afterFirstRead, 'the second read is served from the cache');
    league.expire('canary');
    assert.deepEqual(await seasons(), [{ year: 2026 }]);
    assert.equal(league.queries(), afterFirstRead + 1, 'an expired tag makes the next read query again');
});

test('a league puts back the env, the two globals and fetch once its test ends', async t => {
    const url = Object.getOwnPropertyDescriptor(process.env, 'DATABASE_URL_V2');
    const mode = process.env.NODE_ENV;
    t.after(() => {
        if (url) process.env.DATABASE_URL_V2 = url.value; else delete process.env.DATABASE_URL_V2;
        if (mode === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: mode });
    });
    // One variable unset and one set, so both ways of putting a variable back are seen.
    delete process.env.DATABASE_URL_V2;
    Object.assign(process.env, { NODE_ENV: 'before-the-league' });
    const globals = ['AsyncLocalStorage', '__incrementalCache'] as const;
    const before = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    const fetchBefore = globalThis.fetch;

    await t.test('a league standing in for the app database and Next cache', async t => {
        await disposableLeague(t, { app: true, nextCache: true });
        assert.ok(process.env.DATABASE_URL_V2);
        assert.equal(process.env.NODE_ENV, 'test');
        for (const key of globals) assert.ok(Object.getOwnPropertyDescriptor(globalThis, key), key);
        await assert.rejects(fetch('https://example.com'), /Tests must not access the network/);
    });

    assert.equal('DATABASE_URL_V2' in process.env, false);
    assert.equal(process.env.NODE_ENV, 'before-the-league');
    globals.forEach((key, i) => assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, key), before[i], key));
    assert.equal(globalThis.fetch, fetchBefore);
});

// What only this module may do: build a PGlite, stand in for Next's cache backend, or replace the app's execute.
// scripts/db/lib/connect.ts builds a PGlite too, but it is the production path for pglite: URLs, not a test.
const OWN_SETUP = [/new PGlite\b/, /PGlite\.create\(/, /__incrementalCache/, /mock\.method\([^;]*?,\s*['"`]execute['"`]/];
const strays = (code: string) => OWN_SETUP.filter(pattern => pattern.test(code)).map(String);
const EXEMPT = ['lib/testing/disposable-league.ts', 'lib/testing/disposable-league.test.ts'];

test('no test outside the disposable league builds its own database, cache stand-in or execute mock', () => {
    const files = ['lib', 'scripts']
        .flatMap(dir => readdirSync(dir, { recursive: true, encoding: 'utf8' }).map(file => `${dir}/${file.replaceAll('\\', '/')}`))
        .filter(file => /\.test\.(ts|mjs)$/.test(file))
        .filter(file => !EXEMPT.includes(file));
    assert.ok(files.length > 50, "the scan finds the repo's test files");
    assert.deepEqual(files.flatMap(file => strays(readFileSync(file, 'utf8')).map(pattern => `${file}: ${pattern}`)), []);

    // Each kind is caught when a test brings it back.
    assert.equal(strays('const client = new PGlite();').length, 1);
    assert.equal(strays('const client = await PGlite.create();').length, 1);
    assert.equal(strays('Object.assign(globalThis, { __incrementalCache: backend });').length, 1);
    assert.equal(strays("t.mock.method(runtime.getDb(), 'execute', (query: SQL) => db.execute(query));").length, 1);
    assert.equal(strays("const neon = runtime.getDb();\nt.mock.method(neon, 'execute', (query: SQL) => db.execute(query));").length, 1);
    assert.equal(strays('mock.method(connection, "execute", run);').length, 1);
});
