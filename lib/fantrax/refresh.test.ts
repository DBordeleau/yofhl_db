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

test('a refresh publishes the live season without touching archive caches, and a failed save keeps the last snapshot', async t => {
    let settled = false, network = 0;
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: `
        insert into league.franchises (id, display_name, first_season) values (1, 'One', 2026), (2, 'Two', 2026);
        insert into league.fantrax_teams values (2027, '${LEAGUE}', 'a', 1), (2027, '${LEAGUE}', 'b', 2);
    `, fetch: async (input, options) => {
        network++;
        const url = new URL(String(input));
        switch (url.pathname.split('/').pop()) {
            case 'getLeagueInfo': return Response.json({ seasonYear: 2026, teamInfo: { a: { name: 'A' }, b: { name: 'B' } }, rosterPeriods: [],
                playoffs: { numPlayoffTeams: 6, lastRegularSeasonPeriod: 1, firstPlayoffPeriod: 2 },
                // Weeks 2–4 are the league's three playoff rounds, which leaves week 1 in the regular season.
                scoringPeriods: [{ number: 1, startDate: '2026-10-12T13:00:00-0400', endDate: '2026-10-19T18:59:59-0400' },
                    ...[2, 3, 4].map(number => ({ number, startDate: `2026-11-0${number}T13:00:00-0400`, endDate: `2026-11-0${number}T18:59:59-0400` }))],
                matchups: [{ period: 1, matchupList: [{ away: { id: 'a' }, home: { id: 'b' } }] }] });
            case 'getTeamRosters': return Response.json({ period: 1, rosters: {} });
            case 'getStandings': return Response.json([{ teamId: 'a', rank: 1, points: settled ? '1-0-0' : '0-0-0' }, { teamId: 'b', rank: 2, points: settled ? '0-1-0' : '0-0-0' }]);
            case 'getPlayerIds': return Response.json({ p: { name: 'Player', position: 'C' } });
            case 'getMatchupScores': return Response.json({ period: 1, matchups: [{ away: { teamId: 'a', score: settled ? 20 : 10, gamesPlayed: 1 }, home: { teamId: 'b', score: 5, gamesPlayed: 1 } }] });
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
    } });
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

test('an overlapping older refresh cannot overwrite a newer snapshot', async t => {
    const { db, client } = await disposableLeague(t);
    // Imported late: Next's cache modules need the AsyncLocalStorage stand-in installed first.
    const { saveSnapshotQuery } = await import('./snapshot-store');
    const snapshot = (fetchedAt: string) => ({ source: { fetchedAt } }) as SavedLiveSeason;
    await db.execute(saveSnapshotQuery(LEAGUE, snapshot('2026-10-18T22:00:00.000Z')));
    await db.execute(saveSnapshotQuery(LEAGUE, snapshot('2026-01-01T00:00:00.000Z')));
    const stored = (await client.query<{ data: SavedLiveSeason }>('select data from league.fantrax_snapshots')).rows;
    assert.deepEqual(stored.map(row => row.data.source.fetchedAt), ['2026-10-18T22:00:00.000Z']);
});
