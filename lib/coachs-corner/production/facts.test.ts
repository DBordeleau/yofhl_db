import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureFacts, lookupFeaturedPlayer, birthRegion, parseFactPacket, referencePacket, selectRecapPeriod } from './facts';
import type { LeagueConfig } from '../../../scripts/db/lib/league-config';

const config: LeagueConfig = { franchises: [
    { id: 1, eras: [{ from: 2027, name: 'Home Team', abbreviations: ['HOME'], owner: 'Home Owner' }] },
    { id: 2, eras: [{ from: 2027, name: 'Away Team', abbreviations: ['AWAY'], owner: 'Away Owner' }] },
], awards: [], seasons: {}, scoreOverrides: [] };

const fixtures = () => ({
    getLeagueInfo: { seasonYear: 2026, teamInfo: { h: { name: 'Home Team' }, a: { name: 'Away Team' } },
        scoringPeriods: [{ number: 7, startDate: '2026-01-01T00:00:00-0500', endDate: '2026-01-08T00:00:00-0500' }],
        matchups: [{ period: 7, matchupList: [{ away: { id: 'a' }, home: { id: 'h' } }] }] },
    getStandings: [{ teamId: 'h', rank: 1, points: '1-0', totalPointsFor: 24 }, { teamId: 'a', rank: 2, points: '0-1', totalPointsFor: 20 }],
    getTeamRosters: { period: 81, rosters: { h: { rosterItems: [{ id: 'p1', status: 'ACTIVE', position: 'C' }] }, a: { rosterItems: [] } } },
    getPlayerIds: { p1: { name: 'Player, Test', position: 'C', team: 'TOR' } },
    getMatchupScores: { period: 7, matchups: [{ away: { teamId: 'a', score: 20, gamesPlayed: 3 }, home: { teamId: 'h', score: 24, gamesPlayed: 4 },
        categories: [{ name: 'Goals', shortName: 'G', group: 'Skaters', away: { value: 0 }, home: { value: 1 } },
            { name: 'Wins', shortName: 'W', group: 'Goalies', away: {}, home: {} }] }] },
});
const mockFetch = (data: ReturnType<typeof fixtures>, calls: string[] = []): typeof fetch => async (input, init) => {
    assert.equal(init?.cache, 'no-store');
    const url = new URL(String(input));
    calls.push(url.href);
    const result = data[url.pathname.split('/').at(-1)! as keyof typeof data];
    return new Response(JSON.stringify(result), { status: result ? 200 : 404 });
};

const weeklyPeriods = [
    { number: 1, startDate: '2026-10-12T13:00:00-04:00', endDate: '2026-10-19T18:59:59-04:00' },
    { number: 2, startDate: '2026-10-19T19:00:00-04:00', endDate: '2026-10-26T18:59:59-04:00' },
    { number: 3, startDate: '2026-10-26T19:00:00-04:00', endDate: '2026-11-02T18:59:59-05:00' },
];

test('recap selects the previous Toronto Monday through Sunday before and after the Monday API rollover', () => {
    for (const now of ['2026-10-19T00:00:00-04:00', '2026-10-19T14:00:00-04:00',
        '2026-10-19T18:59:59-04:00', '2026-10-19T19:00:00-04:00', '2026-10-20T14:00:00-04:00',
        '2026-10-25T23:59:59-04:00']) {
        assert.deepEqual(selectRecapPeriod([...weeklyPeriods].reverse(), Date.parse(now)), {
            period: weeklyPeriods[0], startDate: '2026-10-12', endDate: '2026-10-18',
        });
    }
    assert.equal(selectRecapPeriod(weeklyPeriods, Date.parse('2026-10-26T00:00:00-04:00')).period.number, 2);
});

test('recap uses Toronto calendar dates across DST and accepts a Sunday calendar end', () => {
    assert.equal(selectRecapPeriod(weeklyPeriods, Date.parse('2026-11-02T04:59:59Z')).period.number, 2);
    const selected = selectRecapPeriod(weeklyPeriods, Date.parse('2026-11-02T05:00:00Z'));
    assert.equal(selected.period.number, 3);
    assert.equal(selected.startDate, '2026-10-26');
    assert.equal(selected.endDate, '2026-11-01');
    const sundayEnd = { ...weeklyPeriods[2], endDate: '2026-11-01T23:59:59-05:00' };
    assert.equal(selectRecapPeriod([sundayEnd], Date.parse('2026-11-02T12:00:00-05:00')).period, sundayEnd);
});

test('recap refuses season-start rehearsals, daily periods, irregular weeks and ambiguous matches', () => {
    for (const now of ['2026-10-12T14:00:00-04:00', '2026-10-18T23:59:59-04:00']) {
        assert.throws(() => selectRecapPeriod(weeklyPeriods, Date.parse(now)), /Use --period <n>.*provisional rehearsal/);
    }
    const monday = Date.parse('2026-10-19T14:00:00-04:00');
    for (const periods of [[], [{ ...weeklyPeriods[0], endDate: '2026-10-13T17:59:59-04:00' }],
        [{ ...weeklyPeriods[0], endDate: '2026-10-26T18:59:59-04:00' }],
        [weeklyPeriods[0], { ...weeklyPeriods[0], number: 99 }]]) {
        assert.throws(() => selectRecapPeriod(periods, monday), /Cannot identify one weekly scoring period/);
    }
});

test('recap capture preserves raw Fantrax phase and legacy default selection', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-19T14:00:00-04:00') });
    const data = fixtures();
    data.getLeagueInfo.scoringPeriods = weeklyPeriods;
    data.getLeagueInfo.matchups[0].period = 1;
    data.getMatchupScores.period = 1;
    const before = await captureFacts(config, { recap: true, fetcher: mockFetch(data) });
    assert.equal(before.period?.number, 1);
    assert.equal(before.phase, 'active');
    assert.match(before.limitations[0], /2026-10-12 through 2026-10-18.*does not confirm final scores/);
    t.mock.timers.setTime(Date.parse('2026-10-19T18:59:59-04:00'));
    assert.equal((await captureFacts(config, { recap: true, fetcher: mockFetch(data) })).phase, 'active');
    t.mock.timers.setTime(Date.parse('2026-10-19T19:00:00-04:00'));
    const after = await captureFacts(config, { recap: true, fetcher: mockFetch(data) });
    assert.equal(after.period?.number, 1);
    assert.equal(after.phase, 'complete');
    data.getMatchupScores.period = 2;
    assert.equal((await captureFacts(config, { fetcher: mockFetch(data) })).period?.number, 2);
});

test('conflicting explicit recap period fails before sources are fetched', async () => {
    const calls: string[] = [];
    await assert.rejects(captureFacts(config, { recap: true, period: 1, fetcher: mockFetch(fixtures(), calls) }), /Choose --recap or --period/);
    assert.deepEqual(calls, []);
});

test('Sunday production can select Monday air date without changing live source times or phase', async t => {
    const now = '2026-10-18T23:30:00-04:00';
    t.mock.timers.enable({ apis: ['Date'], now: new Date(now) });
    const data = fixtures();
    data.getLeagueInfo.scoringPeriods = weeklyPeriods;
    data.getLeagueInfo.matchups[0].period = 1;
    data.getMatchupScores.period = 1;
    const packet = await captureFacts(config, { recap: true, airDate: '2026-10-19', fetcher: mockFetch(data) });
    assert.equal(packet.period?.number, 1);
    assert.equal(packet.phase, 'active');
    assert.equal(packet.captureStartedAt, new Date(now).toISOString());
    assert.ok(packet.sources.every(source => source.fetchedAt === packet.captureStartedAt));
    assert.match(packet.limitations[0], /2026-10-12 through 2026-10-18/);
    for (const airDate of ['', '2026-02-30', 'tomorrow']) {
        await assert.rejects(captureFacts(config, { recap: true, airDate, fetcher: mockFetch(data) }), /valid YYYY-MM-DD/);
    }
});

test('fresh capture preserves score units, missing categories, provenance and distinct roster calendar', async () => {
    const calls: string[] = [];
    const packet = await captureFacts(config, { period: 7, fetcher: mockFetch(fixtures(), calls) });
    assert.equal(packet.season, 2027);
    assert.equal(packet.period?.number, 7);
    assert.equal(packet.rosterPeriod, 81);
    assert.deepEqual(packet.scheduledMatchups, [{ awayId: 'a', homeId: 'h' }]);
    assert.equal(packet.phase, 'complete');
    assert.equal(packet.matchups[0].away.gamesPlayed, 3);
    assert.equal(packet.matchups[0].categories[0].away, 0);
    assert.equal(packet.matchups[0].categories[1].away, null);
    assert.equal(packet.rosters[0].players[0].name, 'Test Player');
    assert.equal(packet.sources.length, 5);
    assert.ok(packet.sources.every(s => calls.includes(s.url) && Number.isFinite(Date.parse(s.fetchedAt))));
    assert.ok(Date.parse(packet.capturedAt) >= Date.parse(packet.captureStartedAt));
    assert.match(packet.limitations.join(' '), /Standings and rosters are current/);
    assert.deepEqual(parseFactPacket(JSON.parse(JSON.stringify(packet))), packet);
});

test('unknown periods and unmapped franchises stop export instead of fabricating identities', async () => {
    await assert.rejects(captureFacts(config, { period: 99, fetcher: mockFetch(fixtures()) }), /Unknown scoring period/);
    const data = fixtures();
    data.getLeagueInfo.teamInfo.h.name = 'Unmapped renamed franchise';
    await assert.rejects(captureFacts(config, { period: 7, fetcher: mockFetch(data) }), /Unmapped Fantrax team/);
});

test('wrong-period scores, duplicate teams and missing rosters reject the packet', async () => {
    const wrongPeriod = fixtures();
    wrongPeriod.getMatchupScores.period = 8;
    await assert.rejects(captureFacts(config, { period: 7, fetcher: mockFetch(wrongPeriod) }), /wrong-period/);
    const duplicate = fixtures();
    duplicate.getMatchupScores.matchups[0].home.teamId = 'a';
    await assert.rejects(captureFacts(config, { period: 7, fetcher: mockFetch(duplicate) }), /Invalid matchup/);
    const missing = fixtures();
    Reflect.deleteProperty(missing.getTeamRosters.rosters, 'h');
    await assert.rejects(captureFacts(config, { period: 7, fetcher: mockFetch(missing) }), /Missing roster/);
});

test('future periods have no invented results and source failure rejects capture', async () => {
    const data = fixtures();
    data.getLeagueInfo.scoringPeriods[0].startDate = '2099-01-01T00:00:00Z';
    data.getLeagueInfo.scoringPeriods[0].endDate = '2099-01-08T00:00:00Z';
    const calls: string[] = [];
    const packet = await captureFacts(config, { fetcher: mockFetch(data, calls) });
    assert.equal(packet.phase, 'upcoming');
    assert.deepEqual(packet.matchups, []);
    assert.equal(packet.scheduledMatchups.length, 1);
    assert.equal(calls.length, 4);
    await assert.rejects(captureFacts(config, { fetcher: async () => new Response('Unavailable', { status: 503 }) }), /HTTP 503/);
});

test('partial scores are rejected and unavailable NHL players remain visible in the inventory', async () => {
    const data = fixtures();
    data.getLeagueInfo.matchups[0].matchupList.push({ away: { id: 'other-away' }, home: { id: 'other-home' } });
    await assert.rejects(captureFacts(config, { period: 7, fetcher: mockFetch(data) }), /published schedule/);
    const base = mockFetch(fixtures());
    const packet = await captureFacts(config, { period: 7, players: ['Unknown Prospect'], fetcher: (input, init) =>
        String(input).includes('nhle.com') ? Promise.resolve(new Response('Unavailable', { status: 503 })) : base(input, init) });
    assert.equal(packet.players[0].name, 'Unknown Prospect');
    assert.equal(packet.players[0].bornInNorthAmerica, null);
    assert.ok(packet.limitations.some(s => /Unknown Prospect/.test(s)));
});

test('birthplace comes from a uniquely matched NHL landing record, independent of nationality', async () => {
    const fetcher: typeof fetch = async input => new Response(JSON.stringify(String(input).includes('/search/')
        ? [{ name: 'William Nylander', playerId: '88', nationality: 'SWE' }]
        : { playerId: 88, firstName: { default: 'William' }, lastName: { default: 'Nylander' }, birthCountry: 'CAN', birthCity: { default: 'Calgary' } }));
    const player = await lookupFeaturedPlayer('William Nylander', fetcher);
    assert.equal(player.bornInNorthAmerica, true);
    assert.equal(player.birthCity, 'Calgary');
    assert.equal(player.fpts, null);
    assert.match(player.source!.url, /\/88\/landing$/);
    assert.equal(birthRegion('CHE'), false);
    assert.equal(birthRegion('MEX'), true);
    assert.equal(birthRegion('UNKNOWN'), null);
    const ambiguous = await lookupFeaturedPlayer('Same Name', async () => new Response(JSON.stringify([
        { name: 'Same Name', playerId: '1' }, { name: 'Same Name', playerId: '2' },
    ])));
    assert.equal(ambiguous.nhlId, null);
    assert.equal(ambiguous.bornInNorthAmerica, null);
});

test('offline pilot packet is explicitly reference material, and malformed imports fail', () => {
    const packet = referencePacket(config, 2027);
    assert.equal(packet.kind, 'reference');
    assert.equal(packet.period, null);
    assert.deepEqual(packet.sources, []);
    assert.deepEqual(packet.matchups, []);
    assert.throws(() => parseFactPacket({ version: 1, kind: 'live' }), /Invalid facts/);
});
