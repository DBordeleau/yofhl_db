import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeKey } from './memory-fantrax';
import { awardVoteLeague, BASELINE_TRADE, FINAL, FRANCHISES, goalie, lockInHours, nhlRecord, PLAYOFF_ROUNDS, ROSTER_PERIODS, SEASON, skater } from './testing/award-vote-league';

// The rehearsal: the season before the live season (2026 here, the live season being 2027) prepared and previewed
// like a live award vote, but never opened. Its Fantrax league is the 2025–26 one, league26, mapped like league27.
async function rehearsalLeague(t: Parameters<typeof awardVoteLeague>[0]) {
    const harness = await awardVoteLeague(t);
    await harness.league.client.exec(`
        insert into league.fantrax_teams (season_year, fantrax_league_id, fantrax_team_id, franchise_id)
        values ${FRANCHISES.map(id => `(2026, 'league26', 'old${id}', ${id})`).join(', ')};`);
    /** Fantrax answers for the 2025–26 league instead, whose teams are oldN */
    const fantraxIs2026 = () => {
        const { fantrax } = harness;
        fantrax.leagueId = 'league26';
        fantrax.leagueInfo.seasonYear = 2026;
        fantrax.rosters = Object.fromEntries(Object.entries(fantrax.rosters).map(([period, teams]) =>
            [period, Object.fromEntries(Object.entries(teams).map(([team, slots]) => [team.replace('fx', 'old'), slots]))]));
    };
    return { ...harness, fantraxIs2026 };
}

test('the season before the live season is prepared and previewed as a rehearsal, with every award a live prepare shows', async t => {
    const { act, vote, fantrax, nhl, setRegularSeason, scoredOn, prepareFully, fantraxIs2026, league } = await rehearsalLeague(t);
    setRegularSeason([skater('s1', 300), skater('d1', 200, { positions: 'D' })], [goalie('g1', 100)]);
    // a rookie in both seasons
    nhl.players.d1 = nhlRecord();
    fantrax.skaters[rangeKey(PLAYOFF_ROUNDS)] = [skater('s1', 40)];
    fantrax.skaters[rangeKey(FINAL)] = [skater('s1', 15)];
    const livePrepared = (await prepareFully(SEASON)).result;
    const live = await act(() => vote.readPreview({ seasonYear: SEASON }));

    fantraxIs2026();
    // franchise 3 had s1 at the end of 2025–26, and franchise 1 had him through the Final it won
    await league.client.exec(`
        insert into league.players (id, name) values ('s1', 'Archive s1');
        insert into league.player_seasons (player_id, season_year, team_season_id, nhl_team, positions, fpts, fpg)
            values ('s1', 2026, 3, 'EDM', '{C}', 100, 10);`);
    for (const period of ROSTER_PERIODS.slice(-7)) fantrax.rosters[period.number].old1.push({ id: 's1', status: 'ACTIVE' });
    // franchise 2 claimed s1 for a while in 2025–26 (whose league has the same dates here)
    await league.client.exec(`
        insert into league.transaction_events (id, season_year, kind, occurred_at, occurred_on, source_file, source_time)
            values ('rehearsal-claim', 2026, 'free_agent', '2026-10-20T17:00:00Z', '2026-10-20', 'transactions.csv', '12:00PM');
        insert into league.transaction_assets (id, event_id, player_id, label, asset_kind, action, from_franchise_id, to_franchise_id, from_name, to_name, source_row)
            values ('rehearsal-claim-1', 'rehearsal-claim', 's1', 'Archive s1', 'player', 'claim', null, 2, null, 'Old 2', 1);`);
    scoredOn('2026-10-19', [['s1', 30]]);
    scoredOn('2026-10-25', [['s1', 12.5]]);
    const prepared = (await prepareFully(2026)).result;
    assert.ok(prepared.ok && prepared.done, JSON.stringify(prepared));
    assert.deepEqual(prepared, livePrepared);

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
        ['d1'],
        ['s1'],
    ]);
    assert.deepEqual(rehearsal.ballot![0].candidates[0].team, { teamSeasonId: 3, franchiseId: 3, name: 'Old 3', abbreviation: 'O3', logo: '/logos/o3.png' });
    const briere = rehearsal.ballot!.find(award => award.award === 'danny-briere')!;
    assert.deepEqual(briere.candidates[0].team, { teamSeasonId: 1, franchiseId: 1, name: 'Old 1', abbreviation: 'O1', logo: '/logos/o1.png' });
    assert.deepEqual([briere.candidates[0].stats.playoffRounds?.points, briere.candidates[0].stats.final?.points], [40, 15]);
    // GM of the Year's team summaries too, for 2025–26 (which the archive has no season before), with their
    // transaction summaries from 2025–26's moves: franchise 4's pick to franchise 3 and franchise 2's claim
    const empty = { trades: [], claims: [], drops: [], otherMoves: null, draftClass: [] };
    const pick = (team: string) => ({ kind: 'pick', label: BASELINE_TRADE, team });
    const transactions = [
        empty,
        { ...empty, claims: [{ playerId: 's1', name: 'Archive s1', occurredOn: '2026-10-20', moveValue: 12.5 }] },
        { ...empty, trades: [{ occurredOn: '2026-10-12', received: [pick('Old 4')], sent: [] }] },
        { ...empty, trades: [{ occurredOn: '2026-10-12', received: [], sent: [pick('Old 3')] }] },
    ];
    assert.deepEqual(rehearsal.gmOfTheYear?.candidates.map(candidate => [candidate.name, candidate.owner, candidate.summary]), [1, 2, 3, 4].map(id => [
        `Old ${id}`, `Owner ${id}`,
        {
            season: { wins: 10, losses: 5, ties: 1, fptsFor: 1000, playoffFinish: ['champion', 'finalist', 'missed', 'missed'][id - 1] }, previous: null,
            transactions: transactions[id - 1],
        },
    ]));

    assert.equal(live.kind, 'live');
    assert.equal(live.vote?.rehearsal, false);
});

test('only the season before the live season can be rehearsed', async t => {
    const { act, vote, fantrax, league } = await rehearsalLeague(t);
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: 2025 })), { ok: false, reason: 'before-award-votes' });
    assert.deepEqual(await act(() => vote.readPreview({ seasonYear: 2025 })), { kind: null, vote: null, ballot: null, gmOfTheYear: null, ballotStatus: null, voidBallots: null });
    assert.deepEqual(await act(() => vote.readPreview({ seasonYear: 2026 })), { kind: 'rehearsal', vote: null, ballot: null, gmOfTheYear: null, ballotStatus: null, voidBallots: null });

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
        await assert.rejects(league.client.query(`
            update league.award_votes set state = '${state}', ballot_lock = now() + interval '1 day', opened_at = now(), scored_at = now()
            where season_year = 2026`), /award_votes_rehearsal_prepared/);
    }
});

test('a rehearsal is never opened, has no ballot lock to move, takes no ballot, is never scored, reopened, voided or restored, and owners never see it', async t => {
    const { act, vote, asOwner, signInAs, headerAnswer, setRegularSeason, prepareFully, fantraxIs2026 } = await rehearsalLeague(t);
    fantraxIs2026();
    setRegularSeason([skater('s1', 300)]);
    await prepareFully(2026);
    const refused = { ok: false, reason: 'rehearsal' };
    assert.deepEqual(await act(() => vote.openVoting({ seasonYear: 2026, ballotLock: lockInHours(24) })), refused);
    assert.deepEqual(await act(() => vote.moveBallotLock({ seasonYear: 2026, ballotLock: lockInHours(48) })), refused);
    await signInAs('owner-1');
    const rankings = { 'wayne-gretzky': ['s1'], 'le-magnifique': ['s1'] };
    assert.deepEqual(await asOwner(() => vote.saveDraft({ seasonYear: 2026, rankings })), refused);
    assert.deepEqual(await asOwner(() => vote.submitBallot({ seasonYear: 2026, rankings })), refused);
    assert.deepEqual(await act(() => vote.scoreBallots({ seasonYear: 2026 })), refused);
    assert.deepEqual(await act(() => vote.reopenVoting({ seasonYear: 2026, ballotLock: lockInHours(24) })), refused);
    // refused as a rehearsal before anything else, even its missing reason
    assert.deepEqual(await act(() => vote.voidBallot({ seasonYear: 2026, franchiseId: 1, reason: '' })), refused);
    assert.deepEqual(await act(() => vote.restoreBallot({ seasonYear: 2026, franchiseId: 1 })), refused);
    assert.deepEqual(await act(() => vote.readTallies({ seasonYear: 2026 })), { ok: false, reason: 'not-scored' });
    assert.deepEqual(await act(() => vote.readBallots({ seasonYear: 2026 })), { ok: false, reason: 'not-locked' });

    assert.equal((await act(() => vote.readPreview({ seasonYear: 2026 }))).vote?.state, 'prepared');
    assert.deepEqual(await asOwner(() => vote.readOwnerBallot({ seasonYear: 2026 })), { status: 'no-vote' });
    assert.deepEqual(await asOwner(() => vote.readOwnerBallot({})), { status: 'no-vote' });
    assert.equal((await headerAnswer()).awardVote, null);
});

test('a rehearsal is never published, nothing of it is public, and its season\'s awards stay hand-entered', async t => {
    const { act, vote, setRegularSeason, prepareFully, fantraxIs2026, league } = await rehearsalLeague(t);
    fantraxIs2026();
    setRegularSeason([skater('s1', 300)]);
    await prepareFully(2026);
    assert.deepEqual(await act(() => vote.publish({ seasonYear: 2026 })), { ok: false, reason: 'rehearsal' });
    assert.deepEqual(await act(() => vote.refreshArchive({ seasonYear: 2026 })), { ok: false, reason: 'rehearsal' });
    assert.equal((await act(() => vote.readPreview({ seasonYear: 2026 }))).vote?.state, 'prepared');
    const visitor = async <T>(fn: () => Promise<T>) => (await league.runAsRoute('/season/[year]/ballots', fn)).result;
    assert.deepEqual(await visitor(() => vote.readPublishedBallots({ seasonYear: 2026 })), { ok: false, reason: 'not-published' });
    assert.deepEqual(await visitor(() => vote.readPublishedTallies({ award: 'wayne-gretzky' })), []);

    await league.client.exec(`
        insert into league.players (id, name) values ('s1', 'Archive s1');
        insert into league.player_seasons (player_id, season_year, team_season_id, nhl_team, positions, fpts, fpg)
            values ('s1', 2026, 3, 'EDM', '{C}', 100, 10);`);
    const { saveAwards } = await import('@/lib/data/curated-edits');
    assert.deepEqual(await saveAwards(2026, [{ award: 'Wayne Gretzky Award', playerId: 's1' }], { invalidate: () => {} }), { ok: true, saved: 1 });
});

test('a rehearsal can be prepared again, replacing its snapshot and staying a rehearsal', async t => {
    const { act, vote, setRegularSeason, prepareFully, fantraxIs2026, clock } = await rehearsalLeague(t);
    fantraxIs2026();
    setRegularSeason([skater('s1', 100)]);
    await prepareFully(2026);
    setRegularSeason([skater('s1', 104), skater('s2', 100)]);
    clock.time += 3600_000;
    const again = (await prepareFully(2026)).result;
    assert.ok(again.ok && again.done, JSON.stringify(again));
    const { vote: summary, ballot } = await act(() => vote.readPreview({ seasonYear: 2026 }));
    assert.equal(summary?.rehearsal, true);
    assert.deepEqual(ballot![0].candidates.map(candidate => [candidate.playerId, candidate.stats.regularSeason?.points]), [['s1', 104], ['s2', 100]]);
});
