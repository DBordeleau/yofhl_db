import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directAssets, pairSummary, roundLabel, type RivalryGame } from './model';
import regularSeason from './regular-season-history.json';

const game: RivalryGame = { id: 1, year: 2025, stage: 'playoff', round: 2, finalRound: 3, away: 4, home: 5, awayName: 'A', homeName: 'B', awayScore: 100, homeScore: 100.25, winner: 5, adjusted: true, note: null };
test('counts recorded winners in both orientations and keeps unresolved results separate', () => {
    const result = pairSummary([game, { ...game, id: 2, year: 2026, away: 5, home: 4, winner: 4 }, { ...game, id: 3, year: 2024, winner: null }, { ...game, id: 4, home: 8, winner: 8 }], 4, 5);
    assert.deepEqual([result.winsA, result.winsB, result.undecided], [1, 1, 1]);
    assert.deepEqual(result.meetings.map(item => item.id), [2, 1, 3]);
    assert.equal(result.closest, null, 'synthetic score adjustments must not be billed as close finishes');
    assert.equal(roundLabel(game), 'Semifinal');
    assert.equal(roundLabel({ ...game, round: 3 }), 'Final');
    assert.equal(pairSummary([game], 1, 2).closest, null);
});
test('regular-season ties are separate from unresolved playoff results', () => {
    const tied: RivalryGame = { ...game, stage: 'regular', winner: null, adjusted: false, homeScore: 100 };
    const result = pairSummary([tied, { ...game, id: 2, winner: null }], 4, 5);
    assert.deepEqual([result.ties, result.undecided], [1, 1]);
    assert.equal(result.closest?.id, tied.id);
    assert.equal(roundLabel(tied), 'Period 2');
});
test('eight-season API snapshot reproduces every archived standing and keeps IDs unique', () => {
    assert.equal(regularSeason.games.length, 1922);
    assert.equal(new Set(regularSeason.games.map(g => g.id)).size, 1922);
    assert.deepEqual(regularSeason.coverage.map(s => [s.year,s.games]), [[2019,120],[2020,245],[2021,181],[2022,252],[2023,308],[2024,252],[2025,276],[2026,288]]);
    assert(regularSeason.games.every(g => g.stage === 'regular' && g.round <= g.finalRound));
    for (const {year,team,wins,losses,ties,points} of regularSeason.standings) {
        const games = regularSeason.games.filter(g => g.year === year && (g.away === team || g.home === team));
        assert.equal(games.filter(g => g.winner === team).length, wins);
        assert.equal(games.filter(g => g.winner !== team && g.winner !== null).length, losses);
        assert.equal(games.filter(g => g.winner === null).length, ties);
        assert.equal(games.reduce((sum,g) => sum + Math.round((g.away === team ? g.awayScore : g.homeScore) * 100),0), Math.round(points * 100));
    }
});
test('head-to-head points follow team orientation and the selected stage, including ties', () => {
    const games: RivalryGame[] = [
        { ...game, id: 1, stage: 'regular', awayScore: 10.1, homeScore: 20.2, adjusted: false },
        { ...game, id: 2, stage: 'regular', away: 5, home: 4, awayScore: 30.3, homeScore: 40.4, winner: 4, adjusted: false },
        { ...game, id: 3, stage: 'regular', awayScore: 0, homeScore: 0, winner: null, adjusted: false },
        { ...game, id: 4, awayScore: 100, homeScore: 110 },
        { ...game, id: 5, home: 8, homeScore: 999 },
    ];
    const regular = pairSummary(games.filter(g => g.stage === 'regular'), 4, 5);
    assert.deepEqual([regular.pointsA,regular.pointsB,regular.ties], [50.5,50.5,1]);
    assert.notEqual(regular.closest?.id, 3, 'zero-game break ties should not become closest-finish highlights');
    const playoff = pairSummary(games.filter(g => g.stage === 'playoff'), 5, 4);
    assert.deepEqual([playoff.pointsA,playoff.pointsB], [110,100]);
    assert.equal(pairSummary([], 4, 5).pointsA, 0);
});
test('only includes direct transfers between the selected franchises in a multi-team trade', () => {
    const assets = [{ id: '1', from: 4, to: 5, label: 'A', playerId: 'a' }, { id: '2', from: 5, to: 8, label: 'B', playerId: 'b' }, { id: '3', from: 8, to: 4, label: 'C', playerId: 'c' }, { id: '4', from: null, to: 5, label: 'Unknown', playerId: null }];
    assert.deepEqual(directAssets({ id: 'trade', date: '2025-01-01', year: 2025, assets }, 4, 5), [assets[0]]);
    assert.deepEqual(directAssets({ id: 'trade', date: '2025-01-01', year: 2025, assets }, 4, 8), [assets[2]]);
});
