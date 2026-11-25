import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSkaterTable, parseCategoryPage } from './skater-table';

// One page of Fantrax's skater table, as the record book's category export and the season sync read it.
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

// A saved page of Fantrax's 2025–26 skater table, cut to two skaters: Connor McDavid and Aleksander Barkov, who
// played no games.
const savedPage = () => Response.json(JSON.parse(readFileSync(new URL('./fixtures/getPlayerStats-skater-table.json', import.meta.url), 'utf8')));

test("a saved skater table page gives each skater's games played and skater categories", async () => {
    assert.deepEqual(await loadSkaterTable('gl4i2lrcmfblkbwq', 2026, { fetcher: async () => savedPage() }), {
        seasonCode: 'SEASON_31l_YEAR_TO_DATE',
        skaters: [
            { id: '02un4', gamesPlayed: 82, categories: { goals: 48, assists: 90, shots: 306, hits: 40, blocks: 30 } },
            { id: '02un7', gamesPlayed: 0, categories: null },
        ],
    });
    await assert.rejects(loadSkaterTable('gl4i2lrcmfblkbwq', 2027, { fetcher: async () => savedPage() }), /Unexpected Fantrax stats page for 2026-27/,
        "another season's page");
});
