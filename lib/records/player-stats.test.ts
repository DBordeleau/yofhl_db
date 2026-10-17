import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_STATS, parseCategoryPage } from './player-stats';
import snapshot from './player-category-history.json';

function page() {
    return {
        displayedView: 'STATS', displayedPosOrGroup: 'HOCKEY_SKATING', displayedStatusOrTeam: 'ALL',
        displayedSeasonOrProjection: { name: '2023-24 Reg Season - YTD', code: 'SEASON_31h_YEAR_TO_DATE', timeframeTypeCode: 'YEAR_TO_DATE' },
        paginatedResultSet: { pageNumber: 1, totalNumResults: 2, totalNumPages: 1 },
        tableHeader: { cells: ['G', 'A', 'SOG', 'Hit', 'Blk', 'GP'].map(shortName => ({ shortName })) },
        statsTable: [
            { scorer: { scorerId: 'a' }, cells: ['69', '38', '369', '85', '93', '81'].map(content => ({ content })) },
            { scorer: { scorerId: 'b' }, cells: ['-', '-', '-', '-', '-', '-'].map(content => ({ content })) },
        ],
    };
}

test('category imports retain actual counts and exclude players without appearances', () => {
    const result = parseCategoryPage(page(), 2024, 1);
    assert.deepEqual(result.players, [{ id: 'a', year: 2024, goals: 69, assists: 38, shots: 369, hits: 85, blocks: 93 }]);
    assert.deepEqual(result.allIds, ['a', 'b']);
});

test('category imports reject the wrong season, missing stats, invalid totals and duplicate players', () => {
    assert.throws(() => parseCategoryPage(page(), 2025, 1));
    assert.throws(() => parseCategoryPage(page(), 2024, 2));
    const missing = page(); missing.tableHeader.cells.pop();
    assert.throws(() => parseCategoryPage(missing, 2024, 1));
    const absent = page(); absent.statsTable[0].cells[0].content = '-';
    assert.throws(() => parseCategoryPage(absent, 2024, 1));
    const invalid = page(); invalid.statsTable[0].cells[0].content = '1.5';
    assert.throws(() => parseCategoryPage(invalid, 2024, 1));
    const duplicate = page(); duplicate.statsTable[1].scorer.scorerId = 'a';
    assert.throws(() => parseCategoryPage(duplicate, 2024, 1));
    const playoffs = page(); playoffs.displayedSeasonOrProjection.name = '2023-24 Playoffs - YTD';
    assert.throws(() => parseCategoryPage(playoffs, 2024, 1));
});

test('bundled categories cover all eight seasons with unique, complete player totals', () => {
    assert.deepEqual(snapshot.coverage.map(s => s.year), [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    assert.equal(new Set(snapshot.players.map(p => `${p.id}:${p.year}`)).size, snapshot.players.length);
    for (const season of snapshot.coverage) assert.equal(snapshot.players.filter(p => p.year === season.year).length, season.players);
    assert(snapshot.players.every(p => PLAYER_STATS.every(stat => Number.isInteger(p[stat.id]) && p[stat.id] >= 0)));
    assert.equal(Math.max(...snapshot.players.map(p => p.goals)), 69);
    assert.equal(Math.max(...snapshot.players.map(p => p.assists)), 100);
});
