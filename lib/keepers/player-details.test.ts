import test from 'node:test';
import assert from 'node:assert/strict';
import { matchNhlPlayer, playerAge, profileDetails, type NhlProfile } from './player-details';

test('player identity matching accepts accents but rejects fuzzy names and unresolved duplicates', () => {
    const candidate = { playerId: '1', name: 'Tim Stützle', positionCode: 'C', teamAbbrev: 'OTT' };
    assert.equal(matchNhlPlayer('Tim Stutzle', 'C', 'OTT', [candidate])?.playerId, '1');
    assert.equal(matchNhlPlayer('Tom Stutzle', 'C', 'OTT', [candidate]), null);
    assert.equal(matchNhlPlayer('Tim Stutzle', 'G', 'OTT', [candidate]), null);
    assert.equal(matchNhlPlayer('Tim Stutzle', 'C', 'OTT', [candidate, { ...candidate, playerId: '2' }]), null);
    assert.equal(matchNhlPlayer('Tim Stutzle', 'C', 'OTT', [candidate, { ...candidate, playerId: '2', teamAbbrev: 'NYR' }])?.playerId, '1');
});
test('age respects birthdays and does not invent missing birth dates', () => {
    assert.equal(playerAge('2000-10-05', '2026-10-04'), 25);
    assert.equal(playerAge('2000-10-04', '2026-10-04'), 26);
    assert.equal(playerAge(null, '2026-10-04'), null);
});
const base: NhlProfile = { playerId: 1, firstName: { default: 'Test' }, lastName: { default: 'Player' }, position: 'C', seasonTotals: [] };
test('stats use only the previous NHL regular season, with traded-player totals combined', () => {
    const row = { season: 20252026, gameTypeId: 2, leagueAbbrev: 'NHL', gamesPlayed: 20, goals: 5, assists: 8, points: 13 };
    const result = profileDetails({ ...base, seasonTotals: [row, { ...row, gamesPlayed: 40 }, { ...row, gameTypeId: 3, goals: 999 }, { ...row, leagueAbbrev: 'AHL', goals: 999 }, { ...row, season: 20262027, goals: 999 }] }, 2026, 'now');
    assert.equal(result.stats?.games, 60); assert.equal(result.stats?.goals, 10);
    const combined = profileDetails({ ...base, seasonTotals: [row, { ...row, gamesPlayed: 60, teamName: { default: '2 Teams' } }] }, 2026, 'now');
    assert.equal(combined.stats?.games, 60, 'do not double count published aggregate rows');
});
test('goalie rate stats are weighted and missing season data is distinct from no NHL games', () => {
    const row = { season: 20252026, gameTypeId: 2, leagueAbbrev: 'NHL', gamesPlayed: 1, wins: 1, goalsAgainst: 2, shotsAgainst: 20, timeOnIce: '60:00' };
    const stats = profileDetails({ ...base, position: 'G', seasonTotals: [row, { ...row, goalsAgainst: 1, shotsAgainst: 40 }] }, 2026, 'now').stats!;
    assert.equal(stats.gaa, 1.5); assert.equal(stats.savePct, 0.95); assert.equal(stats.wins, 2);
    assert.equal(profileDetails({ ...base, seasonTotals: undefined }, 2026, 'now').stats, null);
    assert.equal(profileDetails(base, 2026, 'now').stats?.games, 0);
});
