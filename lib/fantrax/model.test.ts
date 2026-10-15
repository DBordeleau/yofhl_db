import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodLabel, periodPhase, publishedMatchups, rosterGroup, selectPeriod, sortRosterPlayers, weekName, type Period, type RosterStats, type SnapshotPlayer } from './model';

const periods: Period[] = [
    { number: 1, startDate: '2026-10-12T17:00:00.000Z', endDate: '2026-10-17T00:59:59.000Z' },
    { number: 2, startDate: '2026-10-17T01:00:00.000Z', endDate: '2026-10-19T22:59:59.000Z' },
];

test('chooses the opening matchup before the season and the last matchup after the season', () => {
    assert.equal(selectPeriod(periods, undefined, Date.parse('2026-10-04'))?.number, 1);
    assert.equal(selectPeriod(periods, undefined, Date.parse('2027-05-01'))?.number, 2);
    assert.equal(selectPeriod([], undefined, Date.now()), null);
});

test('switches rounds at the supplied Fantrax time, not at midnight or the start of a week', () => {
    const boundary = Date.parse('2026-10-17T01:00:00.000Z');
    assert.equal(selectPeriod(periods, undefined, boundary - 1000)?.number, 1);
    assert.equal(selectPeriod(periods, undefined, boundary)?.number, 2);
    assert.equal(periodPhase(periods[0], boundary - 1000), 'active');
    assert.equal(periodPhase(periods[0], boundary), 'complete');
    assert.equal(periodPhase(periods[1], boundary - 1000), 'upcoming');
    assert.equal(periodPhase(periods[1], boundary), 'active');
});

test('allows schedule browsing and rejects arbitrary or nonexistent period query values', () => {
    const now = Date.parse('2026-10-04');
    assert.equal(selectPeriod(periods, '2', now)?.number, 2);
    for (const request of ['9999', '-1', '2.5', '2abc', '0', '']) {
        assert.equal(selectPeriod(periods, request, now)?.number, 1);
    }
});

test('displays the league calendar in Eastern Time even when the UTC day differs', () => {
    assert.equal(periodLabel(periods[0]), 'Oct 12 – Oct 16');
    assert.equal(periodLabel(periods[1]), 'Oct 16 – Oct 19');
});

test('does not present unassigned Fantrax playoff slots as games or team byes', () => {
    const placeholders = Array.from({ length: 6 }, () => ({ away: { TBD: true }, home: { TBD: true } }));
    assert.deepEqual(publishedMatchups(placeholders), []);
    const partial = { away: { id: 'team-a', name: 'Team A' }, home: { TBD: true } };
    assert.deepEqual(publishedMatchups([...placeholders, partial]), [partial]);
});

test('groups active, bench, and IR players by assigned position without duplicating multi-position players', () => {
    const player: SnapshotPlayer = { id: '1', name: 'Player', position: 'C,LW', lineupPosition: 'LW', nhlTeam: 'TOR', status: 'ACTIVE', archiveId: null };
    assert.equal(rosterGroup(player), 'LW');
    assert.equal(rosterGroup({ ...player, status: 'RESERVE' }), 'LW');
    assert.equal(rosterGroup({ ...player, status: 'INJURED_RESERVE' }), 'LW');
    assert.equal(rosterGroup({ ...player, status: 'MINORS' }), 'MINORS');
    assert.equal(rosterGroup({ ...player, lineupPosition: 'FLEX' }), 'OTHER');
    assert.equal(rosterGroup({ ...player, status: 'UNKNOWN' }), 'OTHER');
});

test('names regular-season weeks and the last three weeks of the season as the Jagr Cup playoffs', () => {
    const season = Array.from({ length: 26 }, (_, index) => index + 1);
    assert.deepEqual(weekName(1, season), { short: 'Week 1', full: 'Week 1', playoff: false });
    assert.equal(weekName(23, season).full, 'Week 23');
    assert.equal(weekName(24, season).full, 'Jagr Cup Playoff Quarterfinals');
    assert.equal(weekName(25, season).full, 'Jagr Cup Playoff Semifinals');
    assert.deepEqual(weekName(26, season), { short: 'Grand Finals', full: 'Jagr Cup Playoff Grand Finals', playoff: true });
});

test('orders each roster group by descending points, with alphabetical ties and missing stats last', () => {
    const players: SnapshotPlayer[] = [
        ['missing', 'Aaron Missing', 'D'], ['negative', 'Ben Negative', 'D'], ['zero', 'Charlie Zero', 'D'],
        ['tie-z', 'Zach Tie', 'D'], ['leader', 'Evan Leader', 'D'], ['tie-a', 'Adam Tie', 'D'],
        ['null', 'Alex Missing', 'D'], ['wing', 'Will Wing', 'LW'], ['minor', 'Mike Minor', 'MINORS'],
    ].map(([id, name, position]) => ({ id, name, position, lineupPosition: position, nhlTeam: 'TOR', status: position === 'MINORS' ? 'MINORS' : 'ACTIVE', archiveId: null }));
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
