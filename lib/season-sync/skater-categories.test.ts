import assert from 'node:assert/strict';
import test from 'node:test';
import { MID_SEASON, SEASON, seasonSyncLeague } from './testing/season-sync-league';

const totals = (goals: number, assists: number, shots: number, hits: number, blocks: number) => ({ goals, assists, shots, hits, blocks });

test("after a run, each skater with a player season has the skater table's totals, zeros with no games played, and a goalie has none", async t => {
    const { fantrax, run, read, setPlayers, setSkaters, skaterCategories } = await seasonSyncLeague(t);
    const { getPlayer } = await import('@/lib/data/league');
    setPlayers([['v1', 50, 5, 1], ['v2', 20, 2, null], ['benched', 0, null, 2], ['goalie', 30, 3, 3], ['nobody', 0, 0, null]]);
    fantrax.players.find(player => player.id === 'goalie')!.positions = ['G'];
    setSkaters([
        ['v1', 10, 12, 80, 30, 15],
        ['v2', 3, 4, 40, 60, 20],
        ['benched', null], // rostered, no games played yet
        ['nobody', 0, 0, 0, 0, 0], // played, no points, unrostered: no player season
        ['stranger', 5, 5, 5, 5, 5], // only in the skater table
    ]);
    const { result } = await run(MID_SEASON);
    assert.equal(result.outcome === 'synced' && result.changed.skaterCategories, 3);
    assert.deepEqual(await skaterCategories(SEASON), {
        benched: totals(0, 0, 0, 0, 0),
        goalie: null,
        v1: totals(10, 12, 80, 30, 15),
        v2: totals(3, 4, 40, 60, 20),
    });
    for (const id of ['nobody', 'stranger']) assert.equal(await read(() => getPlayer(id)), null, `${id} gets no player row or player season`);
    assert.deepEqual(await skaterCategories(2026), { v1: null, v2: null }, "earlier seasons' player seasons have none");
});

test('a changed category total expires the record book alone, and a second run with nothing changed writes nothing and expires no tag', async t => {
    const { league, run, setPlayers, setSkaters, skaterCategories } = await seasonSyncLeague(t);
    setPlayers([['v1', 50, 5, 1], ['v2', 20, 2, 2]]);
    setSkaters([['v1', 10, 12, 80, 30, 15], ['v2', 3, 4, 40, 60, 20]]);
    await run(MID_SEASON);

    // a stat correction moves a hit from v1 to v2, and FPts stay the same
    setSkaters([['v1', 10, 12, 80, 29, 15], ['v2', 3, 4, 40, 61, 20]]);
    const corrected = await run(MID_SEASON + 3600_000);
    assert.deepEqual(corrected.result.outcome === 'synced' && corrected.result.changed,
        { playerSeasons: 0, teamSeasons: 0, playoffGames: 0, championshipRoster: 0, skaterCategories: 2 });
    assert.deepEqual(corrected.revalidatedTags, ['league:records']);
    assert.deepEqual([(await skaterCategories(SEASON)).v1!.hits, (await skaterCategories(SEASON)).v2!.hits], [29, 61]);

    // a scoring correction changes v1's FPts and goals together
    setPlayers([['v1', 53, 5.3, 1], ['v2', 20, 2, 2]]);
    setSkaters([['v1', 11, 12, 80, 29, 15], ['v2', 3, 4, 40, 61, 20]]);
    const scored = await run(MID_SEASON + 7200_000);
    assert.deepEqual(scored.result.outcome === 'synced' && [scored.result.changed.playerSeasons, scored.result.changed.skaterCategories], [1, 1]);
    assert.equal((await skaterCategories(SEASON)).v1!.goals, 11);

    league.failNextQuery('refresh materialized view', new Error('no refresh expected'));
    const quiet = await run(MID_SEASON + 10800_000);
    assert.deepEqual(quiet.result, { outcome: 'synced', seasonYear: SEASON,
        changed: { playerSeasons: 0, teamSeasons: 0, playoffGames: 0, championshipRoster: 0, skaterCategories: 0 }, warnings: [] });
    assert.deepEqual(quiet.revalidatedTags, []);
});

test('a failing or unexpected skater table writes nothing, standings and player seasons included, and records the error', async t => {
    const { fantrax, run, read, setPlayers, setSkaters, setStandings, skaterCategories } = await seasonSyncLeague(t);
    const { getPlayer, getSeasonDetail } = await import('@/lib/data/league');
    const { getSeasonSyncStatus } = await import('@/lib/admin/data');
    setPlayers([['v1', 40, 4, 1]]);
    setSkaters([['v1', 10, 12, 80, 30, 15]]);
    await run(MID_SEASON);
    const seen = async () => [(await read(() => getPlayer('v1')))!.totalFPts, (await read(() => getSeasonDetail(SEASON))).standings[0].wins, await skaterCategories(SEASON)];
    const before = await seen();

    setStandings([[1, 1, 1, 0, 0, 100, 90], [2, 2, 0, 1, 0, 90, 100], [3, 3, 0, 0, 0, 0, 0], [4, 4, 0, 0, 0, 0, 0]]);
    setPlayers([['v1', 45, 4.5, 1]]);
    const failures: [string, () => void, RegExp][] = [
        ['Fantrax is down', () => { setSkaters([['v1', 11, 12, 80, 30, 15]]); fantrax.down.add('skaters'); }, /skaters returned 503/],
        ['a skater listed twice', () => { fantrax.down.clear(); setSkaters([['v1', 11, 12, 80, 30, 15], ['v1', null]]); }, /v1 more than once/],
        ['an invalid total', () => { setSkaters([['v1', 11, 12, 80, -1, 15]]); }, /invalid category total for player v1/],
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
    setSkaters([['v1', 11, 12, 80, 30, 15]]);
    const caughtUp = await run(MID_SEASON + 86400_000);
    assert.equal(caughtUp.result.outcome === 'synced' && caughtUp.result.changed.skaterCategories, 1);
    assert.equal((await getSeasonSyncStatus(SEASON))!.changed.skaterCategories, 1, "the status row records the last success's count");
    assert.deepEqual(await seen(), [145, 1, { v1: totals(11, 12, 80, 30, 15) }], 'the next run catches up');
});

test("the record book's category records count the live season's stored totals, a player season with none contributes nothing, and a corrected total shows after the next run", async t => {
    const { league, fantrax, run, read, setPlayers, setSkaters } = await seasonSyncLeague(t);
    const { getRecordBook } = await import('@/lib/records/data');
    // 02f9l scored 53 goals in 2025–26, as the checked-in history has it
    await league.client.exec(`insert into league.players (id, name) values ('02f9l', 'Name 02f9l');
        insert into league.player_seasons (player_id, season_year, team_season_id, nhl_team, positions, fpts, fpg) values ('02f9l', 2026, 1, 'EDM', '{C}', 150, 2)`);
    setPlayers([['v1', 50, 5, 1], ['02f9l', 40, 4, 2], ['goalie', 30, 3, 3], ['benched', 0, null, 4]]);
    fantrax.players.find(player => player.id === 'goalie')!.positions = ['G'];
    setSkaters([['v1', 60, 12, 80, 30, 15], ['02f9l', 7, 4, 40, 60, 20], ['benched', null]]);
    await run(MID_SEASON);

    const goals = async () => {
        const { records } = await read(() => getRecordBook({ stat: 'goals' }));
        const list = (id: string) => records.find(record => record.id === id)!.entries.map(entry => [entry.id, entry.value, entry.detail]);
        return { season: list('player-season-goals'), career: list('player-career-goals') };
    };
    assert.deepEqual(await goals(), {
        season: [['v1:2027', 60, '2026–27'], ['02f9l:2026', 53, '2025–26'], ['02f9l:2027', 7, '2026–27']],
        career: [['02f9l', 60, '2 seasons'], ['v1', 60, '1 seasons']],
    }, 'the goalie and the skater with no games played are not listed');

    // a stat correction takes a goal from v1, and the next read shows it
    setSkaters([['v1', 59, 12, 80, 30, 15], ['02f9l', 7, 4, 40, 60, 20], ['benched', null]]);
    await run(MID_SEASON + 3600_000);
    assert.deepEqual((await goals()).season[0], ['v1:2027', 59, '2026–27']);
});
