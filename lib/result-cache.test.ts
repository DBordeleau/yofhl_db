import assert from 'node:assert/strict';
import test from 'node:test';
import { createResultCache } from './result-cache';
import { publicJson } from './public-json';
import { playerHref, playerSlug } from './player-url';

test('revisiting filters reuses results until their original freshness deadline', async t => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    const fetch = t.mock.method(globalThis, 'fetch', async (url: string) => Response.json({ url }, { headers: { Age: '20' } }));
    const cache = createResultCache<{ url: string }>();
    const signal = new AbortController().signal;
    cache.set('/initial', { url: '/initial' });
    await cache.load('/initial', signal);
    await cache.load('/goalies', signal);
    await cache.load('/initial', signal);
    await cache.load('/goalies', signal);
    assert.equal(fetch.mock.callCount(), 1);
    now += 40000;
    await cache.load('/goalies', signal);
    assert.equal(fetch.mock.callCount(), 2, 'CDN Age shortens browser reuse');
    now += 20000;
    await cache.load('/initial', signal);
    assert.equal(fetch.mock.callCount(), 3, 'initial SSR results also expire');
});

test('cache stays bounded and evicts the least recently used result', () => {
    const cache = createResultCache<number>();
    for (let i = 0; i < 32; i++) cache.set(String(i), i);
    assert.equal(cache.get('0'), 0);
    cache.set('32', 32);
    assert.equal(cache.get('1'), undefined);
    assert.equal(cache.get('0'), 0);
});

test('failed and aborted responses never populate the result cache', async t => {
    const cache = createResultCache<unknown>();
    let controller = new AbortController();
    t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
    await assert.rejects(cache.load('/failure', controller.signal));
    assert.equal(cache.get('/failure'), undefined);
    t.mock.method(globalThis, 'fetch', async () => { controller.abort(); return Response.json({ ok: true }); });
    await assert.rejects(cache.load('/aborted', controller.signal));
    assert.equal(cache.get('/aborted'), undefined);
    controller = new AbortController();
    t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }));
    assert.deepEqual(await cache.load('/failure', controller.signal), { ok: true });
});

test('public JSON caches only at the CDN, for a bounded minute', async () => {
    const response = publicJson({ value: 7 });
    assert.equal(response.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    assert.equal(response.headers.get('vercel-cdn-cache-control'), 'public, s-maxage=60');
    assert.equal(response.headers.get('cdn-cache-control'), 'public, s-maxage=60');
    assert.deepEqual(await response.json(), { value: 7 });
});

test('player links remove Fantrax wrappers and retain ordinary IDs', () => {
    assert.equal(playerHref('*02b81*'), '/player/02b81');
    assert.equal(playerSlug('*02b81*'), '02b81');
    assert.equal(playerHref('1234'), '/player/1234');
    assert.equal(playerHref('name with space'), '/player/name%20with%20space');
});
