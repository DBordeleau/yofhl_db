import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardVoteLeague, FRANCHISES, goalie, SEASON, skater } from './testing/award-vote-league';

// The rehearsal: the season before the live season (2026 here, the live season being 2027) prepared and previewed
// like a live award vote, but never opened. Its Fantrax league is the 2025–26 one, league26, mapped like league27.
async function rehearsalLeague(t: Parameters<typeof awardVoteLeague>[0]) {
    const harness = await awardVoteLeague(t);
    await harness.league.client.exec(`
        insert into league.fantrax_teams (season_year, fantrax_league_id, fantrax_team_id, franchise_id)
        values ${FRANCHISES.map(id => `(2026, 'league26', 'old${id}', ${id})`).join(', ')};`);
    /** Fantrax answers for the 2025–26 league instead */
    const fantraxIs2026 = () => {
        harness.fantrax.leagueId = 'league26';
        harness.fantrax.leagueInfo.seasonYear = 2026;
    };
    return { ...harness, fantraxIs2026 };
}

test('the season before the live season is prepared and previewed as a rehearsal, with every award a live prepare shows', async t => {
    const { act, vote, setRegularSeason, prepareFully, fantraxIs2026, league } = await rehearsalLeague(t);
    setRegularSeason([skater('s1', 100), skater('d1', 60, { positions: 'D' })], [goalie('g1', 50)]);
    await prepareFully(SEASON);
    const live = await act(() => vote.readPreview({ seasonYear: SEASON }));

    fantraxIs2026();
    // franchise 3 had s1 at the end of 2025–26
    await league.client.exec(`
        insert into league.players (id, name) values ('s1', 'Archive s1');
        insert into league.player_seasons (player_id, season_year, team_season_id, nhl_team, positions, fpts, fpg)
            values ('s1', 2026, 3, 'EDM', '{C}', 100, 10);`);
    assert.deepEqual((await prepareFully(2026)).result, { ok: true, done: true, stepsDone: 4, steps: 4 });

    const rehearsal = await act(() => vote.readPreview({ seasonYear: 2026 }));
    assert.equal(rehearsal.kind, 'rehearsal');
    assert.equal(rehearsal.vote?.rehearsal, true);
    assert.equal(rehearsal.vote?.state, 'prepared');
    assert.deepEqual(rehearsal.ballot!.map(award => award.award), live.ballot!.map(award => award.award));
    assert.deepEqual(rehearsal.ballot!.map(award => award.candidates.map(candidate => candidate.playerId)), [
        ['s1', 'd1', 'g1'],
        ['s1', 'd1', 'g1'],
        ['d1'],
        ['g1'],
    ]);
    assert.deepEqual(rehearsal.ballot![0].candidates[0].team, { teamSeasonId: 3, franchiseId: 3, name: 'Old 3', abbreviation: 'O3', logo: '/logos/o3.png' });

    assert.equal(live.kind, 'live');
    assert.equal(live.vote?.rehearsal, false);
});

test('only the season before the live season can be rehearsed', async t => {
    const { act, vote, fantrax, league } = await rehearsalLeague(t);
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: 2025 })), { ok: false, reason: 'before-award-votes' });
    assert.deepEqual(await act(() => vote.readPreview({ seasonYear: 2025 })), { kind: null, vote: null, ballot: null });
    assert.deepEqual(await act(() => vote.readPreview({ seasonYear: 2026 })), { kind: 'rehearsal', vote: null, ballot: null });

    // once 2027–28 starts on Fantrax, 2026–27 is a live award vote and 2025–26 can no longer be rehearsed
    await league.client.exec(`
        insert into league.fantrax_teams (season_year, fantrax_league_id, fantrax_team_id, franchise_id) values (2028, 'league28', 'new1', 1);`);
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: 2026 })), { ok: false, reason: 'before-award-votes' });
    assert.equal((await act(() => vote.readPreview({ seasonYear: SEASON }))).kind, 'live');
    assert.deepEqual(fantrax.reads, []);
});

test('a rehearsal is refused everything past preparing, and the database never lets it leave prepared', async t => {
    const { act, setRegularSeason, prepareFully, fantraxIs2026, league } = await rehearsalLeague(t);
    const { rows, writeInOrder } = await import('@/lib/data/db');
    const { rehearsalRefusal } = await import('./rehearsal');
    const db = { rows, writeInOrder };
    // the season is refused before it is ever prepared, and the live season never is
    assert.equal(await act(() => rehearsalRefusal(db, 2026)), 'rehearsal');
    assert.equal(await act(() => rehearsalRefusal(db, SEASON)), null);

    fantraxIs2026();
    setRegularSeason([skater('s1', 100)]);
    await prepareFully(2026);
    assert.equal(await act(() => rehearsalRefusal(db, 2026)), 'rehearsal');
    // and still once 2027–28 has started on Fantrax
    await league.client.exec(`
        insert into league.fantrax_teams (season_year, fantrax_league_id, fantrax_team_id, franchise_id) values (2028, 'league28', 'new1', 1);`);
    assert.equal(await act(() => rehearsalRefusal(db, 2026)), 'rehearsal');

    for (const state of ['open', 'scored', 'published']) {
        await assert.rejects(league.client.query(`update league.award_votes set state = '${state}' where season_year = 2026`), /award_votes_rehearsal_prepared/);
    }
});

test('a rehearsal can be prepared again, replacing its snapshot and staying a rehearsal', async t => {
    const { act, vote, setRegularSeason, prepareFully, fantraxIs2026, clock } = await rehearsalLeague(t);
    fantraxIs2026();
    setRegularSeason([skater('s1', 100)]);
    await prepareFully(2026);
    setRegularSeason([skater('s1', 104), skater('s2', 20)]);
    clock.time += 3600_000;
    assert.deepEqual((await prepareFully(2026)).result, { ok: true, done: true, stepsDone: 4, steps: 4 });
    const { vote: summary, ballot } = await act(() => vote.readPreview({ seasonYear: 2026 }));
    assert.equal(summary?.rehearsal, true);
    assert.deepEqual(ballot![0].candidates.map(candidate => [candidate.playerId, candidate.stats.regularSeason?.points]), [['s1', 104], ['s2', 20]]);
});
