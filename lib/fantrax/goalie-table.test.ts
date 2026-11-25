import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadGoalieTable } from './goalie-table';

// A saved page of Fantrax's 2025–26 goalie table, cut to two goalies: Andrei Vasilevskiy and Sebastian Cossa, who
// played no games.
const savedPage = () => JSON.parse(readFileSync(new URL('./fixtures/getPlayerStats-goalie-table.json', import.meta.url), 'utf8'));
const serving = (page: unknown) => ({ fetcher: async () => Response.json(page) });

test("a saved goalie table page gives each goalie's games played", async () => {
    assert.deepEqual(await loadGoalieTable('gl4i2lrcmfblkbwq', 2026, serving(savedPage())), {
        seasonCode: 'SEASON_31l_YEAR_TO_DATE',
        goalies: [{ id: '02nom', gamesPlayed: 58 }, { id: '05o01', gamesPlayed: 0 }],
    });
});

test('a goalie table page of another shape is rejected', async () => {
    const skaters = savedPage(); skaters.responses[0].data.displayedPosOrGroup = 'HOCKEY_SKATING';
    const noGamesPlayed = savedPage(); noGamesPlayed.responses[0].data.tableHeader.cells = noGamesPlayed.responses[0].data.tableHeader.cells.filter((cell: { shortName: string }) => cell.shortName !== 'GP');
    const fractional = savedPage(); fractional.responses[0].data.statsTable[0].cells[8].content = '58.5';
    await assert.rejects(loadGoalieTable('gl4i2lrcmfblkbwq', 2026, serving(skaters)), /Unexpected Fantrax stats page/);
    await assert.rejects(loadGoalieTable('gl4i2lrcmfblkbwq', 2026, serving(noGamesPlayed)), /Missing stat columns/);
    await assert.rejects(loadGoalieTable('gl4i2lrcmfblkbwq', 2026, serving(fractional)), /Invalid games played for 02nom/);
});

test('a goalie row without a games played cell is rejected rather than read as none', async () => {
    // games played is cell 8 of the saved page
    const cutShort = savedPage(); cutShort.responses[0].data.statsTable[1].cells = cutShort.responses[0].data.statsTable[1].cells.slice(0, 8);
    const noContent = savedPage(); delete noContent.responses[0].data.statsTable[1].cells[8].content;
    await assert.rejects(loadGoalieTable('gl4i2lrcmfblkbwq', 2026, serving(cutShort)), /^Error: Missing games played for 05o01, 2025-26 Reg Season - YTD$/);
    await assert.rejects(loadGoalieTable('gl4i2lrcmfblkbwq', 2026, serving(noContent)), /^Error: Missing games played for 05o01, 2025-26 Reg Season - YTD$/);
});

test('an empty games played cell reads as no games played', async () => {
    const empty = savedPage(); empty.responses[0].data.statsTable[0].cells[8].content = '';
    assert.deepEqual((await loadGoalieTable('gl4i2lrcmfblkbwq', 2026, serving(empty))).goalies,
        [{ id: '02nom', gamesPlayed: 0 }, { id: '05o01', gamesPlayed: 0 }]);
});
