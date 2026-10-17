import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { historicalCache } from './history-cache';

const parse = (value: unknown) => {
    if (!Array.isArray(value) || !value.length || !value.every(Number.isFinite)) throw new Error('Invalid history');
    return value as number[];
};

test('historical collections persist across cache calls, separate seasons, and explicitly refresh', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yofhl-history-'));
    let calls = 0;
    const load = async () => [++calls];
    assert.deepEqual(await historicalCache(directory, 'skaters-2025', load, parse), [1]);
    assert.deepEqual(await historicalCache(directory, 'skaters-2025', load, parse), [1]);
    assert.deepEqual(await historicalCache(directory, 'skaters-2024', load, parse), [2]);
    assert.deepEqual(await historicalCache(directory, 'goalies-2025', load, parse), [3]);
    assert.deepEqual(await historicalCache(directory, 'skaters-2025', load, parse, true), [4]);
    assert.deepEqual(await historicalCache(directory, 'skaters-2025', load, parse), [4]);
    assert.equal(calls, 4);
});

test('failed refresh preserves the prior cache; corrupt and invalid data are never reused', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yofhl-history-'));
    await historicalCache(directory, 'nhl-through-2024', async () => [1], parse);
    const file = join(directory, (await readdir(directory))[0]);
    const original = await readFile(file, 'utf8');
    await assert.rejects(historicalCache(directory, 'nhl-through-2024', async () => { throw new Error('offline'); }, parse, true), /offline/);
    await assert.rejects(historicalCache(directory, 'nhl-through-2024', async () => [], parse, true), /Invalid history/);
    assert.equal(await readFile(file, 'utf8'), original);
    await writeFile(file, '{partial');
    assert.deepEqual(await historicalCache(directory, 'nhl-through-2024', async () => [2], parse), [2]);
    await writeFile(file, JSON.stringify({ version: 1, key: 'nhl-through-2024', value: [] }));
    assert.deepEqual(await historicalCache(directory, 'nhl-through-2024', async () => [3], parse), [3]);
    assert.equal((await readdir(directory)).length, 1, 'atomic writes leave no temporary files');
});
