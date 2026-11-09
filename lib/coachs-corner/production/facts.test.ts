import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureFacts, lookupFeaturedPlayer, birthRegion, parseFactPacket, referencePacket, selectRecapPeriod, withStudioTeams, type FactPacket } from './facts';
import type { StudioTeam } from '../teams';
import type { LeagueConfig } from '../../../scripts/db/lib/league-config';

const config: LeagueConfig = { franchises: [
    { id: 1, eras: [{ from: 2027, name: 'Home Team', abbreviations: ['HOME'], owner: 'Home Owner' }] },
    { id: 2, eras: [{ from: 2027, name: 'Away Team', abbreviations: ['AWAY'], owner: 'Away Owner' }] },
], awards: [], seasons: {
    2026: { fantrax: { league: 'olderleague', teams: {} } },
    2027: { fantrax: { league: 'liveleague', teams: { h: 1, a: 2 } } },
}, scoreOverrides: [] };

// the studio team list: the database's current identity, which an owner has renamed away from league.yml's
const studio: StudioTeam[] = [
    { id: 1, name: 'Home Renamed', abbreviation: 'HOMR', owner: 'Home Owner', ownerFirst: 'Home', logo: '/team-logos/1/new.webp', primary: '#123ABC', secondary: '#D24015' },
    { id: 2, name: 'Away Team', abbreviation: 'AWAY', owner: 'Away Owner', ownerFirst: 'Away', logo: null, primary: '#26365F', secondary: '#C8102E' },
];

const fixtures = () => ({
    getLeagueInfo: { seasonYear: 2026, teamInfo: { h: { name: 'Home Team' }, a: { name: 'Away Team' } },
        scoringPeriods: [{ number: 7, startDate: '2026-01-01T00:00:00-0500', endDate: '2026-01-08T00:00:00-0500' }],
        rosterPeriods: [{ number: 81, startDate: '2026-01-07T00:00:00-0500', endDate: '2026-01-08T00:00:00-0500' }],
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

// what the packet says about a team besides its colours
const identity = ({ id, name, abbreviation, owner, ownerFirst, logo, fantraxId, rank, record, points }: FactPacket['teams'][number]) =>
    ({ id, name, abbreviation, owner, ownerFirst, logo, fantraxId, rank, record, points });
const withTeams = (teams: Record<string, number>, league = 'liveleague'): LeagueConfig => ({ ...config, seasons: { ...config.seasons, 2027: { fantrax: { league, teams } } } });

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
    const before = await captureFacts(config, { teams: studio, recap: true, fetcher: mockFetch(data) });
    assert.equal(before.period?.number, 1);
    assert.equal(before.phase, 'active');
    assert.match(before.limitations[0], /2026-10-12 through 2026-10-18.*does not confirm final scores/);
    t.mock.timers.setTime(Date.parse('2026-10-19T18:59:59-04:00'));
    assert.equal((await captureFacts(config, { teams: studio, recap: true, fetcher: mockFetch(data) })).phase, 'active');
    t.mock.timers.setTime(Date.parse('2026-10-19T19:00:00-04:00'));
    const after = await captureFacts(config, { teams: studio, recap: true, fetcher: mockFetch(data) });
    assert.equal(after.period?.number, 1);
    assert.equal(after.phase, 'complete');
    data.getMatchupScores.period = 2;
    assert.equal((await captureFacts(config, { teams: studio, fetcher: mockFetch(data) })).period?.number, 2);
});

test('conflicting explicit recap period fails before sources are fetched', async () => {
    const calls: string[] = [];
    await assert.rejects(captureFacts(config, { teams: studio, recap: true, period: 1, fetcher: mockFetch(fixtures(), calls) }), /Choose --recap or --period/);
    assert.deepEqual(calls, []);
});

test('Sunday production can select Monday air date without changing live source times or phase', async t => {
    const now = '2026-10-18T23:30:00-04:00';
    t.mock.timers.enable({ apis: ['Date'], now: new Date(now) });
    const data = fixtures();
    data.getLeagueInfo.scoringPeriods = weeklyPeriods;
    data.getLeagueInfo.matchups[0].period = 1;
    data.getMatchupScores.period = 1;
    const packet = await captureFacts(config, { teams: studio, recap: true, airDate: '2026-10-19', fetcher: mockFetch(data) });
    assert.equal(packet.period?.number, 1);
    assert.equal(packet.phase, 'active');
    assert.equal(packet.captureStartedAt, new Date(now).toISOString());
    assert.ok(packet.sources.every(source => source.fetchedAt === packet.captureStartedAt));
    assert.match(packet.limitations[0], /2026-10-12 through 2026-10-18/);
    for (const airDate of ['', '2026-02-30', 'tomorrow']) {
        await assert.rejects(captureFacts(config, { teams: studio, recap: true, airDate, fetcher: mockFetch(data) }), /valid YYYY-MM-DD/);
    }
});

test('fresh capture preserves score units, missing categories, provenance and distinct roster calendar', async () => {
    const calls: string[] = [];
    const packet = await captureFacts(config, { teams: studio, period: 7, fetcher: mockFetch(fixtures(), calls) });
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

test('sources are exactly the requests that came back OK, in request order, timed when each response arrived', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-09T12:00:00Z') });
    const fantrax = mockFetch(fixtures());
    const nhl: Record<string, unknown> = {
        'https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20&q=William+Nylander': [{ name: 'William Nylander', playerId: '88' }],
        'https://api-web.nhle.com/v1/player/88/landing': { playerId: 88, firstName: { default: 'William' }, lastName: { default: 'Nylander' }, birthCountry: 'SWE' },
    };
    // The league requests answer in reverse, so arrival order isn't request order. Each arrival moves the clock a minute.
    const ticks: Record<string, number> = { getLeagueInfo: 4, getTeamRosters: 3, getStandings: 2, getPlayerIds: 1 };
    let arrivals = 0;
    const fetcher: typeof fetch = async (input, init) => {
        const url = String(input);
        for (let i = 0; i < (ticks[new URL(url).pathname.split('/').at(-1)!] ?? 1); i++) await new Promise(setImmediate);
        t.mock.timers.setTime(Date.parse('2026-01-09T12:00:00Z') + ++arrivals * 60_000);
        if (url.includes('nhle.com')) return nhl[url] ? new Response(JSON.stringify(nhl[url])) : new Response('Unavailable', { status: 503 });
        return fantrax(input, init);
    };
    const packet = await captureFacts(config, { teams: studio, period: 7, players: ['William Nylander', 'Unknown Prospect'], fetcher });
    const fantraxUrl = 'https://www.fantrax.com/fxea/general/';
    assert.deepEqual(packet.sources, [
        { url: `${fantraxUrl}getLeagueInfo?leagueId=liveleague&excludePlayerInfo=true`, fetchedAt: '2026-01-09T12:04:00.000Z' },
        { url: `${fantraxUrl}getTeamRosters?leagueId=liveleague`, fetchedAt: '2026-01-09T12:03:00.000Z' },
        { url: `${fantraxUrl}getStandings?leagueId=liveleague`, fetchedAt: '2026-01-09T12:02:00.000Z' },
        { url: `${fantraxUrl}getPlayerIds?sport=NHL`, fetchedAt: '2026-01-09T12:01:00.000Z' },
        { url: `${fantraxUrl}getMatchupScores?leagueId=liveleague&period=7`, fetchedAt: '2026-01-09T12:05:00.000Z' },
        { url: 'https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20&q=William+Nylander', fetchedAt: '2026-01-09T12:06:00.000Z' },
        { url: 'https://api-web.nhle.com/v1/player/88/landing', fetchedAt: '2026-01-09T12:07:00.000Z' },
    ]);
    assert.deepEqual(packet.players[0].source, { url: 'https://api-web.nhle.com/v1/player/88/landing', fetchedAt: '2026-01-09T12:07:00.000Z' });
    assert.equal(packet.players[1].source, null);
});

test('a Fantrax team the season map does not cover stops the export, naming the team and the league.yml key', async () => {
    await assert.rejects(captureFacts(withTeams({ a: 2 }), { teams: studio, period: 7, fetcher: mockFetch(fixtures()) }),
        /Fantrax team "Home Team" \(h\) has no franchise.*seasons\.2027\.fantrax\.teams/);
});

test("the export uses the map for the season Fantrax reports, and only when it names the fetched league", async () => {
    // 2028 holds the live league, but Fantrax reports 2027
    const live = { league: 'liveleague', teams: { h: 1, a: 2 } };
    await assert.rejects(captureFacts({ ...config, seasons: { 2028: { fantrax: live } } }, { teams: studio, period: 7, fetcher: mockFetch(fixtures()) }),
        /no fantrax block for 2026–27.*seasons\.2027\.fantrax/);
    await assert.rejects(captureFacts({ ...config, seasons: { 2027: { fantrax: { ...live, league: 'otherleague' } }, 2028: { fantrax: live } } },
        { teams: studio, period: 7, fetcher: mockFetch(fixtures()) }), /seasons\.2027\.fantrax\.league is otherleague, but the export fetched liveleague/);
});

test('a map entry naming an unknown franchise, one with no team season, or one already mapped stops the export, naming the league.yml key', async () => {
    const capture = (teams: Record<string, number>, franchises = config.franchises) =>
        captureFacts({ ...withTeams(teams), franchises }, { teams: studio, period: 7, fetcher: mockFetch(fixtures()) });
    await assert.rejects(capture({ h: 99, a: 2 }), /Fantrax team "Home Team" \(h\) maps to franchise 99, which isn't in league\/league\.yml's franchises.*seasons\.2027\.fantrax\.teams/);
    const later = { id: 3, eras: [{ from: 2030, name: 'Expansion Team', abbreviations: ['EXP'] }] };
    const folded = { id: 4, folded: 2025, eras: [{ from: 2020, name: 'Gone Team', abbreviations: ['GONE'] }] };
    for (const franchise of [later, folded]) {
        await assert.rejects(capture({ h: franchise.id, a: 2 }, [...config.franchises, franchise]),
            new RegExp(`Fantrax team "Home Team" \\(h\\) maps to franchise ${franchise.id}, which has no team season in 2026–27.*seasons\\.2027\\.fantrax\\.teams`));
    }
    await assert.rejects(capture({ h: 2, a: 2 }), /Fantrax teams h and a are both mapped to franchise 2 for 2026–27.*seasons\.2027\.fantrax\.teams/);
});

test("map entries for Fantrax teams that Fantrax didn't return are ignored", async () => {
    const packet = await captureFacts(withTeams({ h: 1, a: 2, departed: 99, leftover: 1 }), { teams: studio, period: 7, fetcher: mockFetch(fixtures()) });
    assert.deepEqual(packet.teams.map(team => [team.fantraxId, team.id]), [['h', 1], ['a', 2]]);
});

test("the roster's lineup period is the core snapshot's, or null when Fantrax's roster periods don't include it", async () => {
    const data = fixtures();
    data.getTeamRosters.period = 82;
    assert.equal((await captureFacts(config, { teams: studio, period: 7, fetcher: mockFetch(data) })).rosterPeriod, null);
});

test("the export reads the latest season's Fantrax league from league.yml", async () => {
    const calls: string[] = [];
    const packet = await captureFacts(config, { teams: studio, period: 7, fetcher: mockFetch(fixtures(), calls) });
    assert.equal(packet.leagueId, 'liveleague');
    assert.ok(calls.filter(url => !url.includes('getPlayerIds')).every(url => new URL(url).searchParams.get('leagueId') === 'liveleague'));
    assert.equal(referencePacket(config, 2027, studio).leagueId, 'liveleague');
    await assert.rejects(captureFacts({ ...config, seasons: {} }, { teams: studio, period: 7, fetcher: mockFetch(fixtures()) }), /fantrax/);
});

test('unknown periods stop export instead of fabricating a week', async () => {
    await assert.rejects(captureFacts(config, { teams: studio, period: 99, fetcher: mockFetch(fixtures()) }), /Unknown scoring period/);
});

test("teams resolve by Fantrax team ID through the season's map, and show the studio team list's identity and colours", async () => {
    const data = fixtures();
    data.getLeagueInfo.teamInfo.h.name = 'Renamed On Fantrax';
    const packet = await captureFacts(config, { teams: studio, period: 7, fetcher: mockFetch(data) });
    assert.deepEqual(packet.teams, [
        { ...studio[0], fantraxId: 'h', rank: 1, record: '1-0', points: 24 },
        { ...studio[1], fantraxId: 'a', rank: 2, record: '0-1', points: 20 },
    ], 'never league.yml\'s Home Team / HOME, and never the suggested palettes');
    assert.deepEqual(packet.rosters.map(r => r.teamId), ['h', 'a']);
    assert.match(packet.limitations.join(' '), /database's current identity at capture time/);
});

test('a franchise the Fantrax map covers but the studio team list lacks stops the capture', async () => {
    await assert.rejects(captureFacts(config, { teams: studio.slice(1), period: 7, fetcher: mockFetch(fixtures()) }),
        /Fantrax team "Home Team" \(h\) is franchise 1, which isn't an active franchise in the database's current teams/);
});

test('an active franchise with no Fantrax team is still on the packet, so the draft check sees the whole list', async () => {
    const packet = await captureFacts(config, { teams: [...studio, { ...studio[1], id: 3, name: 'Third Team', abbreviation: 'THRD' }], period: 7, fetcher: mockFetch(fixtures()) });
    assert.deepEqual(packet.teams.map(identity).at(-1), { id: 3, name: 'Third Team', abbreviation: 'THRD', owner: 'Away Owner', ownerFirst: 'Away', logo: null, fantraxId: '', rank: null, record: null, points: null });
    assert.deepEqual(packet.rosters.map(r => r.teamId), ['h', 'a'], 'rosters are for Fantrax teams only');
});

test('recapturing the team list keeps each franchise\'s Fantrax fields and picks up a rename', async () => {
    const packet = await captureFacts(config, { teams: studio, period: 7, fetcher: mockFetch(fixtures()) });
    const renamed = [{ ...studio[0], name: 'Home Again', abbreviation: 'HAGN' }, studio[1]];
    const refreshed = withStudioTeams(packet, renamed);
    assert.deepEqual(refreshed.teams.map(identity), [
        { id: 1, name: 'Home Again', abbreviation: 'HAGN', owner: 'Home Owner', ownerFirst: 'Home', logo: '/team-logos/1/new.webp', fantraxId: 'h', rank: 1, record: '1-0', points: 24 },
        { id: 2, name: 'Away Team', abbreviation: 'AWAY', owner: 'Away Owner', ownerFirst: 'Away', logo: null, fantraxId: 'a', rank: 2, record: '0-1', points: 20 },
    ]);
    assert.deepEqual({ ...refreshed, teams: packet.teams }, packet, 'nothing else changes');
    assert.throws(() => withStudioTeams(packet, renamed.slice(1)), /franchise 1, which isn't an active franchise/);
});

test('duplicate teams and missing rosters reject the packet', async () => {
    const duplicate = fixtures();
    duplicate.getMatchupScores.matchups[0].home.teamId = 'a';
    await assert.rejects(captureFacts(config, { teams: studio, period: 7, fetcher: mockFetch(duplicate) }), /Invalid matchup/);
    const missing = fixtures();
    Reflect.deleteProperty(missing.getTeamRosters.rosters, 'h');
    await assert.rejects(captureFacts(config, { teams: studio, period: 7, fetcher: mockFetch(missing) }), /Missing roster/);
});

test('missing standings, unknown players, unknown matchup teams and impossible games played reject the packet', async () => {
    const capture = (change: (data: ReturnType<typeof fixtures>) => void) => {
        const data = fixtures();
        change(data);
        return captureFacts(config, { teams: studio, period: 7, fetcher: mockFetch(data) });
    };
    await assert.rejects(capture(data => { data.getStandings.pop(); }), /Missing standings for Away Team/);
    await assert.rejects(capture(data => { data.getStandings[0].points = undefined as unknown as string; }), /Missing standings for Home Team/);
    await assert.rejects(capture(data => { Reflect.deleteProperty(data.getPlayerIds, 'p1'); data.getPlayerIds = { ...data.getPlayerIds, p2: { name: 'Other, Player', position: 'D', team: 'MTL' } } as typeof data.getPlayerIds; }),
        /Missing player directory entry p1/);
    await assert.rejects(capture(data => { data.getMatchupScores.matchups[0].away.teamId = 'stranger'; }), /Invalid matchup team/);
    for (const gamesPlayed of [2.5, -1]) {
        await assert.rejects(capture(data => { data.getMatchupScores.matchups[0].home.gamesPlayed = gamesPlayed; }), /Invalid matchup team, score or player games/);
    }
});

test('future periods have no invented results and source failure rejects capture', async () => {
    const data = fixtures();
    data.getLeagueInfo.scoringPeriods[0].startDate = '2099-01-01T00:00:00Z';
    data.getLeagueInfo.scoringPeriods[0].endDate = '2099-01-08T00:00:00Z';
    const calls: string[] = [];
    const packet = await captureFacts(config, { teams: studio, fetcher: mockFetch(data, calls) });
    assert.equal(packet.phase, 'upcoming');
    assert.deepEqual(packet.matchups, []);
    assert.equal(packet.scheduledMatchups.length, 1);
    assert.equal(calls.length, 4);
    await assert.rejects(captureFacts(config, { teams: studio, fetcher: async () => new Response('Unavailable', { status: 503 }) }), /^Error: Fantrax \w+ returned 503$/);
});

test('partial scores are rejected and unavailable NHL players remain visible in the inventory', async () => {
    const data = fixtures();
    data.getLeagueInfo.matchups[0].matchupList.push({ away: { id: 'other-away' }, home: { id: 'other-home' } });
    await assert.rejects(captureFacts(config, { teams: studio, period: 7, fetcher: mockFetch(data) }), /published schedule/);
    const base = mockFetch(fixtures());
    const packet = await captureFacts(config, { teams: studio, period: 7, players: ['Unknown Prospect'], fetcher: (input, init) =>
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

test('the reference packet lists the studio team list, with no Fantrax fields', () => {
    const packet = referencePacket(config, 2027, studio);
    assert.deepEqual(packet.teams, studio.map(team => ({ ...team, fantraxId: '', rank: null, record: null, points: null })));
});

test('offline pilot packet is explicitly reference material, and malformed imports fail', () => {
    const packet = referencePacket(config, 2027, studio);
    assert.equal(packet.kind, 'reference');
    assert.equal(packet.period, null);
    assert.deepEqual(packet.sources, []);
    assert.deepEqual(packet.matchups, []);
    assert.throws(() => parseFactPacket({ version: 1, kind: 'live' }), /Invalid facts/);
});
