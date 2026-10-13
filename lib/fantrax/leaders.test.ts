import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScoringLeaders } from './leaders';

const season = { code: 'SEASON_current_YEAR_TO_DATE', name: '2026-27 Reg Season - YTD', timeframeTypeCode: 'YEAR_TO_DATE' };
const table = () => ({
    displayedStatusOrTeam: 'ALL', displayedPosOrGroup: 'ALL', displayedSortType: 'SCORE', displayedSortReversed: false,
    displayedView: 'STATS', displayedScoringCategoryType: '5',
    displayedSeasonOrProjection: season, seasonOrProjections: [season],
    paginatedResultSet: { pageNumber: 1, totalNumResults: 2 },
    tableHeader: { cells: [{ key: 'status' }, { key: 'fpts' }] },
    statsTable: [
        { scorer: { scorerId: 'skater', name: 'Scoring Skater', posShortNames: 'C,LW' }, cells: [{ content: 'Reapers', teamId: 'team-a' }, { content: '69.5' }] },
        { scorer: { scorerId: 'goalie', name: 'Scoring Goalie', posShortNames: 'G' }, cells: [{ content: 'FA' }, { content: '32' }] },
    ],
});
const response = (data: unknown) => Response.json({ responses: [{ data }] });

test('loads current league-scored skaters and goalies directly from Fantrax without archive imports', async t => {
    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
        const request = JSON.parse(init.body as string).msgs[0].data;
        assert.equal(request.positionOrGroup, 'ALL');
        assert.equal(request.sortType, 'SCORE');
        assert.equal(request.maxResultsPerPage, '5');
        assert.equal(init.cache, 'no-store');
        return response(table());
    });
    assert.deepEqual(await loadScoringLeaders('league', 2026), [
        { id: 'skater', name: 'Scoring Skater', position: 'C,LW', points: 69.5, teamId: 'team-a', team: 'Reapers' },
        { id: 'goalie', name: 'Scoring Goalie', position: 'G', points: 32, teamId: null, team: 'FA' },
    ]);
});

test('explicitly selects the current regular season when Fantrax defaults to projections', async t => {
    const calls: Record<string, unknown>[] = [];
    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(init.body as string).msgs[0].data);
        return response(calls.length === 1 ? { ...table(), displayedSeasonOrProjection: { ...season, name: 'Projected - Season' } } : table());
    });
    assert.equal((await loadScoringLeaders('league', 2026)).length, 2);
    assert.equal(calls[1].seasonOrProjection, season.code);
});

test('handles reordered columns and excludes unplayed or non-positive totals', async t => {
    const data = table();
    data.tableHeader.cells.reverse();
    data.statsTable.forEach(row => row.cells.reverse());
    data.statsTable[0].cells[0].content = '1,234.5';
    data.statsTable[1].cells[0].content = '—';
    t.mock.method(globalThis, 'fetch', async () => response(data));
    assert.deepEqual((await loadScoringLeaders('league', 2026)).map(player => player.points), [1234.5]);
    data.statsTable[0].cells[0].content = '0';
    assert.deepEqual(await loadScoringLeaders('league', 2026), []);
});

test('rejects wrong seasons, sorting, incomplete tables, duplicate players, and invalid scores', async t => {
    let data: unknown;
    t.mock.method(globalThis, 'fetch', async () => response(data));
    const base = table();
    for (data of [
        { ...base, displayedSeasonOrProjection: { ...season, name: '2025-26 Reg Season - YTD' }, seasonOrProjections: [] },
        { ...base, displayedSeasonOrProjection: { ...season, name: '2025-26 Reg Season - YTD' } },
        { ...base, displayedSeasonOrProjection: { ...season, timeframeTypeCode: 'BY_PERIOD' } },
        { ...base, displayedSeasonOrProjection: { ...season, code: 'PROJECTION_current_YEAR_TO_DATE' } },
        { ...base, displayedScoringCategoryType: '1' },
        { ...base, displayedSortType: 'FPTS_PER_GAME' },
        { ...base, displayedSortReversed: true },
        { ...base, statsTable: [] },
        { ...base, statsTable: [], paginatedResultSet: { pageNumber: 1, totalNumResults: -1 } },
        { ...base, tableHeader: { cells: [{ key: 'fpts' }] } },
        { ...base, statsTable: [base.statsTable[0], base.statsTable[0]] },
        { ...base, statsTable: [{ ...base.statsTable[0], cells: [{ content: 'FA' }, { content: 'broken' }] }, base.statsTable[1]] },
    ]) await assert.rejects(loadScoringLeaders('league', 2026), /Fantrax/);
});

test('reports upstream failures instead of treating them as no scoring yet', async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
    await assert.rejects(loadScoringLeaders('league', 2026), /503/);
});
