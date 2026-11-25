// The NHL module through its interface, against a fake fetcher serving recorded NHL answers (fixtures/, recorded
// 2026-11-24 and trimmed to the fields and search hits that matter).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNhl } from './create-nhl';
import { ageOn } from './model';
import searchAho from './fixtures/search-aho.json';
import searchMurray from './fixtures/search-murray.json';
import searchOReilly from './fixtures/search-oreilly.json';
import searchStutzle from './fixtures/search-stutzle.json';
import landingAllen from './fixtures/landing-8474596.json';
import landingOReilly from './fixtures/landing-8475158.json';
import landingOtherOReilly from './fixtures/landing-8481026.json';
import gameLogAllen from './fixtures/game-log-8474596-20232024.json';

const SEARCH = 'https://search.d3.nhle.com/api/v1/search/player';
const LANDING = /^https:\/\/api-web\.nhle\.com\/v1\/player\/(\d+)\/landing$/;
const GAME_LOG = /^https:\/\/api-web\.nhle\.com\/v1\/player\/(\d+\/game-log\/\d+)\/2$/;
const loose = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

/** the NHL's recorded answers: searches by the name asked for, profiles by NHL identity, regular-season game logs by
 * `<NHL identity>/game-log/<NHL season ID>` */
function recordedNhl(overrides: { searches?: Record<string, unknown>; profiles?: Record<number, unknown>; gameLogs?: Record<string, unknown> } = {}) {
    const searches: Record<string, unknown> = {
        [loose("Ryan O'Reilly")]: searchOReilly, [loose('Matt Murray')]: searchMurray,
        [loose('Tim Stutzle')]: searchStutzle, [loose('Sebastian Aho')]: searchAho,
        ...overrides.searches,
    };
    const profiles: Record<number, unknown> = { 8474596: landingAllen, 8475158: landingOReilly, 8481026: landingOtherOReilly, ...overrides.profiles };
    const gameLogs: Record<string, unknown> = { '8474596/game-log/20232024': gameLogAllen, ...overrides.gameLogs };
    const requests: string[] = [];
    const fetcher = async (url: string) => {
        requests.push(url);
        if (url.startsWith(`${SEARCH}?`)) {
            const answer = searches[loose(new URL(url).searchParams.get('q') ?? '')];
            return new Response(JSON.stringify(answer ?? []));
        }
        const profile = LANDING.exec(url);
        if (profile && profiles[Number(profile[1])] !== undefined) return new Response(JSON.stringify(profiles[Number(profile[1])]));
        const log = GAME_LOG.exec(url);
        if (log && gameLogs[log[1]] !== undefined) return new Response(JSON.stringify(gameLogs[log[1]]));
        return new Response('Not found', { status: 404 });
    };
    return { nhl: createNhl({ fetcher }), fetcher, requests };
}

test('a player is identified by their exact name', async () => {
    const { nhl } = recordedNhl();
    assert.equal(await nhl.identify({ name: 'Sebastian Aho', positions: ['C'] }), 8478427);
});

test('names compare exactly once accents and punctuation are stripped, never by closeness', async () => {
    const { nhl } = recordedNhl();
    assert.equal(await nhl.identify({ name: 'Tim Stutzle', positions: ['C'], nhlTeam: 'OTT' }), 8482116);
    assert.equal(await nhl.identify({ name: 'Ryan OReilly', positions: ['C'], nhlTeam: 'NSH' }), 8475158);
    assert.equal(await nhl.identify({ name: 'Tom Stutzle', positions: ['C'], nhlTeam: 'OTT' }), null);
    assert.equal(await nhl.identify({ name: 'Tim Stutz', positions: ['C'], nhlTeam: 'OTT' }), null);
});

test('same-name players are told apart by position group, a player with several groups matching one candidate in any', async () => {
    const { nhl } = recordedNhl();
    // a centre for Carolina and a defenceman last with Pittsburgh
    assert.equal(await nhl.identify({ name: 'Sebastian Aho', positions: ['D'] }), 8480222);
    assert.equal(await nhl.identify({ name: 'Sebastian Aho', positions: ['LW', 'C'] }), 8478427);
    assert.equal(await nhl.identify({ name: 'Sebastian Aho', positions: ['G'] }), null);
    // both fit a forward-and-defenceman, so only the team can tell them apart
    assert.equal(await nhl.identify({ name: 'Sebastian Aho', positions: ['C', 'D'] }), null);
    assert.equal(await nhl.identify({ name: 'Sebastian Aho', positions: ['C', 'D'], nhlTeam: 'PIT' }), 8480222);
});

test('same-name players in one position group are told apart by current or last NHL team', async () => {
    const { nhl } = recordedNhl();
    // two goalies: one on no team now, last with Seattle, and one with Nashville
    assert.equal(await nhl.identify({ name: 'Matt Murray', positions: ['G'], nhlTeam: 'SEA' }), 8476899);
    assert.equal(await nhl.identify({ name: 'Matt Murray', positions: ['G'], nhlTeam: 'NSH' }), 8483575);
    // two forwards: a centre with Nashville and a right wing last with Detroit
    assert.equal(await nhl.identify({ name: "Ryan O'Reilly", positions: ['RW'], nhlTeam: 'DET' }), 8481026);
});

test('same-name players nothing tells apart, or more than one match, are no NHL identity', async () => {
    const { nhl } = recordedNhl();
    assert.equal(await nhl.identify({ name: 'Matt Murray', positions: ['G'] }), null);
    assert.equal(await nhl.identify({ name: 'Matt Murray', positions: ['G'], nhlTeam: 'TOR' }), null);
    assert.equal(await nhl.identify({ name: "Ryan O'Reilly", positions: ['C'] }), null);
    assert.equal(await nhl.identify({ name: 'Sebastian Aho' }), null);
    // a known team always narrows: a lone name match on another current and last team is no identity
    assert.equal(await nhl.identify({ name: 'Tim Stutzle', positions: ['C'], nhlTeam: 'TOR' }), null);
    assert.equal(await nhl.identify({ name: 'Tim Stutzle', positions: ['C'], nhlTeam: 'OTT' }), 8482116);
    // a name only, as for a featured player: unique exact-name matching
    assert.equal(await nhl.identify({ name: 'Tim Stützle' }), 8482116);
    assert.equal(await nhl.identify({ name: 'Nobody Atall' }), null);
});

test("a Player ID with a verified identity is that identity, without searching", async () => {
    const { nhl, requests } = recordedNhl();
    // the search would find the Nashville centre; the league has verified this Player ID as the other O'Reilly
    assert.equal(await nhl.identify({ name: "Ryan O'Reilly", playerId: '04qz4', positions: ['C'], nhlTeam: 'NSH' }), 8481026);
    assert.deepEqual(requests, []);
    // a Player ID with no verified identity is searched for
    assert.equal(await nhl.identify({ name: 'Tim Stutzle', playerId: '0abcd', positions: ['C'] }), 8482116);
    assert.equal(requests.length, 1);
});

test('the player search is asked for 100 results', async () => {
    const { nhl, requests } = recordedNhl();
    await nhl.identify({ name: "Ryan O'Reilly", positions: ['C'], nhlTeam: 'NSH' });
    assert.deepEqual(requests, ['https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=100&q=Ryan+O%27Reilly']);
});

test('a failed or unexpected player search throws', async () => {
    const answering = (response: () => Response) => createNhl({ fetcher: async () => response() });
    const player = { name: 'Tim Stutzle', positions: ['C'] };
    await assert.rejects(answering(() => new Response('Unavailable', { status: 503 })).identify(player), /503/);
    await assert.rejects(answering(() => new Response('Too many', { status: 429 })).identify(player), /429/);
    await assert.rejects(answering(() => new Response(JSON.stringify({ error: 'nope' }))).identify(player), /unexpectedly/);
    await assert.rejects(answering(() => new Response(JSON.stringify([{ playerId: '1' }]))).identify(player), /unexpectedly/);
    await assert.rejects(answering(() => new Response('<html>')).identify(player));
    await assert.rejects(createNhl({ fetcher: () => Promise.reject(new TypeError('fetch failed')) }).identify(player), /fetch failed/);
});

test('a player is read from their NHL profile', async () => {
    const { nhl, requests } = recordedNhl();
    const { seasons, ...player } = await nhl.player(8475158);
    assert.deepEqual(player, {
        nhlId: 8475158, name: "Ryan O'Reilly", birthDate: '1991-02-07', birthCountry: 'CAN', birthCity: 'Clinton',
        headshot: 'https://assets.nhle.com/mugs/nhl/20262027/NSH/8475158.png', team: 'NSH', position: 'C',
    });
    assert.deepEqual(requests, ['https://api-web.nhle.com/v1/player/8475158/landing']);
    assert.ok(seasons);
});

test('NHL regular-season lines are keyed by season year, playoffs and other leagues left out', async () => {
    const { seasons } = await recordedNhl().nhl.player(8475158);
    // the 2009-10 season to the 2026-27 season so far, with the 2012-13 lockout's shortened season and none skipped
    assert.deepEqual(Object.keys(seasons!).map(Number), Array.from({ length: 18 }, (_, index) => 2010 + index));
    // 2023-24: 82 games for Nashville, not the 6 playoff games
    assert.deepEqual(seasons![2024], { games: 82, goals: 26, assists: 43, points: 69, wins: null, goalsAgainstAverage: null, savePercentage: null });
    // 2024-25: 79 games for Nashville, not the World Championship's 8 or the 4 Nations' 2
    assert.equal(seasons![2025].games, 79);
});

test('a season split between teams with no combined line is the team lines summed', async () => {
    const { nhl } = recordedNhl();
    // 2022-23: 40 games for St. Louis and 13 for Toronto, as the NHL's totals have it
    assert.deepEqual((await nhl.player(8475158)).seasons![2023], { games: 53, goals: 16, assists: 14, points: 30, wins: null, goalsAgainstAverage: null, savePercentage: null });
    // 2023-24: 21 games for Montreal and 13 for New Jersey; the NHL's totals have a 3.44 GAA and a .895 save percentage
    const line = (await nhl.player(8474596)).seasons![2024];
    assert.deepEqual({ ...line, goalsAgainstAverage: null, savePercentage: null }, { games: 34, goals: 0, assists: 1, points: null, wins: 12, goalsAgainstAverage: null, savePercentage: null });
    assert.equal(line.goalsAgainstAverage!.toFixed(2), '3.44');
    assert.equal(line.savePercentage!.toFixed(3), '0.895');
});

test("a season split between teams with a combined line is the NHL's combined line", async () => {
    const totals = landingAllen.seasonTotals;
    const combined = { ...totals.find(line => line.season === 20232024 && line.gameTypeId === 2)!, sequence: 3,
        gamesPlayed: 34, wins: 12, goalsAgainstAvg: 3.4426, savePctg: 0.8951, teamName: { default: '2 Teams' } };
    const { nhl } = recordedNhl({ profiles: { 8474596: { ...landingAllen, seasonTotals: [...totals, combined] } } });
    const line = (await nhl.player(8474596)).seasons![2024];
    assert.deepEqual([line.games, line.wins, line.goalsAgainstAverage, line.savePercentage], [34, 12, 3.4426, 0.8951]);
});

test("a stat the NHL didn't give is null, never zero", async () => {
    const totals = landingOReilly.seasonTotals.map(line => line.season === 20232024 && line.gameTypeId === 2 ? { ...line, goals: undefined } : line);
    const split = totals.map(line => line.season === 20222023 && line.sequence === 2 && line.gameTypeId === 2 ? { ...line, assists: null } : line);
    const { nhl } = recordedNhl({ profiles: { 8475158: { ...landingOReilly, seasonTotals: split } } });
    const { seasons } = await nhl.player(8475158);
    assert.equal(seasons![2024].goals, null);
    assert.equal(seasons![2024].points, 69);
    // a stat missing from one team's line leaves the summed line's stat missing too
    assert.equal(seasons![2023].assists, null);
    assert.equal(seasons![2023].goals, 16);
    // a goalie's line has no points
    assert.equal((await nhl.player(8474596)).seasons![2024].points, null);
});

test('a player with no NHL games has no seasons, and one with no season history or birth date has none to give', async () => {
    const { birthDate, team, seasons } = await recordedNhl().nhl.player(8481026);
    // the other Ryan O'Reilly: never played in the NHL and on no NHL team
    assert.deepEqual([birthDate, team, seasons], ['2000-03-21', null, {}]);
    const { seasonTotals: _, birthDate: __, ...bare } = landingOtherOReilly;
    const missing = await recordedNhl({ profiles: { 8481026: bare } }).nhl.player(8481026);
    assert.deepEqual([missing.birthDate, missing.seasons], [null, null]);
});

test('a profile for a different player than the one asked for throws', async () => {
    const { nhl } = recordedNhl({ profiles: { 8475158: landingOtherOReilly } });
    await assert.rejects(nhl.player(8475158), /8481026 when asked for 8475158/);
});

test('a failed or unexpected player profile throws', async () => {
    const profile = (answer: unknown) => recordedNhl({ profiles: { 8475158: answer } }).nhl.player(8475158);
    await assert.rejects(recordedNhl().nhl.player(8400000), /404/);
    await assert.rejects(profile([landingOReilly]), /unexpectedly/);
    await assert.rejects(profile({ ...landingOReilly, playerId: '8475158' }), /unexpectedly/);
    await assert.rejects(profile({ ...landingOReilly, lastName: undefined }), /unexpectedly/);
    await assert.rejects(profile({ ...landingOReilly, seasonTotals: { season: 20252026 } }), /unexpectedly/);
    await assert.rejects(profile({ ...landingOReilly, seasonTotals: [{ leagueAbbrev: 'NHL', gameTypeId: 2 }] }), /unexpectedly/);
    await assert.rejects(profile({ ...landingOReilly, seasonTotals: [{ leagueAbbrev: 'NHL', gameTypeId: 2, season: 2026 }] }), /unexpectedly/);
});

test("games before a date count earlier NHL regular seasons and that season's game log, not games on the date", async () => {
    const { nhl, requests } = recordedNhl();
    // Jake Allen before November 2, 2023: 395 regular-season games from 2012-13 to 2022-23 (not the playoffs or the
    // AHL), then 4 for Montreal that October; the November 2 game itself and later seasons don't count
    assert.equal(await nhl.gamesBefore(8474596, 2024, '2023-11-02'), 399);
    assert.deepEqual(requests, ['https://api-web.nhle.com/v1/player/8474596/landing', 'https://api-web.nhle.com/v1/player/8474596/game-log/20232024/2']);
    assert.equal(await nhl.gamesBefore(8474596, 2024, '2023-11-03'), 400);
    assert.equal(await nhl.gamesBefore(8474596, 2024, '2023-10-01'), 395);
});

test('games before a date in a season with no NHL games need no game log', async () => {
    const { nhl, requests } = recordedNhl();
    // 2013-14 Jake Allen spent in the AHL, after 15 games for St. Louis in 2012-13
    assert.equal(await nhl.gamesBefore(8474596, 2014, '2013-10-01'), 15);
    // the other Ryan O'Reilly has never played in the NHL
    assert.equal(await nhl.gamesBefore(8481026, 2026, '2025-10-01'), 0);
    assert.ok(requests.every(url => !url.includes('game-log')));
});

test("games before a date the NHL didn't give are null, and an unexpected game log throws", async () => {
    const missing = landingAllen.seasonTotals.map(line => line.season === 20142015 && line.gameTypeId === 2 ? { ...line, gamesPlayed: undefined } : line);
    assert.equal(await recordedNhl({ profiles: { 8474596: { ...landingAllen, seasonTotals: missing } } }).nhl.gamesBefore(8474596, 2024, '2023-11-02'), null);
    const { seasonTotals: _, ...bare } = landingAllen;
    assert.equal(await recordedNhl({ profiles: { 8474596: bare } }).nhl.gamesBefore(8474596, 2024, '2023-11-02'), null);
    const log = (answer: unknown) => recordedNhl({ gameLogs: { '8474596/game-log/20232024': answer } }).nhl.gamesBefore(8474596, 2024, '2023-11-02');
    await assert.rejects(log({ gameLog: { gameDate: '2023-10-11' } }), /game log answered unexpectedly/);
    await assert.rejects(log({ gameLog: [{ gameDate: 'Oct 11, 2023' }] }), /game log answered unexpectedly/);
    await assert.rejects(recordedNhl({ gameLogs: { '8474596/game-log/20232024': undefined } }).nhl.gamesBefore(8474596, 2024, '2023-11-02'), /404/);
});

test('a request that takes longer than the timeout fails', async () => {
    // a fetcher that answers only when its request is aborted, as fetch does
    const hanging = (_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    });
    const nhl = createNhl({ fetcher: hanging, timeoutMs: 20 });
    await assert.rejects(nhl.identify({ name: 'Tim Stutzle' }), { name: 'TimeoutError' });
    await assert.rejects(nhl.player(8475158), { name: 'TimeoutError' });
});

test('an age counts whole years, and a missing or malformed birth date has none', () => {
    assert.equal(ageOn('2000-10-05', '2026-10-04'), 25);
    assert.equal(ageOn('2000-10-04', '2026-10-04'), 26);
    assert.equal(ageOn('2000-02-29', '2026-02-28'), 25);
    assert.equal(ageOn(null, '2026-10-04'), null);
    assert.equal(ageOn('October 2000', '2026-10-04'), null);
});
