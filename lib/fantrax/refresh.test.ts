// The production live season over Fantrax: what a refresh publishes, and what pages read afterwards. The live
// season's rules are covered over the in-memory source (live-season.test.ts) and Fantrax's response checks in
// fantrax-client.test.ts; this covers only the saved snapshot and Next's caches, which need Fantrax and Next stand-ins.
import assert from 'node:assert/strict';
import test from 'node:test';
import { disposableLeague } from '../testing/disposable-league';
import { FANTRAX_CURRENT_TAG } from './cache-policy';
import type { SavedLiveSeason } from './fantrax-client';
import type { LiveSeason } from './live-season';

const LEAGUE = 'league27';

/** Fantrax with a two-team league whose week 1 is regular season; `settled` decides its standings and scores. */
const fantrax = (settled: () => boolean, onRequest = () => {}): typeof fetch => async (input, options) => {
    onRequest();
    const url = new URL(String(input));
    switch (url.pathname.split('/').pop()) {
        case 'getLeagueInfo': return Response.json({ seasonYear: 2026, teamInfo: { a: { name: 'A' }, b: { name: 'B' } }, rosterPeriods: [],
            playoffs: { numPlayoffTeams: 6, lastRegularSeasonPeriod: 1, firstPlayoffPeriod: 2 },
            // Weeks 2–4 are the league's three playoff rounds, which leaves week 1 in the regular season.
            scoringPeriods: [{ number: 1, startDate: '2026-10-12T13:00:00-0400', endDate: '2026-10-19T18:59:59-0400' },
                ...[2, 3, 4].map(number => ({ number, startDate: `2026-11-0${number}T13:00:00-0400`, endDate: `2026-11-0${number}T18:59:59-0400` }))],
            matchups: [{ period: 1, matchupList: [{ away: { id: 'a' }, home: { id: 'b' } }] }] });
        case 'getTeamRosters': return Response.json({ period: 1, rosters: {} });
        case 'getStandings': return Response.json([{ teamId: 'a', rank: 1, points: settled() ? '1-0-0' : '0-0-0' }, { teamId: 'b', rank: 2, points: settled() ? '0-1-0' : '0-0-0' }]);
        case 'getPlayerIds': return Response.json({ p: { name: 'Player', position: 'C' } });
        case 'getMatchupScores': return Response.json({ period: 1, matchups: [{ away: { teamId: 'a', score: settled() ? 20 : 10, gamesPlayed: 1 }, home: { teamId: 'b', score: 5, gamesPlayed: 1 } }] });
        case 'req': {
            const request = JSON.parse(String(options?.body)).msgs[0].data;
            const season = { code: 'SEASON_current_YEAR_TO_DATE', name: '2026-27 Reg Season - YTD', timeframeTypeCode: 'YEAR_TO_DATE' };
            return Response.json({ responses: [{ data: { displayedStatusOrTeam: request.statusOrTeamFilter, displayedPosOrGroup: 'ALL', displayedSortType: 'SCORE',
                displayedSortReversed: false, displayedView: 'STATS', displayedScoringCategoryType: '5', displayedSeasonOrProjection: season, seasonOrProjections: [season],
                paginatedResultSet: { pageNumber: 1, totalNumResults: 1 }, tableHeader: { cells: [{ key: 'status' }, { key: 'fptsPerGame' }, { key: 'fpts' }] },
                statsTable: [{ scorer: { scorerId: 'p', name: 'Player', posShortNames: 'C' }, cells: [{ content: 'A', teamId: 'a' }, { content: '10' }, { content: '20' }] }] } }] });
        }
        default: throw Error(`Unexpected request ${url.pathname}`);
    }
};

test('a refresh publishes the live season without touching archive caches, and a failed save keeps the last snapshot', async t => {
    let settled = false, network = 0;
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: `
        insert into league.franchises (id, display_name, first_season) values (1, 'One', 2026), (2, 'Two', 2026);
        insert into league.fantrax_teams values (2027, '${LEAGUE}', 'a', 1), (2027, '${LEAGUE}', 'b', 2);
    `, fetch: fantrax(() => settled, () => network++) });
    const { client } = league;
    const now = Date.parse('2026-10-18T22:00:00Z');
    t.mock.method(Date, 'now', () => now);
    // The franchises have no team seasons yet, so the live teams fall back to their Fantrax names.
    t.mock.method(console, 'warn', () => {});
    const { getLiveSeason, getWeekScores, refreshLiveSeason } = await import('./live-season');
    const refresh = async () => {
        const { result, revalidatedTags } = await league.runAsRoute('/api/cron/fantrax', refreshLiveSeason);
        assert.deepEqual(revalidatedTags, [FANTRAX_CURRENT_TAG]);
        return result;
    };
    const season = async () => {
        const result = await getLiveSeason({ now });
        assert.equal(result.status, 'available');
        return (result as { value: LiveSeason }).value;
    };
    const savedSnapshot = async () => (await client.query<{ data: SavedLiveSeason }>('select data from league.fantrax_snapshots')).rows[0].data;

    assert.equal((await season()).weeks[0].phase, 'active');
    assert.equal((await getWeekScores(1))?.matchups[0].away.score, 10);
    // An archive page's read, which nothing in the live season reads again.
    const { getBannerSeasons } = await import('../data/league');
    const cachedBefore = new Set(league.cacheEntries().keys());
    await getBannerSeasons();
    const [archived] = [...league.cacheEntries().keys()].filter(key => !cachedBefore.has(key));
    settled = true;
    assert.equal((await refresh()).seasonYear, 2027);
    const afterRefresh = network;
    const live = await season();
    assert.equal(live.weeks[0].phase, 'final', 'the new standings settle week 1');
    assert.equal((await getWeekScores(1))?.matchups[0].away.score, 20, 'new standings cannot expose older scores');
    assert.equal(live.leaders.status === 'available' && live.leaders.value.players[0].points, 20);
    assert.equal(live.rosterStats.status === 'available' && live.rosterStats.value.players.p.points, 20);
    assert.equal(network, afterRefresh, 'the published snapshot serves without repeated Fantrax requests');
    assert.ok(league.cacheEntries().has(archived), 'the refresh leaves archived entries cached');

    const saved = await savedSnapshot();
    league.failNextQuery('insert into league.fantrax_snapshots', Error('save failed'));
    await assert.rejects(refresh(), /save failed/);
    assert.deepEqual(await savedSnapshot(), saved);
});

const SEED = `
    insert into league.franchises (id, display_name, first_season) values (1, 'One', 2026), (2, 'Two', 2026);
    insert into league.fantrax_teams values (2027, '${LEAGUE}', 'a', 1), (2027, '${LEAGUE}', 'b', 2);
`;

test('an overlapping older refresh cannot overwrite a newer snapshot', async t => {
    // The older refresh's league info is held back until the newer refresh has saved.
    let reachHold: () => void, release: () => void;
    const reached = new Promise<void>(resolve => reachHold = resolve);
    let hold: Promise<void> | null = new Promise(resolve => release = resolve);
    const fetchFantrax = fantrax(() => false);
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: SEED, fetch: async (input, options) => {
        if (hold && new URL(String(input)).pathname.endsWith('/getLeagueInfo')) {
            const held = hold;
            hold = null;
            reachHold();
            await held;
        }
        return fetchFantrax(input, options);
    } });
    t.mock.method(Date, 'now', () => Date.parse('2026-10-18T22:00:00Z'));
    t.mock.method(console, 'warn', () => {});
    const { refreshLiveSeason } = await import('./live-season');

    const older = league.runAsRoute('/api/cron/fantrax', refreshLiveSeason);
    await reached;
    // Capture times are the real clock's; let it move on so the newer capture is strictly later.
    await new Promise(resolve => setTimeout(resolve, 5));
    const newer = await league.runAsRoute('/api/cron/fantrax', refreshLiveSeason);
    release!();
    const overlapped = await older;
    assert.ok(overlapped.result.fetchedAt < newer.result.fetchedAt);
    const stored = (await league.client.query<{ data: SavedLiveSeason }>('select data from league.fantrax_snapshots')).rows;
    assert.deepEqual(stored.map(row => row.data.source.fetchedAt), [newer.result.fetchedAt]);
});

test('the live season reads the Fantrax league of the latest season in league.fantrax_teams', async t => {
    const requestedLeagues = new Set<string | null>();
    const fetchFantrax = fantrax(() => false);
    await disposableLeague(t, { app: true, nextCache: true, seed: `
        insert into league.franchises (id, display_name, first_season) values (1, 'One', 2026), (2, 'Two', 2026);
        insert into league.fantrax_teams values
            (2026, 'league26', 'a', 2), (2026, 'league26', 'b', 1),
            (2027, '${LEAGUE}', 'a', 1), (2027, '${LEAGUE}', 'b', 2);
    `, fetch: async (input, options) => {
        const url = new URL(String(input));
        if (url.searchParams.has('leagueId')) requestedLeagues.add(url.searchParams.get('leagueId'));
        return fetchFantrax(input, options);
    } });
    const now = Date.parse('2026-10-18T22:00:00Z');
    t.mock.method(Date, 'now', () => now);
    t.mock.method(console, 'warn', () => {});
    const { getLiveSeason } = await import('./live-season');
    const result = await getLiveSeason({ now });
    assert.equal(result.status, 'available');
    assert.equal((result as { value: LiveSeason }).value.fantraxLeagueId, LEAGUE);
    assert.deepEqual([...requestedLeagues], [LEAGUE]);
});

test('manual final weeks persist independently of archive seasons and are scoped to the league, season and week', async t => {
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: `${SEED}
        insert into league.fantrax_final_weeks (league_id, season_year, period) values
            ('another-league', 2027, 1), ('${LEAGUE}', 2026, 1), ('${LEAGUE}', 2027, 2);
    `, fetch: fantrax(() => false) });
    t.mock.method(Date, 'now', () => Date.parse('2026-10-18T22:00:00Z'));
    t.mock.method(console, 'warn', () => {});
    const { setWeekFinal } = await import('./live-season');
    const mark = (final: boolean) => league.runAsRoute('/api/admin/fantrax', () => setWeekFinal(1, final));
    const finals = async () => (await league.client.query<{ league_id: string; season_year: number; period: number }>(
        'select league_id, season_year, period from league.fantrax_final_weeks order by league_id, season_year, period')).rows;
    const others = [
        { league_id: 'another-league', season_year: 2027, period: 1 },
        { league_id: LEAGUE, season_year: 2026, period: 1 },
        { league_id: LEAGUE, season_year: 2027, period: 2 },
    ];

    await mark(true); await mark(true);
    assert.deepEqual(await finals(), [others[0], others[1], { league_id: LEAGUE, season_year: 2027, period: 1 }, others[2]]);
    await mark(false);
    assert.deepEqual(await finals(), others);
});

test('one read of the live season looks up the saved snapshot once, in season, preseason and fresh', async t => {
    let now = Date.parse('2026-10-18T22:00:00Z');
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: SEED, fetch: fantrax(() => false) });
    t.mock.method(Date, 'now', () => now);
    t.mock.method(console, 'warn', () => {});
    const { getLiveSeason, refreshLiveSeason } = await import('./live-season');
    await league.runAsRoute('/api/cron/fantrax', refreshLiveSeason);
    const snapshotLookups = () => league.cacheReads().filter(read => read.key.includes('fantrax-saved-snapshot')).length;
    const read = async (fresh = false) => {
        const before = snapshotLookups();
        const result = await getLiveSeason({ now, fresh });
        assert.equal(result.status, 'available');
        return { live: (result as { value: LiveSeason }).value, lookups: snapshotLookups() - before };
    };

    const inSeason = await read();
    assert.equal(inSeason.live.currentWeek.phase, 'active');
    assert.equal(inSeason.live.scores.status === 'available' && inSeason.live.scores.value?.matchups[0].away.score, 10);
    assert.equal(inSeason.live.leaders.status === 'available' && inSeason.live.leaders.value.players[0].points, 20);
    assert.equal(inSeason.live.rosterStats.status === 'available' && inSeason.live.rosterStats.value.players.p.points, 20);
    assert.equal(inSeason.lookups, 1);

    now = Date.parse('2026-10-01T12:00:00Z');
    const preseason = await read();
    assert.equal(preseason.live.currentWeek.phase, 'upcoming');
    assert.equal(preseason.lookups, 1);

    // The keepers pages' read: the core comes straight from Fantrax, the rest from the saved snapshot.
    now = Date.parse('2026-10-18T22:00:00Z');
    const fresh = await read(true);
    assert.equal(fresh.live.leaders.status === 'available' && fresh.live.leaders.value.players[0].points, 20);
    assert.equal(fresh.lookups, 1);
});

test('a refresh and a final week keep the saved snapshot and final weeks rows in their stored shape', async t => {
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: SEED, fetch: fantrax(() => false) });
    t.mock.method(Date, 'now', () => Date.parse('2026-10-18T22:00:00Z'));
    const { setWeekFinal } = await import('./live-season');
    // Marking a week final refreshes first, so this one route saves both.
    await league.runAsRoute('/api/admin/fantrax', () => setWeekFinal(1, true));
    const { data } = (await league.client.query<{ data: SavedLiveSeason }>('select data from league.fantrax_snapshots')).rows[0];
    // Every capture time is when the test ran, so only its form is checked.
    const stored = JSON.parse(JSON.stringify(data, (key, value) => {
        if (key !== 'fetchedAt') return value;
        assert.ok(!Number.isNaN(Date.parse(value)), `fetchedAt ${value}`);
        return 'captured';
    }));
    // Raw Fantrax responses, in Fantrax's own periods and dates; only the season year is converted. Week scores
    // are keyed and labelled by period.
    assert.deepEqual(stored, {
        source: {
            fetchedAt: 'captured',
            info: {
                seasonYear: 2027, teamInfo: { a: { name: 'A' }, b: { name: 'B' } }, rosterPeriods: [],
                playoffs: { numPlayoffTeams: 6, lastRegularSeasonPeriod: 1, firstPlayoffPeriod: 2 },
                scoringPeriods: [{ number: 1, startDate: '2026-10-12T13:00:00-0400', endDate: '2026-10-19T18:59:59-0400' },
                    ...[2, 3, 4].map(number => ({ number, startDate: `2026-11-0${number}T13:00:00-0400`, endDate: `2026-11-0${number}T18:59:59-0400` }))],
                matchups: [{ period: 1, matchupList: [{ away: { id: 'a' }, home: { id: 'b' } }] }],
            },
            rosters: { period: 1, rosters: {} },
            standings: [{ teamId: 'a', rank: 1, points: '0-0-0' }, { teamId: 'b', rank: 2, points: '0-0-0' }],
        },
        scores: { 1: { fetchedAt: 'captured', period: 1, matchups: [{ away: { teamId: 'a', score: 10, gamesPlayed: 1 }, home: { teamId: 'b', score: 5, gamesPlayed: 1 } }] } },
        leaders: { fetchedAt: 'captured', players: [{ id: 'p', name: 'Player', position: 'C', points: 20, perGame: 10, teamId: 'a', team: 'A', archiveId: null }] },
        rosterStats: { fetchedAt: 'captured', players: { p: { points: 20, perGame: 10 } } },
    });
    const finals = await league.client.query<{ league_id: string; season_year: number; period: number }>('select * from league.fantrax_final_weeks');
    assert.deepEqual(finals.fields.map(field => field.name), ['league_id', 'season_year', 'period', 'marked_at']);
    assert.deepEqual(finals.rows.map(({ league_id, season_year, period }) => ({ league_id, season_year, period })), [{ league_id: LEAGUE, season_year: 2027, period: 1 }]);
});
