import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seasonDates } from '@/lib/award-vote/season-dates';
import { createFantraxClient, directoryPlayer, readCore } from './fantrax-client';

// Recorded Fantrax responses (lib/fantrax/fixtures), served by endpoint. `edit` changes one response for a test.
const recorded = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
// A recorded response body, as parsed JSON. Edits that reach into it name the part they change.
type RecordedBody = Record<string, unknown>;
type RecordedScores = { matchups: { away: { score: number | null }; home: { teamId: string } }[] };
function fantrax(edit: Record<string, (body: RecordedBody) => unknown> = {}) {
    return createFantraxClient(async (input, init) => {
        const url = new URL(input);
        const endpoint = url.pathname.split('/').pop()!;
        let body;
        if (endpoint === 'req') {
            const { method, data: request } = JSON.parse(String(init?.body)).msgs[0];
            if (method === 'getStandings') {
                body = (edit.getStandingsTable ?? (value => value))(recorded('getStandingsTable'));
            } else {
                // The player stats table echoes the filter it was asked for.
                body = recorded('getPlayerStats');
                body.responses[0].data.displayedStatusOrTeam = request.statusOrTeamFilter;
                body = (edit.getPlayerStats ?? (value => value))(body);
            }
        } else {
            // a past day's rosters are one recorded day (period 20), whichever day is asked for
            const name = endpoint === 'getMatchupScores' ? `getMatchupScores-${url.searchParams.get('period')}`
                : endpoint === 'getTeamRosters' && url.searchParams.has('period') ? 'getTeamRosters-20' : endpoint;
            body = (edit[endpoint] ?? (value => value))(recorded(name));
        }
        return Response.json(body);
    });
}
const LEAGUE = 'league27';
// Between weeks 2 and 3: week 1 is past its correction window and week 3 hasn't started.
const NOW = Date.parse('2026-10-26T12:00:00Z');

test('league info comes out in season years, with weeks in order and unseeded playoff slots left out', async () => {
    const client = fantrax();
    const core = readCore(await client.league(LEAGUE), await client.playerDirectory());
    assert.equal(core.seasonYear, 2027, 'Fantrax names the 2026–27 season by its start year');
    assert.deepEqual(core.weeks.map(week => [week.number, week.startDate]), [
        [1, '2026-10-07T17:00:00.000Z'], [2, '2026-10-19T17:00:00.000Z'], [3, '2026-10-26T17:00:00.000Z'],
    ]);
    assert.deepEqual(core.lineupPeriod, { number: 15, startDate: '2026-10-21T04:00:00.000Z', endDate: '2026-10-22T03:59:59.000Z' });
    assert.deepEqual(core.schedule.map(round => [round.week, round.matchups.length]), [[1, 2], [2, 2], [3, 0]]);
    assert.deepEqual(core.standings[0], { teamId: 'bbbb2222live0002', rank: 1, record: '2-0-0', points: 612.5 });
    assert.deepEqual(core.playoffs, { numPlayoffTeams: 4, lastRegularSeasonPeriod: 22, firstPlayoffPeriod: 23 });
    assert.equal(core.players['03kl0'].name, 'McDavid, Connor');
});

test('does not present unassigned Fantrax playoff slots as games or team byes', async () => {
    const placeholders = Array.from({ length: 6 }, () => ({ away: { TBD: true }, home: { TBD: true } }));
    const partial = { away: { id: 'team-a', name: 'Team A' }, home: { TBD: true } };
    const schedule = async (matchupList: unknown[]) => {
        const client = fantrax({ getLeagueInfo: body => ({ ...body, matchups: [{ period: 3, matchupList }] }) });
        return readCore(await client.league(LEAGUE), {}).schedule[0].matchups;
    };
    assert.deepEqual(await schedule(placeholders), []);
    assert.deepEqual(await schedule([...placeholders, partial]), [partial]);
});

test('an unseeded first playoff round gives its seeding, and its seed and bye placeholders are not matchups', async () => {
    // Recorded from the live league on 2026-11-14: regular season through week 21, byes for seeds 1 and 2, and a
    // two-week Final in week 24.
    const client = fantrax({ getLeagueInfo: () => recorded('getLeagueInfo-playoffs') });
    const core = readCore(await client.league(LEAGUE), {});
    assert.deepEqual([core.playoffs.firstPlayoffPeriod, core.playoffs.lastRegularSeasonPeriod, core.playoffs.numPlayoffTeams], [22, 21, 6]);
    assert.deepEqual(core.playoffs.seeding, [{ away: null, home: 1 }, { away: 5, home: 4 }, { away: null, home: 2 }, { away: 6, home: 3 }]);
    assert.deepEqual(core.schedule.filter(round => round.week >= 21).map(round => [round.week, round.matchups.length]), [[21, 5], [22, 0], [23, 0], [24, 0]]);
    assert.deepEqual([core.weeks.at(-1)!.number, core.weeks.at(-1)!.startDate, core.weeks.at(-1)!.endDate],
        [24, '2027-03-22T23:00:00.000Z', '2027-04-05T15:59:58.000Z']);
});

test('a seeded first playoff round gives no seeding', async () => {
    const client = fantrax({ getLeagueInfo: () => {
        const body = recorded('getLeagueInfo-playoffs');
        body.matchups.find((round: { period: number }) => round.period === 22).matchupList = [
            { away: { bye: true }, home: { id: '6pfjiq07mutybt24', name: 'Paddyville Lucifers' } },
            { away: { id: 'a9lp9hbcmutybt24', name: 'Hooterville Honkers' }, home: { id: '7jmn4yymmutybt24', name: 'Varrock Dark Wizards' } },
        ];
        return body;
    } });
    const core = readCore(await client.league(LEAGUE), {});
    assert.equal(core.playoffs.seeding, undefined);
    assert.equal(core.schedule.find(round => round.week === 22)!.matchups.length, 2);
});

test('an incomplete league snapshot is rejected', async () => {
    const incomplete: Record<string, (body: RecordedBody) => unknown>[] = [
        { getLeagueInfo: body => ({ ...body, teamInfo: undefined }) },
        { getLeagueInfo: body => ({ ...body, scoringPeriods: [] }) },
        { getTeamRosters: body => ({ ...body, rosters: undefined }) },
        { getStandings: () => ({ error: 'league not found' }) },
    ];
    for (const edit of incomplete) await assert.rejects(fantrax(edit).league(LEAGUE), /incomplete league snapshot/);
});

test('invalid matchup scores are rejected', async () => {
    const invalid: ((body: RecordedBody) => unknown)[] = [
        body => ({ ...body, period: 1 }),
        body => ({ ...body, matchups: [] }),
        body => { (body as unknown as RecordedScores).matchups[0].away.score = null; return body; },
        body => { (body as unknown as RecordedScores).matchups[1].home.teamId = ''; return body; },
    ];
    for (const edit of invalid) await assert.rejects(fantrax({ getMatchupScores: edit }).weekScores(LEAGUE, 2), /invalid matchup scores/);
    assert.equal((await fantrax().weekScores(LEAGUE, 2)).matchups[1].away.score, 120);
});

test("league info alone gives the season year, its weeks and its daily roster periods in order, and its first playoff week", async () => {
    const info = await fantrax().leagueInfo(LEAGUE);
    assert.equal(info.seasonYear, 2027);
    assert.deepEqual(info.weeks.map(week => week.number), [1, 2, 3]);
    assert.equal(info.firstPlayoffWeek, 23);
    assert.deepEqual(info.rosterPeriods, [
        { number: 14, startDate: '2026-10-20T04:00:00.000Z', endDate: '2026-10-21T03:59:59.000Z' },
        { number: 15, startDate: '2026-10-21T04:00:00.000Z', endDate: '2026-10-22T03:59:59.000Z' },
    ]);
});

// The 2025–26 league's info, recorded signed out on 2026-11-15 and trimmed to its season, periods and playoffs: 51
// half-week scoring periods, the playoffs from period 49, and 188 daily roster periods, each starting at its day's
// first lock.
test("a past season's league info gives the award vote its regular season, playoff rounds and Final", async () => {
    const info = await fantrax({ getLeagueInfo: () => recorded('getLeagueInfo-2026') }).leagueInfo('gl4i2lrcmfblkbwq');
    assert.equal(info.seasonYear, 2026);
    assert.equal(info.firstPlayoffWeek, 49);
    assert.deepEqual(seasonDates({ ...info, firstPlayoffWeek: info.firstPlayoffWeek! }), {
        regularSeason: { startDate: '2025-10-07', endDate: '2026-03-22' },
        playoffRounds: { startDate: '2026-03-23', endDate: '2026-04-12' },
        final: { startDate: '2026-04-06', endDate: '2026-04-12' },
        finalRosterPeriods: [182, 183, 184, 185, 186, 187, 188],
    });
});

// A past day's rosters (recorded from the live league on 2026-11-14, roster period 20, trimmed to two teams).
test("a past day's rosters give each team's players with the slot each was in that day", async () => {
    const rosters = await fantrax().dayRosters('rf5o9cu2mutybszr', 20);
    assert.deepEqual(rosters['4num7i90mutybt24'], [
        { id: '059e0', status: 'ACTIVE' }, { id: '02azf', status: 'RESERVE' },
        { id: '05lu8', status: 'INJURED_RESERVE' }, { id: '06hcq', status: 'MINORS' },
    ]);
    assert.deepEqual(Object.keys(rosters), ['4num7i90mutybt24', '1cbgg930mutybt24']);
});

test("a past day's rosters are rejected unless they are that day's, with every player's id and slot", async () => {
    type RecordedRosters = { rosters: Record<string, { rosterItems: Record<string, unknown>[] }> };
    const item = (body: RecordedBody) => (body as unknown as RecordedRosters).rosters['4num7i90mutybt24'].rosterItems[0];
    const invalid: ((body: RecordedBody) => unknown)[] = [
        // Fantrax answers a day outside the season with the nearest one
        body => ({ ...body, period: 175 }),
        () => ({ error: { code: 'INVALID_LEAGUE_ID', message: 'Missing or invalid league ID.' } }),
        body => { (body as unknown as RecordedRosters).rosters['4num7i90mutybt24'].rosterItems = undefined as never; return body; },
        body => { item(body).id = ''; return body; },
        body => { item(body).status = 'TAXI'; return body; },
    ];
    for (const edit of invalid) await assert.rejects(fantrax({ getTeamRosters: edit }).dayRosters(LEAGUE, 20), /invalid rosters for roster period 20/);
});

test('an invalid player directory is rejected', async () => {
    for (const edit of [() => ({}), (body: RecordedBody) => ({ ...body, '05zz1': { position: 'D' } })]) {
        await assert.rejects(fantrax({ getPlayerIds: edit }).playerDirectory(), /invalid player directory/);
    }
});

test('a capture is rejected unless its scores cover every scheduled matchup', async () => {
    const missing = fantrax({ getMatchupScores: body => { (body as unknown as RecordedScores).matchups.pop(); return body; } });
    await assert.rejects(missing.capture(LEAGUE, { now: NOW }), /incomplete scheduled matchup scores/);
    const data = await fantrax().capture(LEAGUE, { now: NOW });
    assert.equal(data.source.info.seasonYear, 2027);
    assert.deepEqual(Object.keys(data.scores), ['2'], 'only weeks started and still open to corrections');
    assert.deepEqual(data.leaders.players.map(player => player.name), ['Connor McDavid', 'Igor Shesterkin']);
    assert.ok(data.leaders.players.every(player => !('archiveId' in player)), 'archive membership is worked out on read, never saved');
    assert.equal(data.rosterStats.players['04ab9'].points, 30.5);
});

// Fantrax's website standings table, the one the Team Stats CSV comes from (recorded from the live league on
// 2026-11-14, after week 4).
type RecordedTable = { responses: { data: { displayedSelections: Record<string, unknown>; tableList: { caption: string; rows: { cells: { content: string }[]; fixedCells: { content?: string; teamId?: string }[] }[] }[] } }[] };
const standingsTable = (body: RecordedBody) => (body as unknown as RecordedTable).responses[0].data;

test('the standings table gives each team its rank, record and points for and against', async () => {
    const standings = await fantrax().standingsTable('rf5o9cu2mutybszr');
    assert.equal(standings.length, 10);
    assert.deepEqual(standings[0], { teamId: '7jmn4yymmutybt24', rank: 1, wins: 4, losses: 0, ties: 0, pointsFor: 1262.15, pointsAgainst: 929.9 });
    assert.deepEqual(standings[9], { teamId: '1cbgg930mutybt24', rank: 10, wins: 0, losses: 4, ties: 0, pointsFor: 664.75, pointsAgainst: 909.75 });
});

test('a standings table that is not the season-to-date table of every team is rejected', async () => {
    const invalid: ((body: RecordedBody) => unknown)[] = [
        () => ({ responses: [{ data: {} }] }),
        body => { standingsTable(body).displayedSelections.timeframeType = 'GO_BACK_DAYS'; return body; },
        body => { standingsTable(body).displayedSelections.view = 'SCHEDULE'; return body; },
        body => { standingsTable(body).tableList = standingsTable(body).tableList.slice(1); return body; },
        body => { standingsTable(body).tableList[0].rows.pop(); return body; },
        body => { standingsTable(body).tableList[0].rows[1].fixedCells[0].content = '1'; return body; },
        body => { standingsTable(body).tableList[0].rows[2].fixedCells[1].teamId = undefined; return body; },
        body => { standingsTable(body).tableList[0].rows[0].cells[0].content = 'four'; return body; },
        body => { standingsTable(body).tableList[0].rows[0].cells[7].content = ''; return body; },
    ];
    for (const edit of invalid) await assert.rejects(fantrax({ getStandingsTable: edit }).standingsTable('rf5o9cu2mutybszr'), /unexpected standings table/);
});

// Fantrax's website player stats table for the league's scoring, season to date (recorded from the live league on
// 2026-11-14 in pages of 1,000, trimmed): the first page from the top scorers through the first zeros, the last page's
// final rows ending in the one negative total, and the rostered players. Fantrax ignores sortReversed when signed out,
// so the table only sorts by fantasy points descending, with negative totals last. Every NHL player between them has
// no points.
type RecordedRow = { scorer: { scorerId: string; name: string }; cells: { content?: string; teamId?: string }[] };
type RecordedStats = { responses: { data: { displayedSortReversed: boolean; displayedStatusOrTeam: string; displayedSeasonOrProjection: { name: string };
    paginatedResultSet: { pageNumber: number; maxResultsPerPage: number; totalNumResults: number; totalNumPages: number }; statsTable: RecordedRow[] } }[] };
type TableEdits = { rows?: (rows: RecordedRow[]) => RecordedRow[]; page?: (body: RecordedStats, page: number) => unknown; taken?: (body: RecordedStats) => unknown };
const LIVE = 'rf5o9cu2mutybszr';
function playerTable(edit: TableEdits = {}) {
    const requests: { statusOrTeamFilter: string; pageNumber: string }[] = [];
    const first = recorded('getPlayerStats-first') as RecordedStats;
    const last = recorded('getPlayerStats-last') as RecordedStats;
    const total = first.responses[0].data.paginatedResultSet.totalNumResults;
    const [top, tail] = [first.responses[0].data.statsTable, last.responses[0].data.statsTable];
    const nobody = top.at(-1)!;
    const filler = Array.from({ length: total - top.length - tail.length }, (_, index) =>
        ({ ...structuredClone(nobody), scorer: { ...nobody.scorer, scorerId: `zero${index}`, name: `Zero ${index}` } }));
    const rows = (edit.rows ?? (value => value))([...top, ...filler, ...tail]);
    const client = createFantraxClient(async (_input, init) => {
        const { data: request } = JSON.parse(String(init?.body)).msgs[0];
        requests.push(request);
        if (request.statusOrTeamFilter === 'ALL_TAKEN') return Response.json((edit.taken ?? (value => value))(recorded('getPlayerStats-taken')));
        const page = Number(request.pageNumber);
        const limit = Number(request.maxResultsPerPage);
        const body = structuredClone(first);
        const data = body.responses[0].data;
        data.paginatedResultSet = { pageNumber: page, maxResultsPerPage: limit, totalNumResults: rows.length, totalNumPages: Math.ceil(rows.length / limit) };
        data.statsTable = rows.slice((page - 1) * limit, page * limit);
        return Response.json((edit.page ?? (value => value))(body, page));
    });
    return { client, requests };
}

test("the player table gives every scorer, negative totals included, and every rostered player, without reading every NHL player's page", async () => {
    const { client, requests } = playerTable();
    const players = await client.playerTable(LIVE, 2027);
    assert.deepEqual(players.map(player => [player.name, player.points]), [
        ['Connor McDavid', 214.5], ['Evan Bouchard', 194.5], ['Cutter Gauthier', 145.5], ['Scott Wedgewood', 24.7], ['Ben McCartney', 0.25],
        ['James Reimer', -1.5],
        ['Aleksander Barkov', 1.75], ['Brock Faber', 0],
    ]);
    assert.deepEqual(players[0], { id: '02un4', name: 'Connor McDavid', positions: ['C'], nhlTeam: 'EDM', teamId: '7jmn4yymmutybt24', points: 214.5, perGame: 10.72 });
    assert.deepEqual(players[2].positions, ['LW', 'RW']);
    assert.equal(players[3].teamId, null, 'a player on waivers is a free agent');
    assert.deepEqual(players[5], { id: '0055l', name: 'James Reimer', positions: ['G'], nhlTeam: null, teamId: null, points: -1.5, perGame: -1.5 });
    assert.deepEqual(players[7], { id: '05ltj', name: 'Brock Faber', positions: ['D'], nhlTeam: 'MIN', teamId: 'ru2wvs6mmutybt24', points: 0, perGame: 0 });
    assert.equal(requests.length, 3, 'the first page, the last page and the rostered players');
});

test('scorers past the first page are read until the first zero', async () => {
    // 1,500 scorers: the first zero is on the second page
    const scorer = (index: number): RecordedRow => ({ scorer: { scorerId: `s${index}`, name: `Scorer ${index}`, posShortNames: 'C', teamShortName: 'EDM' } as RecordedRow['scorer'],
        cells: [{ content: '1' }, { content: 'FA' }, { content: '30' }, { content: '' }, { content: '25' }, { content: '0.5' }] });
    const { client } = playerTable({ rows: rows => [...rows.slice(0, 3), ...Array.from({ length: 1500 }, (_, index) => scorer(index)), ...rows.slice(3)] });
    const players = await client.playerTable(LIVE, 2027);
    assert.equal(players.filter(player => player.id.startsWith('s')).length, 1500);
    assert.ok(players.some(player => player.name === 'Ben McCartney'), "the second page's last scorer");
    assert.equal(players.find(player => player.points < 0)!.name, 'James Reimer');
});

test('a player table that is not the requested, complete, season-to-date table in fantasy points order is rejected', async () => {
    const invalid: [string, TableEdits, RegExp][] = [
        ['another filter', { page: body => { body.responses[0].data.displayedStatusOrTeam = 'ALL_AVAILABLE'; return body; } }, /unexpected player stats table/],
        ['reversed', { page: body => { body.responses[0].data.displayedSortReversed = true; return body; } }, /unexpected player stats table/],
        ['another page', { page: (body, page) => { body.responses[0].data.paginatedResultSet.pageNumber = page + 1; return body; } }, /unexpected player stats table/],
        ['a short page', { page: body => { body.responses[0].data.statsTable.pop(); return body; } }, /unexpected player stats table/],
        ['a total that moves between pages', { page: (body, page) => { if (page > 1) body.responses[0].data.paginatedResultSet.totalNumResults += 1; return body; } }, /unexpected player stats table/],
        ['out of order', { rows: rows => [rows[1], rows[0], ...rows.slice(2)] }, /out of fantasy points order/],
        ['an empty table', { rows: () => [] }, /unexpected player stats table/],
        ['another season', { page: body => { body.responses[0].data.displayedSeasonOrProjection.name = '2025-26 Reg Season - YTD'; return body; } }, /wrong scoring season/],
        ['a rostered player with no team', { taken: body => { delete body.responses[0].data.statsTable[0].cells[1].teamId; return body; } }, /player is invalid/],
        ['an invalid total', { rows: rows => { rows[0].cells[4].content = 'lots'; return rows; } }, /scoring stat is invalid/],
    ];
    for (const [what, edit, error] of invalid) await assert.rejects(playerTable(edit).client.playerTable(LIVE, 2027), error, what);
});

// Fantrax's skater and goalie tables (the record book's category export's and the games-played export's reads):
// built here, since the season sync reads them with the same calls and checks as the exports. `pageSize` rows a
// page, whatever page size is asked for.
type PositionPage = { responses: { data: ReturnType<typeof positionPage> }[] };
type PageEdit = (body: PositionPage, page: number) => unknown;
const SKATER_COLUMNS = ['GP', 'G', 'A', 'Pts', 'SOG', 'Hit', 'Blk'];
const GOALIE_COLUMNS = ['GP', 'W', 'OL+ShL', 'SV%', 'SHO'];
function positionPage(group: string, columns: string[], rows: [string, string[]][], page: number, pageSize: number) {
    return {
        displayedView: 'STATS', displayedPosOrGroup: group, displayedStatusOrTeam: 'ALL',
        displayedSeasonOrProjection: { name: '2026-27 Reg Season - YTD', code: 'SEASON_93t_YEAR_TO_DATE', timeframeTypeCode: 'YEAR_TO_DATE' },
        paginatedResultSet: { pageNumber: page, totalNumResults: rows.length, totalNumPages: Math.ceil(rows.length / pageSize) },
        tableHeader: { cells: columns.map(shortName => ({ shortName })) },
        statsTable: rows.slice((page - 1) * pageSize, page * pageSize).map(([scorerId, cells]) => ({ scorer: { scorerId }, cells: cells.map(content => ({ content })) })),
    };
}
const SKATERS: [string, string[]][] = [
    ['02un4', ['20', '12', '25', '37', '70', '8', '5']],
    ['05ltj', ['20', '1', '9', '10', '41', '22', '38']],
    ['0abcd', ['0', '-', '-', '-', '-', '-', '-']], // no games played yet
];
const GOALIES: [string, string[]][] = [
    ['02nom', ['18', '11', '3', '.912', '2']],
    ['04hfl', ['3', '0', '2', '.861', '0']],
    ['0efgh', ['0', '0', '0', '.000', '0']], // no games played yet
];
function positionTable(group: string, columns: string[], rows: [string, string[]][], edit: PageEdit = body => body) {
    const requests: Record<string, string>[] = [];
    const client = createFantraxClient(async (_input, init) => {
        const { data: request } = JSON.parse(String(init?.body)).msgs[0];
        requests.push(request);
        const page = Number(request.pageNumber);
        return Response.json(edit({ responses: [{ data: positionPage(group, columns, rows, page, 2) }] }, page));
    });
    return { client, requests };
}
const skaterTable = (edit?: PageEdit) => positionTable('HOCKEY_SKATING', SKATER_COLUMNS, SKATERS, edit);
const goalieTable = (edit?: PageEdit) => positionTable('HOCKEY_GOALIE', GOALIE_COLUMNS, GOALIES, edit);
const pagesAsked = (requests: Record<string, string>[]) =>
    requests.map(request => [request.positionOrGroup, request.statusOrTeamFilter, request.pageNumber, request.seasonOrProjection]);

test('the skater table gives every skater across its pages, with games played and skater categories for those who have played', async () => {
    const { client, requests } = skaterTable();
    assert.deepEqual(await client.skaterTable(LIVE, 2027), [
        { id: '02un4', gamesPlayed: 20, categories: { goals: 12, assists: 25, shots: 70, hits: 8, blocks: 5 } },
        { id: '05ltj', gamesPlayed: 20, categories: { goals: 1, assists: 9, shots: 41, hits: 22, blocks: 38 } },
        { id: '0abcd', gamesPlayed: 0, categories: null },
    ]);
    assert.deepEqual(pagesAsked(requests), [['HOCKEY_SKATING', 'ALL', '1', undefined], ['HOCKEY_SKATING', 'ALL', '2', 'SEASON_93t_YEAR_TO_DATE']],
        "the second page asks for the first page's season");
});

test('the goalie table gives every goalie across its pages, with games played', async () => {
    const { client, requests } = goalieTable();
    assert.deepEqual(await client.goalieTable(LIVE, 2027), [
        { id: '02nom', gamesPlayed: 18 },
        { id: '04hfl', gamesPlayed: 3 },
        { id: '0efgh', gamesPlayed: 0 },
    ]);
    assert.deepEqual(pagesAsked(requests), [['HOCKEY_GOALIE', 'ALL', '1', undefined], ['HOCKEY_GOALIE', 'ALL', '2', 'SEASON_93t_YEAR_TO_DATE']],
        "the second page asks for the first page's season");
});

/** what makes either table not the complete regular-season table of the season asked for; `other` is the other table's group */
const notTheTable = (other: string): [string, PageEdit, RegExp][] => [
    ['another season', body => { body.responses[0].data.displayedSeasonOrProjection.name = '2025-26 Reg Season - YTD'; return body; }, /Unexpected Fantrax stats page/],
    ['the other position group', body => { body.responses[0].data.displayedPosOrGroup = other; return body; }, /Unexpected Fantrax stats page/],
    ['no games played column', body => { body.responses[0].data.tableHeader.cells.shift(); return body; }, /Missing stat columns/],
    ['an invalid games played', body => { body.responses[0].data.statsTable[0].cells[0].content = '1.5'; return body; }, /Invalid games played/],
    ['a total that moves between pages', (body, page) => { if (page > 1) body.responses[0].data.paginatedResultSet.totalNumResults += 1; return body; }, /changed between pages/],
    ['a player on two pages', (body, page) => {
        if (page > 1) body.responses[0].data.statsTable[0].scorer.scorerId = other === 'HOCKEY_GOALIE' ? '02un4' : '02nom';
        return body;
    }, /more than once/],
    ['a short page', (body, page) => { if (page > 1) body.responses[0].data.statsTable = []; return body; }, /incomplete/],
    ['no response', () => ({ responses: [] }), /Unexpected Fantrax stats page/],
];

test('a skater table that is not the complete regular-season table of the season asked for is rejected', async () => {
    const invalid: [string, PageEdit, RegExp][] = [
        ...notTheTable('HOCKEY_GOALIE'),
        ['a missing category column', body => { body.responses[0].data.tableHeader.cells.pop(); return body; }, /Missing stat columns/],
        ['an invalid total', body => { body.responses[0].data.statsTable[0].cells[1].content = '1.5'; return body; }, /Invalid player category total/],
    ];
    for (const [what, edit, error] of invalid) await assert.rejects(skaterTable(edit).client.skaterTable(LIVE, 2027), error, what);
});

test('a goalie table that is not the complete regular-season table of the season asked for is rejected', async () => {
    for (const [what, edit, error] of notTheTable('HOCKEY_SKATING')) await assert.rejects(goalieTable(edit).client.goalieTable(LIVE, 2027), error, what);
});

test('directoryPlayer splits comma-separated positions and normalizes (N/A) NHL team sentinels', () => {
    assert.deepEqual(directoryPlayer({ name: 'McDavid, Connor', position: 'C', team: 'EDM' }), {
        name: 'Connor McDavid', positions: ['C'], nhlTeam: 'EDM',
    });
    assert.deepEqual(directoryPlayer({ name: 'Gauthier, Cutter', position: 'LW, RW', team: '(N/A)' }), {
        name: 'Cutter Gauthier', positions: ['LW', 'RW'], nhlTeam: null,
    });
    assert.deepEqual(directoryPlayer({ name: 'Prospect, Empty', position: ' , ', team: '' }), {
        name: 'Empty Prospect', positions: [], nhlTeam: null,
    });
    assert.deepEqual(directoryPlayer({ name: 'Unlisted', position: 'D' }), {
        name: 'Unlisted', positions: ['D'], nhlTeam: null,
    });
});
