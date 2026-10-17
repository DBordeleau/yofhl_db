import assert from 'node:assert/strict';
import test from 'node:test';
import { comparisonHref, parseComparison, teamComparisonHref, teamComparisonState } from './state';
import { comparisonChart, type ComparisonPlayer } from './model';
import { loadComparisonProfiles } from './load';
import { createResultCache } from '../result-cache';
import type { PlayerProfile } from '../data/league';

test('comparison URLs preserve order and metric while bounding and validating selections', () => {
    const state = parseComparison(new URLSearchParams('player=*abc*&player=def&player=abc&metric=fpg'));
    assert.deepEqual(state, { ids: ['abc', 'def'], metric: 'fpg', notice: null });
    assert.deepEqual(parseComparison(new URL(comparisonHref(state), 'https://test.local').searchParams), state);
    const malformed = parseComparison(new URLSearchParams('player=%2Fbad&player=abc&metric=bad'));
    assert.deepEqual(malformed.ids, ['abc']); assert.equal(malformed.metric, 'fpts'); assert(malformed.notice);
    const huge = parseComparison(new URLSearchParams(Array.from({ length: 3000 }, (_, i) => ['player', String(i)])));
    assert.deepEqual(huge.ids, ['0', '1', '2', '3', '4']); assert(huge.notice);
    assert.deepEqual(teamComparisonState(new URLSearchParams('a=4&b=4&stage=invalid'), [4, 5, 7]), { a: 4, b: 5, stage: 'regular' });
    assert.deepEqual(teamComparisonState(new URL(teamComparisonHref(7, 4, 'playoff'), 'https://test.local').searchParams, [4, 5, 7]), { a: 7, b: 4, stage: 'playoff' });
});

test('chart preserves overlap and real later zeroes without inventing pre-career values', () => {
    const players: ComparisonPlayer[] = [
        { id: 'a', name: 'A', playerStats: [{ Year: 2019, FPts: 0, FPG: 0 }, { Year: 2020, FPts: 10, FPG: 2 }, { Year: 2021, FPts: 0, FPG: 0 }, { Year: 2022, FPts: 20, FPG: 3 }] },
        { id: 'b', name: 'B', playerStats: [{ Year: 2019, FPts: 3, FPG: 1 }, { Year: 2020, FPts: 30, FPG: 3 }, { Year: 2021, FPts: 40, FPG: 4 }] },
    ];
    assert.deepEqual(comparisonChart(players, 'fpts').years, [2019, 2020, 2021]);
    assert.deepEqual(comparisonChart(players, 'fpts').series[0].values, [null, 10, 0]);
    assert.deepEqual(comparisonChart(players, 'fpg').series[0].values, [null, 2, 0]);
    assert.deepEqual(comparisonChart([players[0], { id: 'c', name: 'C', playerStats: [] }], 'fpts').years, []);
});

test('profiles load concurrently in selection order, reuse successful loads and retry failures', async () => {
    const pending: ((response: Response) => void)[] = [];
    let calls = 0;
    const request: typeof fetch = async () => { calls++; return new Promise(resolve => pending.push(resolve)); };
    const cache = createResultCache<PlayerProfile>();
    const signal = new AbortController().signal;
    const task = loadComparisonProfiles(['a', 'b', 'c'], signal, cache, request);
    assert.equal(calls, 3, 'all requests begin before any request resolves');
    pending[2](new Response(null, { status: 503 }));
    pending[1](new Response(null, { status: 404 }));
    pending[0](Response.json({ id: 'a', name: 'A', playerStats: [] }));
    assert.deepEqual((await task).map(row => [row.id, row.status]), [['a', 'ready'], ['b', 'missing'], ['c', 'error']]);
    const retry = loadComparisonProfiles(['a', 'c'], signal, cache, request);
    assert.equal(calls, 4, 'only the failed profile is fetched again');
    pending[3](Response.json({ id: 'c', name: 'C', playerStats: [] }));
    assert((await retry).every(row => row.status === 'ready'));
});

test('aborted profile loads do not cache late responses', async () => {
    const controller = new AbortController();
    const cache = createResultCache<PlayerProfile>();
    const task = loadComparisonProfiles(['a'], controller.signal, cache, async () => {
        controller.abort(); return Response.json({ id: 'a', name: 'A', playerStats: [] });
    });
    await assert.rejects(task, { name: 'AbortError' });
    assert.equal(cache.get('/api/players/a'), undefined);
});
