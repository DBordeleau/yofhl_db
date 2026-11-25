// The in-memory NHL callers test against: the same identity rules as the NHL module, over the players it holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryNhl, memoryNhlState, nhlPlayer, nhlSeason } from './memory-nhl';

test('the in-memory NHL identifies held players by verified identity, else by the one match rule', async () => {
    const state = memoryNhlState({
        players: {
            8475158: nhlPlayer({ nhlId: 8475158, name: "Ryan O'Reilly", position: 'C', team: 'NSH' }),
            8481026: nhlPlayer({ nhlId: 8481026, name: "Ryan O'Reilly", position: 'R', team: null }),
            8482116: nhlPlayer({ nhlId: 8482116, name: 'Tim Stützle', position: 'C', team: 'OTT' }),
        },
        verified: { '04qz4': 8481026 },
    });
    const nhl = createMemoryNhl(state);
    assert.equal(await nhl.identify({ name: "Ryan O'Reilly", playerId: '04qz4', positions: ['C'], nhlTeam: 'NSH' }), 8481026);
    assert.equal(await nhl.identify({ name: 'Ryan OReilly', positions: ['C'], nhlTeam: 'NSH' }), 8475158);
    assert.equal(await nhl.identify({ name: "Ryan O'Reilly", positions: ['C'] }), null);
    assert.equal(await nhl.identify({ name: 'Tim Stutzle' }), 8482116);
    assert.equal(await nhl.identify({ name: 'Nobody' }), null);
    assert.deepEqual(state.identified.map(player => player.name), ["Ryan O'Reilly", 'Ryan OReilly', "Ryan O'Reilly", 'Tim Stutzle', 'Nobody']);
});

test('the in-memory NHL reads held players as copies, and fails as told', async () => {
    const line = nhlSeason({ games: 12, goals: 3 });
    const state = memoryNhlState({ players: { 8482116: nhlPlayer({ nhlId: 8482116, name: 'Tim Stützle', seasons: { 2026: line } }) } });
    const nhl = createMemoryNhl(state);
    const player = await nhl.player(8482116);
    assert.deepEqual(player.seasons, { 2026: { games: 12, goals: 3, assists: null, points: null, wins: null, goalsAgainstAverage: null, savePercentage: null } });
    player.seasons![2026].games = 0;
    assert.equal((await nhl.player(8482116)).seasons![2026].games, 12);
    // an identity it doesn't hold is the NHL's not-found
    await assert.rejects(nhl.player(8400000), /404/);

    // failing for one Player ID, name or NHL identity
    state.failing.add('0abcd').add('Tim Stutzle').add(8482116);
    await assert.rejects(nhl.identify({ name: 'Someone', playerId: '0abcd' }), /503/);
    await assert.rejects(nhl.identify({ name: 'Tim Stutzle' }), /503/);
    await assert.rejects(nhl.player(8482116), /503/);
    state.failing.clear();
    // or down altogether
    state.down = true;
    await assert.rejects(nhl.identify({ name: 'Tim Stützle' }), /503/);
    await assert.rejects(nhl.player(8482116), /503/);
    assert.deepEqual(state.read, [8482116, 8482116, 8400000, 8482116, 8482116]);
});
