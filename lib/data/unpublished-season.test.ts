import assert from 'node:assert/strict';
import test from 'node:test';
import { disposableLeague } from '../testing/disposable-league';
import { LEAGUE_TAG } from './cache-tags';
import { MATERIALIZED_VIEWS } from './materialized-views';

// A season the season sync is filling in has points but no champion yet: it earns no trophy until it is published.
test('an unpublished season earns no Prime Minister’s Trophy and stays off the cup-streak calendar until it has a champion', async t => {
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: `
        insert into league.seasons values (2024, '2023–24', 'complete'), (2025, '2024–25', 'complete'), (2026, '2025–26', 'complete');
        insert into league.franchises (id, display_name, first_season) values (1, 'One', 2024), (2, 'Two', 2024);
        -- franchise 1 leads 2024 and 2025; franchise 2 leads the 2026 season being played
        insert into league.team_seasons (id, season_year, franchise_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against)
        select (y-2024)*2+f, y, f, 'Team '||f, 'Team '||f, 'T'||f, 1, f, 10, 5, 0,
               case when y = 2026 then (case when f = 2 then 9000 else 50 end) else 1000-f end, 500
        from generate_series(2024,2026) y cross join generate_series(1,2) f;
        insert into league.players values ('p1', 'Player One');
        insert into league.player_seasons (player_id,season_year,team_season_id,positions,fpts,fpg)
        values ('p1', 2025, 3, array['C'], 100, 2), ('p1', 2026, 5, array['C'], 800, 9);
        insert into league.matchups (season_year,stage,round,bracket,slot,away_team_season_id,home_team_season_id,away_score,home_score,winner_team_season_id)
        values (2024,'playoff',1,'championship',1,1,2,100,90,1), (2025,'playoff',1,'championship',1,3,4,100,90,3);
    ` });
    const { getFranchise, getTeamAwardWinners } = await import('./league');
    const { getFranchiseHonors } = await import('./history');
    const { getRecordSource } = await import('../records/data');
    const { buildRecords } = await import('../records/model');
    const record = async (id: string) => buildRecords(await getRecordSource()).find(r => r.id === id)!.entries;

    assert.deepEqual((await getTeamAwardWinners('prime-minister')).map(w => [w.Year, w.TeamID]), [[2025, 1], [2024, 1]]);
    assert.deepEqual((await getFranchiseHonors(2)).primeMinisters, []);
    assert.deepEqual((await getFranchise(2))!.seasons.map(s => [s.year, s.playoffStatus]), [[2026, 'pending'], [2025, 'complete'], [2024, 'complete']],
        'the season being played has no playoff result yet');
    assert.deepEqual((await getFranchiseHonors(1)).primeMinisters.map(w => w.year), [2025, 2024]);
    assert.deepEqual((await record('scoring-titles')).map(e => [e.team, e.value]), [[1, 2]]);
    assert.deepEqual((await getRecordSource()).competitions, [2024, 2025], 'cup streaks are measured against published seasons');
    assert.deepEqual((await record('repeat-cups')).map(e => [e.team, e.value]), [[1, 2]]);
    assert.equal((await record('season-points'))[0].id, '2:2026', 'the highest team season total counts the season being played');
    assert.equal((await record('player-season'))[0].id, 'p1:2026', 'the highest player season total counts the season being played');

    // The Final is decided: the season is published and treated like any other.
    await league.client.exec(`
        insert into league.matchups (season_year,stage,round,bracket,slot,away_team_season_id,home_team_season_id,away_score,home_score,winner_team_season_id)
        values (2026,'playoff',1,'championship',1,5,6,100,90,5);
    `);
    for (const view of MATERIALIZED_VIEWS) await league.client.exec(`refresh materialized view league.${view};`);
    league.expire(LEAGUE_TAG);

    assert.deepEqual((await getTeamAwardWinners('prime-minister')).map(w => [w.Year, w.TeamID]), [[2026, 2], [2025, 1], [2024, 1]]);
    assert.deepEqual((await getFranchiseHonors(2)).primeMinisters, [{ year: 2026, points: 9000 }]);
    assert.equal((await getFranchise(2))!.seasons[0].playoffStatus, 'complete');
    assert.deepEqual((await record('scoring-titles')).map(e => [e.team, e.value]), [[1, 2], [2, 1]]);
    assert.deepEqual((await getRecordSource()).competitions, [2024, 2025, 2026]);
    assert.deepEqual((await record('repeat-cups')).map(e => [e.team, e.value]), [[1, 3]]);
});
