import assert from 'node:assert/strict';
import test from 'node:test';
import { MID_SEASON, SEASON, seasonSyncLeague } from './testing/season-sync-league';

test("after a run, a player's page, career total and rank, the single-season leaderboard and the draft class include the season being played", async t => {
    const { run, read, setPlayers } = await seasonSyncLeague(t);
    const { getPlayer, getSingleSeasonLeaderboard } = await import('@/lib/data/league');
    const { getFranchiseDraft, getSeasonDraft } = await import('@/lib/data/history');
    // pages already cached before the run
    assert.deepEqual([(await read(() => getPlayer('v1')))!.totalFPts, (await read(() => getPlayer('v1')))!.rank], [100, 2]);
    assert.equal((await read(() => getSingleSeasonLeaderboard('all', 1, '', SEASON))).total, 0);
    assert.equal((await read(() => getSeasonDraft(SEASON)))[0].points, null);
    assert.equal((await read(() => getFranchiseDraft(1)))[0].points, null);

    setPlayers([['v1', 50.5, 5.05, 1], ['v2', 25, 2.5, null]]);
    const { result } = await run(MID_SEASON);
    assert.equal(result.outcome === 'synced' && result.changed.playerSeasons, 2);

    const v1 = (await read(() => getPlayer('v1')))!;
    assert.deepEqual(v1.playerStats.find(season => season.Year === SEASON),
        { Year: SEASON, FPts: 50.5, FPG: 5.05, Position: 'C', YOFHLTeam: 'C1', TeamID: '1', teamName: 'Club 1', teamLogo: '/logos/c1.png', Champion: false });
    assert.deepEqual([v1.totalFPts, v1.rank, v1.seasons], [150.5, 1, 2], 'the career total and all-time rank include the season being played');
    assert.deepEqual((await read(() => getSingleSeasonLeaderboard('all', 1, '', SEASON))).rows.map(row => [row.ID, row.FPts, row.FPG, row.YOFHLTeam]),
        [['v1', 50.5, 5.05, 'C1'], ['v2', 25, 2.5, 'FA']]);
    assert.deepEqual((await read(() => getSingleSeasonLeaderboard('all', 1, ''))).rows.map(row => [row.ID, row.Year]),
        [['v2', 2026], ['v1', 2026], ['v1', SEASON], ['v2', SEASON]]);
    assert.deepEqual((await read(() => getSeasonDraft(SEASON))).map(pick => [pick.playerId, pick.points, pick.fpg]), [['v1', 50.5, 5.05]]);
    assert.deepEqual((await read(() => getFranchiseDraft(1))).map(pick => [pick.playerId, pick.points, pick.fpg]), [['v1', 50.5, 5.05]]);
});

test("a run keeps the season import's players: scorers of either sign, rostered players, and ring or award players; others are removed", async t => {
    const { league, run, read, setPlayers } = await seasonSyncLeague(t);
    const { getArchivedPlayerIds, getPlayer, getSingleSeasonLeaderboard } = await import('@/lib/data/league');
    const season = async (id: string) => (await read(() => getPlayer(id)))?.playerStats.find(row => row.Year === SEASON) ?? null;
    const archived = async () => (await read(() => getArchivedPlayerIds())).map(row => row.id).sort();
    setPlayers([
        ['v1', 40, 4, 1],
        ['minus', -1.5, -0.75, null], // a free agent with a negative total
        ['benched', 0, null, 2], // rostered, no points yet
        ['nobody', 0, 0, null], // unrostered, no points
        ['ring', 12, 1.2, 3],
        ['award', 8, 0.8, null],
    ]);
    await run(MID_SEASON);
    assert.deepEqual([(await season('minus'))!.FPts, (await season('minus'))!.YOFHLTeam], [-1.5, 'FA'], 'a negative total is stored, with no fantasy team');
    assert.deepEqual([(await season('benched'))!.FPts, (await season('benched'))!.YOFHLTeam], [0, 'C2'], 'a rostered player with no points is stored');
    assert.equal(await read(() => getPlayer('nobody')), null, 'an unrostered player with no points is not stored');
    assert.equal((await read(() => getPlayer('benched')))!.name, 'Name benched', 'a player new to the archive gets a player row');
    assert.deepEqual(await archived(), ['award', 'ring', 'v1', 'v2'], 'and a player page link once they have points');

    // the league owner puts ring on the season's championship roster and award on an award list
    await league.client.exec(`insert into league.championship_rosters values (${SEASON}, 'ring');
        insert into league.award_types (id, name, label, description, sort_order) values (1, 'mvp', 'MVP', 'MVP', 1);
        insert into league.awards (season_year, award_type_id, player_id) values (${SEASON}, 1, 'award')`);
    // a scoring correction leaves v1 and ring scoreless, and everyone but benched is dropped
    setPlayers([['v1', 0, 0, null], ['minus', -1.5, -0.75, null], ['benched', 3, 1.5, 2], ['ring', 0, 0, null], ['award', 0, 0, null]]);
    const { result } = await run(MID_SEASON + 86400_000);
    assert.equal(result.outcome === 'synced' && result.changed.playerSeasons, 4);
    assert.equal(await season('v1'), null, 'a player who no longer qualifies is removed');
    assert.deepEqual((await read(() => getPlayer('v1')))!.totalFPts, 100);
    for (const id of ['ring', 'award']) {
        assert.deepEqual([(await season(id))!.FPts, (await season(id))!.FPG, (await season(id))!.YOFHLTeam], [0, 0, 'FA'], `${id} is kept with no points and no roster spot`);
    }
    assert.deepEqual((await read(() => getSingleSeasonLeaderboard('all', 1, '', SEASON))).rows.map(row => [row.ID, row.FPts]), [['benched', 3]]);
    assert.deepEqual(await archived(), ['benched', 'v1', 'v2']);
});

test("a scoring correction on Fantrax shows after the next run, and a run with nothing changed refreshes no view and expires no tag", async t => {
    const { league, run, read, setPlayers } = await seasonSyncLeague(t);
    const { getPlayer } = await import('@/lib/data/league');
    setPlayers([['v1', 40, 4, 1], ['v2', 20, 2, 2]]);
    await run(MID_SEASON);
    await read(() => getPlayer('v1'));

    setPlayers([['v1', 38.5, 3.85, 1], ['v2', 20, 2, 2]]);
    const corrected = await run(MID_SEASON + 3600_000);
    assert.equal(corrected.result.outcome === 'synced' && corrected.result.changed.playerSeasons, 1);
    assert.ok(corrected.revalidatedTags.includes('league:players'));
    assert.deepEqual((await read(() => getPlayer('v1')))!.totalFPts, 138.5);

    league.failNextQuery('refresh materialized view', new Error('no refresh expected'));
    const quiet = await run(MID_SEASON + 7200_000);
    assert.deepEqual(quiet.result, { outcome: 'synced', seasonYear: SEASON, changed: { playerSeasons: 0, teamSeasons: 0, playoffGames: 0, championshipRoster: 0, skaterCategories: 0 }, warnings: [] });
    assert.deepEqual(quiet.revalidatedTags, []);
});

test('a failing or invalid player table read writes nothing, team standings included, and records the error', async t => {
    t.mock.method(console, 'error', () => {});
    const { fantrax, run, read, setPlayers, setStandings } = await seasonSyncLeague(t);
    const { getPlayer, getSeasonDetail } = await import('@/lib/data/league');
    const { getSeasonSyncStatus } = await import('@/lib/admin/data');
    setPlayers([['v1', 40, 4, 1]]);
    await run(MID_SEASON);
    const seen = async () => [(await read(() => getPlayer('v1')))!.totalFPts, (await read(() => getSeasonDetail(SEASON))).standings[0].wins];
    const before = await seen();

    setStandings([[1, 1, 1, 0, 0, 100, 90], [2, 2, 0, 1, 0, 90, 100], [3, 3, 0, 0, 0, 0, 0], [4, 4, 0, 0, 0, 0, 0]]);
    const failures: [string, () => void, RegExp][] = [
        ['Fantrax is down', () => { setPlayers([['v1', 45, 4.5, 1]]); fantrax.down.add('players'); }, /503/],
        ['an unmapped fantasy team', () => { fantrax.down.clear(); setPlayers([['v1', 45, 4.5, 9]]); }, /team fx9/],
        ['a player listed twice', () => { setPlayers([['v1', 45, 4.5, 1], ['v1', 45, 4.5, null]]); }, /v1 more than once/],
    ];
    let hour = 1;
    for (const [what, arrange, error] of failures) {
        arrange();
        const failed = await run(MID_SEASON + hour++ * 3600_000);
        assert.equal(failed.result.outcome, 'failed', what);
        assert.deepEqual(failed.revalidatedTags, [], what);
        assert.deepEqual(await seen(), before, `${what}: yesterday's numbers stay`);
        assert.match((await getSeasonSyncStatus(SEASON))!.lastError!, error, what);
    }
    setPlayers([['v1', 45, 4.5, 1]]);
    assert.equal((await run(MID_SEASON + 86400_000)).result.outcome, 'synced');
    assert.deepEqual(await seen(), [145, 1], 'the next run catches up');
});
