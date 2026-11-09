// What the moved tests can't show about the disposable league: that Next's real cache still finds the
// stand-in backend (the canary for Next upgrades), and that a league leaves the process as it found it.
import assert from 'node:assert/strict';
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
