import { test } from 'node:test';
import assert from 'node:assert/strict';
import { automaticFinalPeriods, periodLabel, publishedMatchups, rosterGroup, sortRosterPlayers, type Period, type RosterStats, type ScheduledMatchup, type SnapshotPlayer } from './model';

const periods: Period[] = [
    { number: 1, startDate: '2026-10-12T17:00:00.000Z', endDate: '2026-10-17T00:59:59.000Z' },
    { number: 2, startDate: '2026-10-17T01:00:00.000Z', endDate: '2026-10-19T22:59:59.000Z' },
];

const finalFixture = () => ({
    scoringPeriods: periods, lastRegularSeasonPeriod: 2,
    teams: [{ id: 'a', record: '1-0-0' }, { id: 'b', record: '0-1-0' }],
    schedule: periods.map(period => ({ period: period.number, matchupList: [{ away: { id: 'a' }, home: { id: 'b' } }] as ScheduledMatchup[] })),
});

test('posted results finalize a week before its end date', () => {
    assert.deepEqual(automaticFinalPeriods(finalFixture(), Date.parse('2026-10-16T20:00:00Z')), [1]);
});

test('requires every scheduled result, handles ties, and counts actual matches rather than the week number', () => {
    const now = Date.parse('2026-10-18T00:00:00Z');
    const fixture = finalFixture();
    assert.deepEqual(automaticFinalPeriods(fixture, now), [1]);
    fixture.teams[0].record = '1-0-1'; fixture.teams[1].record = '0-1-1';
    assert.deepEqual(automaticFinalPeriods(fixture, now), [1, 2]);
    fixture.schedule[0].matchupList = [{ away: { id: 'a' }, home: {} }];
    fixture.teams[0].record = '1-0-0'; fixture.teams[1].record = '0-1-0';
    assert.deepEqual(automaticFinalPeriods(fixture, now), [2], 'byes do not count as a recorded matchup');
});

test('does not infer early Finals from incomplete standings, missing history, duplicate teams or playoff records', () => {
    const now = Date.parse('2026-10-16T20:00:00Z');
    for (const record of ['0-0-0', '', '1-0', '1-0-0x', '-1-1-0']) {
        const fixture = finalFixture(); fixture.teams[1].record = record;
        assert.deepEqual(automaticFinalPeriods(fixture, now), []);
    }
    const missing = finalFixture(); missing.teams.pop();
    assert.deepEqual(automaticFinalPeriods(missing, now), []);
    const duplicate = finalFixture(); duplicate.schedule[0].matchupList.push(duplicate.schedule[0].matchupList[0]);
    assert.deepEqual(automaticFinalPeriods(duplicate, now), []);
    const history = finalFixture(); history.schedule.shift();
    assert.deepEqual(automaticFinalPeriods(history, Date.parse('2026-10-18T00:00:00Z')), []);
    const playoffs = finalFixture(); playoffs.lastRegularSeasonPeriod = 1;
    playoffs.teams.forEach(team => { team.record = '2-0-0'; });
    assert.deepEqual(automaticFinalPeriods(playoffs, Date.parse('2026-10-18T00:00:00Z')), [1]);
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
