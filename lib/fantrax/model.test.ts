import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodLabel, periodPhase, publishedMatchups, rosterGroup, selectPeriod, type Period, type SnapshotPlayer } from './model';

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
