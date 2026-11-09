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
            // The player stats table echoes the filter it was asked for.
            const request = JSON.parse(String(init?.body)).msgs[0].data;
            body = recorded('getPlayerStats');
            body.responses[0].data.displayedStatusOrTeam = request.statusOrTeamFilter;
            body = (edit.getPlayerStats ?? (value => value))(body);
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
    const data = await fantrax().capture(LEAGUE, { now: NOW, archivedPlayerIds: async () => ['*03kl0*'] });
    assert.equal(data.source.info.seasonYear, 2027);
    assert.deepEqual(Object.keys(data.scores), ['2'], 'only weeks started and still open to corrections');
    assert.deepEqual(data.leaders.players.map(player => [player.name, player.archiveId]), [['Connor McDavid', '*03kl0*'], ['Igor Shesterkin', null]]);
    assert.equal(data.rosterStats.players['04ab9'].points, 30.5);
});
