import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_STATS } from './player-stats';
import snapshot from './player-category-history.json';

test('bundled categories cover all eight seasons with unique, complete player totals', () => {
    assert.deepEqual(snapshot.coverage.map(s => s.year), [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    assert.equal(new Set(snapshot.players.map(p => `${p.id}:${p.year}`)).size, snapshot.players.length);
    for (const season of snapshot.coverage) assert.equal(snapshot.players.filter(p => p.year === season.year).length, season.players);
    assert(snapshot.players.every(p => PLAYER_STATS.every(stat => Number.isInteger(p[stat.id]) && p[stat.id] >= 0)));
    assert.equal(Math.max(...snapshot.players.map(p => p.goals)), 69);
    assert.equal(Math.max(...snapshot.players.map(p => p.assists)), 100);
});
