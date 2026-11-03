import assert from 'node:assert/strict';
import test from 'node:test';
import { findPlayer, type StudioPlayer } from './teams';

const player = (id: string | undefined, name: string, fpts: number): StudioPlayer =>
    ({ ...(id === undefined ? {} : { id }), name, headshot: null, nhlTeam: 'VAN', positions: ['C'], season: 2026, fpts, fpg: 4, games: null });

test('two players with the same name each show their own stats', () => {
    const players = [player('048x9', 'Elias Pettersson', 309.75), player('0ab12', 'Elias Pettersson', 134)];
    assert.equal(findPlayer(players, { name: 'Elias Pettersson', id: '048x9' })?.fpts, 309.75);
    assert.equal(findPlayer(players, { name: 'Elias Pettersson', id: '0ab12' })?.fpts, 134);
    assert.equal(findPlayer(players.slice(0, 1), { name: 'Elias Pettersson', id: '0ab12' }), null, 'never the other namesake');
});

test('a bare name, or a row stored before ids, still resolves by name', () => {
    const legacy = [player(undefined, 'Tom Wilson', 372)];
    assert.equal(findPlayer(legacy, { name: 'tom wilson' })?.fpts, 372);
    assert.equal(findPlayer(legacy, { name: 'Tom Wilson', id: '003vz' })?.fpts, 372);
    assert.equal(findPlayer(legacy, { name: 'Nico Hischier' }), null);
});
