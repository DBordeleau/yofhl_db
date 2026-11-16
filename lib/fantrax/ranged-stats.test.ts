import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findByDateSeasonCode, loadRangedGoalies, loadRangedPoints, loadRangedPointsPage, loadRangedSkaterPage, loadRangedSkaters } from './ranged-stats';
import type { Fetcher } from './leaders';

// Recorded signed-out answers to ranged getPlayerStats requests against the 2026-27 league (lib/fantrax/fixtures),
// read with Fantrax's page size of 20 that recorded them. `ranged-goalies-save-percentage` is the 2025-26 league's
// goalie table, which scores OL+ShL and SV% where the 2026-27 league scores GA and SV.
const recorded = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/getPlayerStats-${name}.json`, import.meta.url), 'utf8'));

/** serves the recorded pages by requested page number, as a table of only those pages; `requests` collects what was sent */
function fantrax(...names: string[]) {
    const pages = names.map(recorded);
    const total = pages.reduce((sum, page) => sum + page.responses[0].data.statsTable.length, 0);
    for (const page of pages) Object.assign(page.responses[0].data.paginatedResultSet, { totalNumResults: total, totalNumPages: pages.length });
    const requests: Record<string, unknown>[] = [];
    const fetcher: Fetcher = async (_url, init) => {
        const data = JSON.parse(init!.body as string).msgs[0].data;
        requests.push(data);
        return Response.json(pages[Number(data.pageNumber) - 1]);
    };
    return { fetcher, requests };
}

const league = 'rf5o9cu2mutybszr';
const regularSeason = { leagueId: league, seasonCode: 'SEASON_31l_BY_DATE', startDate: '2025-10-07', endDate: '2026-03-08' };

test("a skater range returns each skater's fantasy points, games played and categories for those dates", async () => {
    const { fetcher, requests } = fantrax('ranged-skaters');
    const skaters = await loadRangedSkaters(regularSeason, { fetcher, pageSize: 20 });
    assert.equal(skaters.length, 20);
    assert.deepEqual(skaters[0], {
        id: '02f9l', name: 'Nathan MacKinnon', positions: 'C', nhlTeam: 'COL', age: 31,
        points: 524.5, perGame: 8.6, gamesPlayed: 61, goals: 43, assists: 61, shots: 280, hits: 48, blocks: 31,
    });
    assert.deepEqual(requests[0], {
        leagueId: league, view: 'STATS', statusOrTeamFilter: 'ALL', positionOrGroup: 'HOCKEY_SKATING', sortType: 'SCORE', sortReversed: false,
        miscDisplayType: '1', seasonOrProjection: 'SEASON_31l_BY_DATE', timeframeTypeCode: 'BY_DATE',
        startDate: '2025-10-07', endDate: '2026-03-08', pageNumber: '1', maxResultsPerPage: '20',
    });
});

test("a goalie range returns each goalie's fantasy points, games played and categories for those dates", async () => {
    const { fetcher, requests } = fantrax('ranged-goalies');
    const goalies = await loadRangedGoalies(regularSeason, { fetcher, pageSize: 20 });
    assert.equal(goalies.length, 20);
    assert.deepEqual(goalies[0], {
        id: '03rih', name: 'Karel Vejmelka', positions: 'G', nhlTeam: 'UTA', age: 30,
        points: 308.1, perGame: 6.29, gamesPlayed: 49, wins: 30, overtimeLosses: 2, goalsAgainst: 127, saves: 1137, shutouts: 1,
    });
    assert.equal(requests[0].positionOrGroup, 'POS_201');
    assert.equal('scoringCategoryType' in requests[0], false);
});

test("a goalie range reads the categories the league's table offers and leaves out those it doesn't", async () => {
    // the 2025-26 league scores GP, W, OL+ShL, SV% and SHO
    const { fetcher } = fantrax('ranged-goalies-save-percentage');
    const formerLeague = { leagueId: 'gl4i2lrcmfblkbwq', seasonCode: 'SEASON_31l_BY_DATE', startDate: '2025-10-07', endDate: '2026-03-22' };
    const goalies = await loadRangedGoalies(formerLeague, { fetcher, pageSize: 20 });
    assert.equal(goalies.length, 20);
    assert.deepEqual(goalies[0], {
        id: '02nom', name: 'Andrei Vasilevskiy', positions: 'G', nhlTeam: 'TBL', age: 32,
        points: 450, perGame: 9.38, gamesPlayed: 48, wins: 33, overtimeLosses: 3, savePercentage: 0.915, shutouts: 2,
    });
    assert.ok(goalies.every(goalie => !('goalsAgainst' in goalie) && !('saves' in goalie)));
    // the 2026-27 league scores GP, W, OL+ShL, GA, SV and SHO
    const [current] = await loadRangedGoalies(regularSeason, { fetcher: fantrax('ranged-goalies').fetcher, pageSize: 20 });
    assert.deepEqual([current.goalsAgainst, current.saves, current.overtimeLosses, 'savePercentage' in current], [127, 1137, 2, false]);
});

test('a goalie table without games played, wins or shutouts throws', async () => {
    for (const key of ['2020#2100#-1', '2020#231b#-1', '2020#2290#-1']) {
        const { fetcher } = fantrax('ranged-goalies');
        const missing: typeof fetcher = async (url, init) => {
            const body = await (await fetcher(url, init)).json();
            for (const cell of body.responses[0].data.tableHeader.cells) if (cell.key === key) cell.key = 'other';
            return Response.json(body);
        };
        await assert.rejects(loadRangedGoalies(regularSeason, { fetcher: missing, pageSize: 20 }), new RegExp(`no ${key} column`));
    }
});

test("an all-positions single day returns each player's fantasy points without categories", async () => {
    const { fetcher, requests } = fantrax('ranged-all-day');
    const day = { ...regularSeason, startDate: '2026-01-15', endDate: '2026-01-15' };
    const players = await loadRangedPoints(day, { fetcher, pageSize: 20 });
    assert.equal(players.length, 20);
    assert.deepEqual(players[0], { id: '042t5', name: 'Tage Thompson', positions: 'C,RW', nhlTeam: 'BUF', age: 29, points: 25.25, perGame: 25.25 });
    assert.equal(requests[0].positionOrGroup, 'ALL');
    assert.equal(requests[0].scoringCategoryType, '5');
});

test('one page of an all-positions single day is read on its own, with the size of the whole table', async () => {
    const { fetcher, requests } = fantrax('ranged-all-day');
    const day = { ...regularSeason, startDate: '2026-01-15', endDate: '2026-01-15' };
    const page = await loadRangedPointsPage(day, 1, { fetcher, pageSize: 20 });
    assert.deepEqual([page.pages, page.total, page.players.length], [1, 20, 20]);
    assert.deepEqual(page.players[1], { id: '03924', name: 'Jack Eichel', positions: 'C', nhlTeam: 'VGK', age: 30, points: 17.25, perGame: 17.25 });
    assert.deepEqual([requests[0].positionOrGroup, requests[0].startDate, requests[0].endDate, requests[0].pageNumber], ['ALL', '2026-01-15', '2026-01-15', '1']);
});

test('a season-to-date answer to an all-positions single day throws, as does an answer for another day', async () => {
    // Fantrax's recorded answer to a single day sent as 01/15/2026: by-date code and timeframe, but the whole season's dates and totals
    const day = { ...regularSeason, startDate: '2026-01-15', endDate: '2026-01-15' };
    await assert.rejects(loadRangedPointsPage(day, 1, { fetcher: fantrax('ranged-season-to-date').fetcher, pageSize: 20 }), /dates/);
    await assert.rejects(loadRangedPointsPage({ ...day, startDate: '2026-01-16', endDate: '2026-01-16' }, 1, { fetcher: fantrax('ranged-all-day').fetcher, pageSize: 20 }), /dates/);
});

test('a range beyond one page is read in full, page by page', async () => {
    const { fetcher, requests } = fantrax('ranged-skaters', 'ranged-skaters-p2');
    const skaters = await loadRangedSkaters(regularSeason, { fetcher, pageSize: 20 });
    assert.deepEqual(requests.map(request => request.pageNumber), ['1', '2']);
    assert.equal(skaters.length, 40);
    assert.equal(skaters[19].points >= skaters[20].points, true);
    assert.deepEqual(skaters[20], {
        id: '04lbz', name: 'Quinn Hughes', positions: 'D', nhlTeam: 'MIN', age: 27,
        points: 366.5, perGame: 6.32, gamesPlayed: 58, goals: 6, assists: 57, shots: 155, hits: 5, blocks: 65,
    });
});

test('one page of a range is read on its own, with the size of the whole table', async () => {
    const { fetcher, requests } = fantrax('ranged-skaters', 'ranged-skaters-p2');
    const page = await loadRangedSkaterPage(regularSeason, 2, { fetcher, pageSize: 20 });
    assert.deepEqual(requests.map(request => request.pageNumber), ['2']);
    assert.equal(page.pages, 2);
    assert.equal(page.total, 40);
    assert.equal(page.players.length, 20);
    assert.equal(page.players[0].name, 'Quinn Hughes');
});

test('each page of a range may take 30 seconds, as a full 5000-row page can', async t => {
    const timeout = t.mock.method(AbortSignal, 'timeout');
    const { fetcher } = fantrax('ranged-skaters', 'ranged-skaters-p2');
    await loadRangedSkaters(regularSeason, { fetcher, pageSize: 20 });
    await loadRangedSkaterPage(regularSeason, 1, { fetcher, pageSize: 20 });
    assert.deepEqual(timeout.mock.calls.map(call => call.arguments[0]), [30_000, 30_000, 30_000]);
});

test('a table that changes size between pages throws', async () => {
    const { fetcher } = fantrax('ranged-skaters', 'ranged-skaters-p2');
    const changing: typeof fetcher = async (url, init) => {
        const body = await (await fetcher(url, init)).json();
        const pagination = body.responses[0].data.paginatedResultSet;
        if (pagination.pageNumber === 2) Object.assign(pagination, { totalNumResults: 41, totalNumPages: 3 });
        return Response.json(body);
    };
    await assert.rejects(loadRangedSkaters(regularSeason, { fetcher: changing, pageSize: 20 }), /changed between pages/);
});

test('a page short of its rows throws', async () => {
    const { fetcher } = fantrax('ranged-skaters', 'ranged-skaters-p2');
    const short: typeof fetcher = async (url, init) => {
        const body = await (await fetcher(url, init)).json();
        body.responses[0].data.statsTable.pop();
        return Response.json(body);
    };
    await assert.rejects(loadRangedSkaters(regularSeason, { fetcher: short, pageSize: 20 }), /incomplete/);
});

test('a playoff-round range in a past season reads against the current league', async () => {
    const { fetcher } = fantrax('ranged-skaters-playoffs');
    const skaters = await loadRangedSkaters({ ...regularSeason, startDate: '2026-03-09', endDate: '2026-04-05' }, { fetcher, pageSize: 20 });
    assert.deepEqual(skaters[0], {
        id: '04bdb', name: 'Jack Hughes', positions: 'C,LW', nhlTeam: 'NJD', age: 25,
        points: 132.25, perGame: 10.17, gamesPlayed: 13, goals: 10, assists: 17, shots: 60, hits: 1, blocks: 12,
    });
});

test('a malformed range is refused without asking Fantrax', async () => {
    const { fetcher, requests } = fantrax('ranged-skaters');
    for (const range of [
        { ...regularSeason, seasonCode: 'SEASON_31l_YEAR_TO_DATE' },
        { ...regularSeason, startDate: '10/07/2025' },
        { ...regularSeason, endDate: '2026-02-30' },
        { ...regularSeason, startDate: '2026-03-09' },
    ]) await assert.rejects(loadRangedSkaters(range, { fetcher, pageSize: 20 }), /range/);
    await assert.rejects(loadRangedSkaters(regularSeason, { fetcher, pageSize: 5001 }), /page size/);
    assert.equal(requests.length, 0);
});

const singleDay = { ...regularSeason, startDate: '2026-01-15', endDate: '2026-01-15' };

test('a season-to-date answer to a ranged request throws, though it echoes the by-date code', async () => {
    // Fantrax's answer to a single day sent as 01/15/2026: by-date code and timeframe, but the whole season's dates and totals
    const { fetcher } = fantrax('ranged-season-to-date');
    await assert.rejects(loadRangedSkaters(singleDay, { fetcher, pageSize: 20 }), /dates/);
});

test('a year-to-date answer to a ranged request throws', async () => {
    // Fantrax's answer to a single day sent without a timeframe type
    const { fetcher } = fantrax('ranged-no-timeframe');
    await assert.rejects(loadRangedSkaters(singleDay, { fetcher, pageSize: 20 }), /season/);
});

test('a range Fantrax answered for other dates throws', async () => {
    const { fetcher } = fantrax('ranged-skaters');
    await assert.rejects(loadRangedSkaters({ ...regularSeason, endDate: '2026-03-09' }, { fetcher, pageSize: 20 }), /dates/);
    await assert.rejects(loadRangedSkaters({ ...regularSeason, startDate: '2025-10-06' }, { fetcher, pageSize: 20 }), /dates/);
});

test('a range Fantrax answered for another season or position group throws', async () => {
    await assert.rejects(loadRangedSkaters({ ...regularSeason, seasonCode: 'SEASON_31n_BY_DATE' }, { fetcher: fantrax('ranged-skaters').fetcher, pageSize: 20 }), /season/);
    await assert.rejects(loadRangedGoalies(regularSeason, { fetcher: fantrax('ranged-skaters').fetcher, pageSize: 20 }), /position/);
});

test("a season's by-date code is found among the seasons Fantrax offers, by season year", async () => {
    const { fetcher, requests } = fantrax('ranged-all-day');
    assert.equal(await findByDateSeasonCode(league, 2026, { fetcher }), 'SEASON_31l_BY_DATE');
    assert.equal(await findByDateSeasonCode(league, 2027, { fetcher }), 'SEASON_31n_BY_DATE');
    assert.equal(requests[0].maxResultsPerPage, '1');
    await assert.rejects(findByDateSeasonCode(league, 2040, { fetcher }), /2039-40/);
});
