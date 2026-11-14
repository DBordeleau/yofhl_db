import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFantraxClient, readCore } from './fantrax-client';

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
            const name = endpoint === 'getMatchupScores' ? `getMatchupScores-${url.searchParams.get('period')}` : endpoint;
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
