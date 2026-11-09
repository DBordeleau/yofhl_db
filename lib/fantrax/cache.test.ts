// Cache lifetimes of the production live season. Unknown and unstarted weeks are covered over the in-memory
// source (live-season.test.ts), and invalid responses and season years in fantrax-client.test.ts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { disposableLeague } from '../testing/disposable-league';
import { DAY, FANTRAX_CURRENT_TAG, FANTRAX_TAG, scoresAreArchived } from './cache-policy';

test('matchups refresh after the correction window, then reuse final scores until invalidated', async t => {
    const end = '2026-10-09T00:00:00.000Z';
    let now = Date.parse(end) + DAY * 1000;
    let scoreCalls = 0;
    let directoryCalls = 0;
    let invalidScores = false;
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: `
        insert into league.franchises (id, display_name, first_season) values (1, 'One', 2026);
        insert into league.fantrax_teams values (2027, 'league27', 'a', 1);
    `, fetch: async input => {
        const url = new URL(String(input));
        switch (url.pathname.split('/').pop()) {
            case 'getLeagueInfo': return Response.json({ seasonYear: 2026, teamInfo: { a: { name: 'A' } }, rosterPeriods: [], matchups: [], playoffs: {}, scoringPeriods: [
                { number: 1, startDate: '2026-10-01T00:00:00Z', endDate: end },
                ...[2, 3, 4].map(number => ({ number, startDate: `2027-0${number}-01T00:00:00Z`, endDate: `2027-0${number}-08T00:00:00Z` })),
            ] });
            case 'getTeamRosters': return Response.json({ rosters: {} });
            case 'getStandings': return Response.json([]);
            case 'getPlayerIds': directoryCalls++; return Response.json({ p1: { name: 'Player', position: 'C' } });
            case 'getMatchupScores': {
                scoreCalls++;
                if (invalidScores) return Response.json({ period: 1, matchups: [] });
                return Response.json({ period: Number(url.searchParams.get('period')), matchups: [
                    { away: { teamId: 'a', score: scoreCalls, gamesPlayed: 1 }, home: { teamId: 'b', score: 1, gamesPlayed: 1 } },
                ] });
            }
            default: throw new Error(`Unexpected network request: ${url.pathname}`);
        }
    } });
    t.mock.method(console, 'warn', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(Date, 'now', () => now);
    const { getLiveSeason, getWeekScores } = await import('./live-season');
    // Only the core snapshot matters here; scoring leaders and roster stats are left to fail.
    const loadCore = async () => assert.equal((await getLiveSeason({ now })).status, 'available');

    assert.equal(scoresAreArchived(end, now), false);
    await getWeekScores(1);
    await getWeekScores(1);
    assert.equal(scoreCalls, 1);
    now = Date.parse(end) + 7 * DAY * 1000;
    assert.equal(scoresAreArchived(end, now - 1), false);
    assert.equal(scoresAreArchived(end, now), true);
    assert.equal((await getWeekScores(1))?.matchups[0].away.score, 2, 'archive fetches again after corrections');
    now += 90 * DAY * 1000;
    await getWeekScores(1);
    assert.equal(scoreCalls, 2);
    assert.ok(league.cacheReads().some(read => read.key.includes('fantrax-final-scores') && read.revalidate === false));
    league.expire(FANTRAX_TAG);
    assert.equal((await getWeekScores(1))?.matchups[0].away.score, 3, 'manual invalidation picks up a late correction');
    league.expireByKey('fantrax-final-scores');
    invalidScores = true;
    await assert.rejects(getWeekScores(1), /invalid matchup scores/);
    invalidScores = false;
    assert.equal((await getWeekScores(1))?.matchups[0].away.score, 5, 'failed final-score loads are retried');

    // Week scores read the core snapshot too, so count directory requests from an empty directory cache.
    league.expireByKey('fantrax-player-directory');
    directoryCalls = 0;
    await loadCore();
    await loadCore();
    assert.equal(directoryCalls, 1);
    const directory = [...league.cacheEntries()].find(([key]) => key.includes('fantrax-player-directory'));
    const archive = [...league.cacheEntries()].find(([key]) => key.includes('fantrax-final-scores'));
    assert.ok(directory && archive);
    assert.equal(directory[1].tags.includes(FANTRAX_CURRENT_TAG), false);
    assert.equal(archive[1].tags.includes(FANTRAX_CURRENT_TAG), false);
    league.expire(FANTRAX_CURRENT_TAG);
    await loadCore();
    assert.equal(directoryCalls, 1, 'evening refreshes preserve the weekly player directory');
    assert.ok(league.cacheEntries().has(archive[0]), 'evening refreshes preserve archived final scores');
    // Expire daily entries, as on a later visit, leaving the independent weekly directory.
    league.expireByLifetime(DAY);
    await loadCore();
    assert.equal(directoryCalls, 1, 'refreshing daily data reuses the player directory');
    league.expireByLifetime(7 * DAY);
    await loadCore();
    assert.equal(directoryCalls, 2, 'the directory refreshes on its own weekly deadline');
});
