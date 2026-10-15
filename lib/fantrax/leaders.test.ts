import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRosterStats, loadScoringLeaders } from './leaders';

const season = { code: 'SEASON_current_YEAR_TO_DATE', name: '2026-27 Reg Season - YTD', timeframeTypeCode: 'YEAR_TO_DATE' };
const table = () => ({
    displayedStatusOrTeam: 'ALL', displayedPosOrGroup: 'ALL', displayedSortType: 'SCORE', displayedSortReversed: false,
    displayedView: 'STATS', displayedScoringCategoryType: '5',
    displayedSeasonOrProjection: season, seasonOrProjections: [season],
    paginatedResultSet: { pageNumber: 1, totalNumResults: 2 },
    tableHeader: { cells: [{ key: 'status' }, { key: 'fptsPerGame' }, { key: 'fpts' }] },
    statsTable: [
        { scorer: { scorerId: 'skater', name: 'Scoring Skater', posShortNames: 'C,LW' }, cells: [{ content: 'Reapers', teamId: 'team-a' }, { content: '13.9' }, { content: '69.5' }] },
        { scorer: { scorerId: 'goalie', name: 'Scoring Goalie', posShortNames: 'G' }, cells: [{ content: 'FA' }, { content: '6.4' }, { content: '32' }] },
    ],
});
const response = (data: unknown) => Response.json({ responses: [{ data }] });

test('loads current league-scored skaters and goalies directly from Fantrax without archive imports', async t => {
    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
        const request = JSON.parse(init.body as string).msgs[0].data;
        assert.equal(request.positionOrGroup, 'ALL');
        assert.equal(request.sortType, 'SCORE');
        assert.equal(request.maxResultsPerPage, '10');
        assert.equal(init.cache, 'no-store');
        return response(table());
    });
    assert.deepEqual(await loadScoringLeaders('league', 2026), [
        { id: 'skater', name: 'Scoring Skater', position: 'C,LW', points: 69.5, perGame: 13.9, teamId: 'team-a', team: 'Reapers' },
        { id: 'goalie', name: 'Scoring Goalie', position: 'G', points: 32, perGame: 6.4, teamId: null, team: 'FA' },
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

test('returns all ten leaders from a season with more players', async t => {
    const data = table();
    data.paginatedResultSet.totalNumResults = 100;
    data.statsTable = Array.from({ length: 10 }, (_, index) => ({
        scorer: { scorerId: `player-${index}`, name: `Player ${index}`, posShortNames: 'C' },
        cells: [{ content: 'FA' }, { content: '10' }, { content: String(100 - index) }],
    }));
    t.mock.method(globalThis, 'fetch', async () => response(data));
    const leaders = await loadScoringLeaders('league', 2026);
    assert.equal(leaders.length, 10);
    assert.equal(leaders[9].id, 'player-9');
    assert.equal(leaders[9].points, 91);
});

test('handles reordered columns and excludes unplayed or non-positive totals', async t => {
    const data = table();
    data.tableHeader.cells.reverse();
    data.statsTable.forEach(row => row.cells.reverse());
    data.statsTable[0].cells[0].content = '1,234.5';
    data.statsTable[1].cells[0].content = '—';
    t.mock.method(globalThis, 'fetch', async () => response(data));
    assert.deepEqual((await loadScoringLeaders('league', 2026)).map(player => player.points), [1234.5]);
    assert.equal((await loadScoringLeaders('league', 2026))[0].perGame, 13.9);
    data.statsTable[0].cells[0].content = '0';
    assert.deepEqual(await loadScoringLeaders('league', 2026), []);
});

test('preserves zero and missing per-game averages and rejects invalid or absent averages', async t => {
    const data = table();
    t.mock.method(globalThis, 'fetch', async () => response(data));
    data.statsTable[0].cells[1].content = '0';
    data.statsTable[1].cells[1].content = '—';
    assert.deepEqual((await loadScoringLeaders('league', 2026)).map(player => player.perGame), [0, null]);
    data.statsTable[0].cells[1].content = 'broken';
    await assert.rejects(loadScoringLeaders('league', 2026), /Fantrax scoring stat is invalid/);
    delete (data.statsTable[0].cells[1] as { content?: string }).content;
    await assert.rejects(loadScoringLeaders('league', 2026), /Fantrax scoring stat is missing/);
    data.tableHeader.cells[1].key = 'unexpected';
    await assert.rejects(loadScoringLeaders('league', 2026), /Fantrax scoring columns are missing/);
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
        { ...base, statsTable: [{ ...base.statsTable[0], cells: [{ content: 'FA' }, { content: '10' }, { content: 'broken' }] }, base.statsTable[1]] },
    ]) await assert.rejects(loadScoringLeaders('league', 2026), /Fantrax/);
});

test('reports upstream failures instead of treating them as no scoring yet', async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
    await assert.rejects(loadScoringLeaders('league', 2026), /503/);
});

const rosterTable = () => ({
    ...table(), displayedStatusOrTeam: 'ALL_TAKEN',
    tableHeader: { cells: [{ key: 'fptsPerGame' }, { key: 'fpts' }] },
    statsTable: [
        { scorer: { scorerId: 'skater' }, cells: [{ content: '13.9' }, { content: '1,234.5' }] },
        { scorer: { scorerId: 'goalie' }, cells: [{ content: '-2.5' }, { content: '-5' }] },
    ],
});

test('loads roster totals and per-game stats by column key, including negative scores', async t => {
    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
        const request = JSON.parse(init.body as string).msgs[0].data;
        assert.equal(request.statusOrTeamFilter, 'ALL_TAKEN');
        assert.equal(request.positionOrGroup, 'ALL');
        assert.equal(request.maxResultsPerPage, '1000');
        return response(rosterTable());
    });
    assert.deepEqual(await loadRosterStats('league', 2026), {
        skater: { points: 1234.5, perGame: 13.9 }, goalie: { points: -5, perGame: -2.5 },
    });
});

test('preserves real zeros and distinguishes missing roster stats', async t => {
    const data = rosterTable();
    data.statsTable[0].cells = [{ content: '0' }, { content: '0' }];
    data.statsTable[1].cells = [{ content: '—' }, { content: 'N/A' }];
    t.mock.method(globalThis, 'fetch', async () => response(data));
    assert.deepEqual(await loadRosterStats('league', 2026), {
        skater: { points: 0, perGame: 0 }, goalie: { points: null, perGame: null },
    });
});

test('rejects wrong roster filters, seasons, incomplete pages, duplicates and invalid stats', async t => {
    let data: unknown;
    t.mock.method(globalThis, 'fetch', async () => response(data));
    const base = rosterTable();
    for (data of [
        { ...base, displayedStatusOrTeam: 'ALL' },
        { ...base, displayedSeasonOrProjection: { ...season, name: '2025-26 Reg Season - YTD' }, seasonOrProjections: [] },
        { ...base, tableHeader: { cells: [{ key: 'fpts' }] } },
        { ...base, statsTable: [base.statsTable[0]] },
        { ...base, paginatedResultSet: { pageNumber: 1, totalNumResults: 1001 }, statsTable: Array(1000).fill(base.statsTable[0]) },
        { ...base, statsTable: [base.statsTable[0], base.statsTable[0]] },
        { ...base, statsTable: [{ ...base.statsTable[0], cells: [{ content: 'broken' }, { content: '10' }] }, base.statsTable[1]] },
        { ...base, statsTable: [{ ...base.statsTable[0], cells: [] }, base.statsTable[1]] },
    ]) await assert.rejects(loadRosterStats('league', 2026), /Fantrax/);
});

test('keeps roster stats failures distinct from a league with no rostered players', async t => {
    t.mock.method(globalThis, 'fetch', async () => response({ ...rosterTable(), statsTable: [], paginatedResultSet: { pageNumber: 1, totalNumResults: 0 } }));
    assert.deepEqual(await loadRosterStats('league', 2026), {});
    t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
    await assert.rejects(loadRosterStats('league', 2026), /503/);
});
