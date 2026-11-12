import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekLabel, rosterGroup, sortRosterPlayers } from './live-season-display';
import type { LivePlayer, RosterStats } from './fantrax/live-season';

const weeks = [
    { number: 1, startDate: '2026-10-12T17:00:00.000Z', endDate: '2026-10-17T00:59:59.000Z' },
    { number: 2, startDate: '2026-10-17T01:00:00.000Z', endDate: '2026-10-19T22:59:59.000Z' },
];

test('displays the league calendar in Eastern Time even when the UTC day differs', () => {
    assert.equal(weekLabel(weeks[0]), 'Oct 12 – Oct 16');
    assert.equal(weekLabel(weeks[1]), 'Oct 16 – Oct 19');
});

test('groups active, bench, and IR players by assigned position without duplicating multi-position players', () => {
    const player: LivePlayer = { id: '1', name: 'Player', position: 'C,LW', lineupPosition: 'LW', nhlTeam: 'TOR', status: 'ACTIVE', inArchive: false };
    assert.equal(rosterGroup(player), 'LW');
    assert.equal(rosterGroup({ ...player, status: 'RESERVE' }), 'LW');
    assert.equal(rosterGroup({ ...player, status: 'INJURED_RESERVE' }), 'LW');
    assert.equal(rosterGroup({ ...player, status: 'MINORS' }), 'MINORS');
    assert.equal(rosterGroup({ ...player, lineupPosition: 'FLEX' }), 'OTHER');
    assert.equal(rosterGroup({ ...player, status: 'UNKNOWN' }), 'OTHER');
});

test('orders each roster group by descending points, with alphabetical ties and missing stats last', () => {
    const players: LivePlayer[] = [
        ['missing', 'Aaron Missing', 'D'], ['negative', 'Ben Negative', 'D'], ['zero', 'Charlie Zero', 'D'],
        ['tie-z', 'Zach Tie', 'D'], ['leader', 'Evan Leader', 'D'], ['tie-a', 'Adam Tie', 'D'],
        ['null', 'Alex Missing', 'D'], ['wing', 'Will Wing', 'LW'], ['minor', 'Mike Minor', 'MINORS'],
    ].map(([id, name, position]) => ({ id, name, position, lineupPosition: position, nhlTeam: 'TOR', status: position === 'MINORS' ? 'MINORS' : 'ACTIVE', inArchive: false }));
    const original = [...players];
    const stats: RosterStats = { fetchedAt: '2026-10-14T00:00:00Z', players: Object.fromEntries([
        ['negative', -2], ['zero', 0], ['tie-z', 10], ['leader', 20], ['tie-a', 10], ['null', null], ['wing', 30], ['minor', 40],
    ].map(([id, points]) => [id, { points, perGame: null }])) };
    const sorted = sortRosterPlayers(players, stats);
    assert.deepEqual(sorted.filter(player => rosterGroup(player) === 'D').map(player => player.id),
        ['leader', 'tie-a', 'tie-z', 'zero', 'negative', 'missing', 'null']);
    assert.deepEqual(sorted.filter(player => rosterGroup(player) === 'LW').map(player => player.id), ['wing']);
    assert.deepEqual(sorted.filter(player => rosterGroup(player) === 'MINORS').map(player => player.id), ['minor']);
    assert.deepEqual(players, original);
    assert.deepEqual(sortRosterPlayers(players, null).map(player => player.name), players.map(player => player.name).sort((a, b) => a.localeCompare(b)));
    assert.deepEqual(sortRosterPlayers([], stats), []);
});
