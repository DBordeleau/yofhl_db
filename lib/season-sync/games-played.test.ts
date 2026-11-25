import assert from 'node:assert/strict';
import test from 'node:test';
import { MID_SEASON, SEASON, seasonSyncLeague } from './testing/season-sync-league';

// Career FP/G (GLOSSARY.md) is career FPts ÷ games played over every season with games played. In 2025–26 the
// test league has v1 at 100 FPts in 10 games played for franchise 1 and v2 at 120 in 10 for franchise 2.

/** a goalie's 2025–26 season, stored as the season import would have stored it */
const goalieSeason = (id: string, fpts: number, gamesPlayed: number) => `
    insert into league.players (id, name) values ('${id}', 'Name ${id}');
    insert into league.player_seasons (player_id, season_year, team_season_id, nhl_team, positions, fpts, fpg, games_played)
        values ('${id}', 2026, 3, 'TBL', '{G}', ${fpts}, ${(fpts / gamesPlayed).toFixed(2)}, ${gamesPlayed})`;

test("after a run, a skater's and a goalie's career FP/G is their FPts over every season divided by their games played", async t => {
    const { league, fantrax, run, read, setPlayers } = await seasonSyncLeague(t);
    const { getAllTimeLeaderboard, getPlayer } = await import('@/lib/data/league');
    await league.client.exec(goalieSeason('g1', 200, 50));
    setPlayers([['v1', 50, 1.25, 1, 40], ['g1', 30, 1.5, 3, 20]]);
    fantrax.players.find(player => player.id === 'g1')!.positions = ['G'];
    await run(MID_SEASON);

    const career = async (id: string) => {
        const player = (await read(() => getPlayer(id)))!;
        return [player.totalFPts, player.fpg, player.seasons];
    };
    // the mean of v1's season FP/G would be 5.63, and g1's 2.75
    assert.deepEqual(await career('v1'), [150, 3, 2], '150 FPts in 50 games played');
    assert.deepEqual(await career('g1'), [230, 3.29, 2], '230 FPts in 70 games played');
    assert.deepEqual((await read(() => getAllTimeLeaderboard('all', 1, ''))).rows.map(row => [row.ID, row.FPts, row.FPG]),
        [['g1', 230, 3.29], ['v1', 150, 3], ['v2', 120, 12]]);
});

test('a skater who played with no points and no roster spot is kept, and their games played lower their career FP/G', async t => {
    const { run, read, setPlayers } = await seasonSyncLeague(t);
    const { getPlayer, getSingleSeasonLeaderboard } = await import('@/lib/data/league');
    setPlayers([['v2', 0, 0, null, 10], ['newcomer', 0, 0, null, 3]]);
    await run(MID_SEASON);

    const v2 = (await read(() => getPlayer('v2')))!;
    assert.deepEqual(v2.playerStats.find(season => season.Year === SEASON), { Year: SEASON, FPts: 0, FPG: 0, Position: 'C', YOFHLTeam: 'FA',
        TeamID: null, teamName: null, teamLogo: null, Champion: false });
    assert.deepEqual([v2.totalFPts, v2.fpg, v2.seasons], [120, 6, 2], '120 FPts in 20 games played');
    const newcomer = (await read(() => getPlayer('newcomer')))!;
    assert.deepEqual([newcomer.name, newcomer.totalFPts, newcomer.fpg, newcomer.seasons, newcomer.positions], ['Name newcomer', 0, 0, 1, ['C']],
        "a player new to the archive is named from Fantrax's player directory and gets a career row");
    assert.deepEqual((await read(() => getSingleSeasonLeaderboard('all', 1, '', SEASON))).rows, [], 'single-season lists still leave out a season with no points');
});

test("a goalie's negative season lowers their career FPts and FP/G and moves their all-time rank, and a player with no positive season still ranks", async t => {
    const { league, fantrax, run, read, setPlayers } = await seasonSyncLeague(t);
    const { getAllTimeLeaderboard, getArchivedPlayerIds, getPlayer } = await import('@/lib/data/league');
    await league.client.exec(`${goalieSeason('g1', 110, 10)}; refresh materialized view league.player_careers`);
    assert.equal((await read(() => getPlayer('g1')))!.rank, 2);

    setPlayers([['g1', -15, -3, 3, 5], ['g2', -4, -2, null, 2]]);
    for (const player of fantrax.players) player.positions = ['G'];
    await run(MID_SEASON);
    const g1 = (await read(() => getPlayer('g1')))!;
    assert.deepEqual([g1.totalFPts, g1.fpg, g1.seasons, g1.rank], [95, 6.33, 2, 3], '95 FPts in 15 games played, now below v1');
    const g2 = (await read(() => getPlayer('g2')))!;
    assert.deepEqual([g2.totalFPts, g2.fpg, g2.seasons, g2.rank, g2.positions], [-4, -2, 1, 4, ['G']]);
    assert.deepEqual((await read(() => getAllTimeLeaderboard('all', 1, ''))).rows.map(row => [row.ID, row.FPts, row.FPG]),
        [['v2', 120, 12], ['v1', 100, 10], ['g1', 95, 6.33], ['g2', -4, -2]]);
    assert.ok((await read(() => getArchivedPlayerIds())).some(row => row.id === 'g2'), 'and has a player page');
});

test("a franchise page's FP/G for a player is their FPts with the franchise over their games played there, and each run updates it", async t => {
    const { run, read, setPlayers } = await seasonSyncLeague(t);
    const { getFranchise, getPlayer } = await import('@/lib/data/league');
    const leader = async (franchise: number, id: string) =>
        (await read(() => getFranchise(franchise)))!.leaders.filter(row => row.ID === id).map(row => [row.FPts, row.FPG]);
    setPlayers([['v1', 50, 1.25, 1, 40], ['v2', 0, null, 1, 5]]);
    await run(MID_SEASON);
    assert.deepEqual(await leader(1, 'v1'), [[150, 3]], '150 FPts in 50 games played');
    assert.deepEqual(await leader(1, 'v2'), [[0, 0]], "v2's scoreless games with franchise 1 count there");
    assert.deepEqual(await leader(2, 'v2'), [[120, 12]], 'and not with franchise 2');

    setPlayers([['v1', 60, 1.33, 1, 45], ['v2', 0, null, 1, 5]]);
    await run(MID_SEASON + 86400_000);
    assert.deepEqual(await leader(1, 'v1'), [[160, 2.91]], '160 FPts in 55 games played');
    assert.deepEqual([(await read(() => getPlayer('v1')))!.totalFPts, (await read(() => getPlayer('v1')))!.fpg], [160, 2.91]);
});

test('a games played change alone is written, counted and shows after the run', async t => {
    const { run, read, setPlayers } = await seasonSyncLeague(t);
    const { getPlayer } = await import('@/lib/data/league');
    setPlayers([['v1', 50, 1.25, 1, 40]]);
    await run(MID_SEASON);
    setPlayers([['v1', 50, 1.25, 1, 41]]);
    const { result } = await run(MID_SEASON + 3600_000);
    assert.equal(result.outcome === 'synced' && result.changed.playerSeasons, 1);
    assert.equal((await read(() => getPlayer('v1')))!.fpg, 2.94, '150 FPts in 51 games played');
});

test('a failing or unexpected goalie table, or a scorer neither table lists, writes nothing and records the error', async t => {
    const { fantrax, run, read, setPlayers } = await seasonSyncLeague(t);
    const { getPlayer } = await import('@/lib/data/league');
    const { getSeasonSyncStatus } = await import('@/lib/admin/data');
    setPlayers([['v1', 40, 2, 1, 20], ['g1', 30, 3, 2, 10]]);
    fantrax.players.find(player => player.id === 'g1')!.positions = ['G'];
    await run(MID_SEASON);
    const seen = async () => [(await read(() => getPlayer('v1')))!.totalFPts, (await read(() => getPlayer('g1')))!.fpg];
    const before = await seen();
    assert.deepEqual(before, [140, 3]);

    setPlayers([['v1', 45, 2.25, 1, 20], ['g1', 33, 3, 2, 11]]);
    fantrax.players.find(player => player.id === 'g1')!.positions = ['G'];
    const goalies = Object.getOwnPropertyDescriptor(fantrax, 'goalies')!;
    const failures: [string, () => void, RegExp][] = [
        ['Fantrax is down', () => { fantrax.down.add('goalies'); }, /goalies returned 503/],
        ['a goalie listed twice', () => {
            fantrax.down.clear();
            Object.defineProperty(fantrax, 'goalies', { configurable: true, get: () => [{ id: 'g1', gamesPlayed: 11 }, { id: 'g1', gamesPlayed: 11 }] });
        }, /goalie table has player g1 more than once/],
        ['an invalid games played', () => {
            Object.defineProperty(fantrax, 'goalies', { configurable: true, get: () => [{ id: 'g1', gamesPlayed: -1 }] });
        }, /invalid games played for player g1/],
        ['a scorer missing from both tables', () => {
            Object.defineProperty(fantrax, 'goalies', { configurable: true, get: () => [] });
        }, /g1 scored but neither Fantrax's skater table nor its goalie table lists games played/],
    ];
    let hour = 1;
    for (const [what, arrange, error] of failures) {
        arrange();
        const failed = await run(MID_SEASON + hour++ * 3600_000);
        assert.equal(failed.result.outcome, 'failed', what);
        assert.deepEqual(await seen(), before, `${what}: yesterday's numbers stay`);
        assert.match((await getSeasonSyncStatus(SEASON))!.lastError!, error, what);
    }
    Object.defineProperty(fantrax, 'goalies', goalies);
    await run(MID_SEASON + 86400_000);
    assert.deepEqual(await seen(), [145, 3], 'the next run catches up: g1 at 63 FPts in 21 games played');
});
