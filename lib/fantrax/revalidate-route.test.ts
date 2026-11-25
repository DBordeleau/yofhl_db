// The revalidate endpoint's Fantrax capture (`?external=1`): it always captures, and follows the change rule like
// every refresh. What a capture saves is covered in refresh.test.ts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { LEAGUE_TAG } from '../data/cache-tags';
import { disposableLeague } from '../testing/disposable-league';
import { FANTRAX_CURRENT_TAG, FANTRAX_TAG } from './cache-policy';
import { fakeFantrax, SEED } from './testing/fake-fantrax';

test('a revalidate with external=1 that finds nothing new on Fantrax reports it, publishes nothing and still expires every Fantrax cache', async t => {
    let network = 0;
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: SEED, fetch: fakeFantrax(() => true, () => network++) });
    t.mock.method(Date, 'now', () => Date.parse('2026-10-18T22:00:00Z'));
    t.mock.method(console, 'warn', () => {});
    const original = process.env.REVALIDATE_SECRET;
    t.after(() => { if (original === undefined) delete process.env.REVALIDATE_SECRET; else process.env.REVALIDATE_SECRET = original; });
    process.env.REVALIDATE_SECRET = 'test-secret';
    // Modules that touch Next load after the league stands in for it.
    const { POST } = await import('@/app/api/revalidate/route');
    const revalidate = async () => {
        const { result, revalidatedTags } = await league.runAsRoute('/api/revalidate', () => POST(new Request(
            'https://example.com/api/revalidate?external=1', { method: 'POST', headers: { authorization: 'Bearer test-secret' } })));
        return { status: result.status, body: await result.json(), revalidatedTags: [...revalidatedTags].sort() };
    };

    const published = await revalidate();
    assert.deepEqual(published, { status: 200, body: { revalidated: true, fantrax: 'published' }, revalidatedTags: [FANTRAX_CURRENT_TAG, FANTRAX_TAG, LEAGUE_TAG].sort() });
    const requests = network;
    const unchanged = await revalidate();
    assert.ok(network > requests, 'it captures again');
    // Archived final scores and the player directory carry only FANTRAX_TAG, so historical corrections appear even
    // when the live capture is unchanged; the live season's own tag (and the frozen-season check) is left alone.
    assert.deepEqual(unchanged, { status: 200, body: { revalidated: true, fantrax: 'unchanged' }, revalidatedTags: [FANTRAX_TAG, LEAGUE_TAG].sort() });
});

test('POST /api/revalidate?external=1 invalidates LEAGUE_TAG before refreshing Fantrax, and still invalidates it if Fantrax fails', async t => {
    let down = false;
    const baseFetch = fakeFantrax(() => false);
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: SEED, fetch: async (input, options) => {
        if (down) return new Response('Fantrax down', { status: 503 });
        return baseFetch(input, options);
    } });
    t.mock.method(Date, 'now', () => Date.parse('2026-10-18T22:00:00Z'));
    t.mock.method(console, 'error', () => {});
    const previousSecret = process.env.REVALIDATE_SECRET;
    process.env.REVALIDATE_SECRET = 'test-revalidate-secret';
    t.after(() => {
        if (previousSecret === undefined) delete process.env.REVALIDATE_SECRET;
        else process.env.REVALIDATE_SECRET = previousSecret;
    });

    const { POST } = await import('@/app/api/revalidate/route');
    const request = () => new Request('http://localhost/api/revalidate?external=1', {
        method: 'POST', headers: { authorization: 'Bearer test-revalidate-secret' },
    });

    const okRun = await league.runAsRoute('/api/revalidate', () => POST(request()));
    assert.equal(okRun.result.status, 200);
    assert.deepEqual(await okRun.result.json(), { revalidated: true, fantrax: 'published' });
    assert.deepEqual([...okRun.revalidatedTags].sort(), [FANTRAX_CURRENT_TAG, FANTRAX_TAG, LEAGUE_TAG].sort());

    down = true;
    const failedRun = await league.runAsRoute('/api/revalidate', () => POST(request()));
    assert.equal(failedRun.result.status, 503);
    assert.deepEqual([...failedRun.revalidatedTags], [LEAGUE_TAG]);
});
