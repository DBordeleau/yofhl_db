import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeKey } from './memory-fantrax';
import { AFTER_FINAL, awardVoteLeague, FINAL, goalie, lockInHours, nhlRecord, PLAYOFF_ROUNDS, REGULAR_SEASON, ROSTER_PERIODS, SEASON, skater } from './testing/award-vote-league';

test('preparing refuses a season before the first award vote, other than the rehearsal', async t => {
    const { act, vote, fantrax } = await awardVoteLeague(t);
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: 2025 })), { ok: false, reason: 'before-award-votes' });
    assert.deepEqual(fantrax.reads, []);
});

test('preparing refuses a season without a champion', async t => {
    const { act, vote, fantrax } = await awardVoteLeague(t, { champion: false });
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: false, reason: 'no-champion' });
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: 2028 })), { ok: false, reason: 'no-champion' });
    assert.deepEqual(fantrax.reads, []);
});

test("preparing captures the fantasy regular season's stats for every player with fantasy points, and the preview shows them", async t => {
    const { act, vote, setRegularSeason, prepareFully, fantrax, league } = await awardVoteLeague(t);
    setRegularSeason([
        skater('s1', 120.5, { name: 'Connor McDavid', positions: 'C,RW', perGame: 12.05, gamesPlayed: 10, goals: 7, assists: 9, shots: 40, hits: 3, blocks: 2 }),
        skater('s2', -1.5),
        skater('s3', 0),
    ], [
        goalie('g1', 100, { name: 'Andrei Vasilevskiy', nhlTeam: 'TBL', perGame: 10, gamesPlayed: 10, wins: 7, goalsAgainst: 20, saves: 280, shutouts: 1 }),
        goalie('g2', 0),
    ]);
    assert.deepEqual((await prepareFully()).result, { ok: true, done: true, stepsDone: 10, steps: 10 });
    // the regular season's stats are asked for over the fantasy regular season's dates
    const range = `${REGULAR_SEASON.startDate}..${REGULAR_SEASON.endDate}`;
    assert.deepEqual(fantrax.reads.filter(read => read.endsWith(range)), [`skaters ${range}`, `goalies ${range}`]);

    const { vote: summary, ballot } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.equal(summary?.state, 'prepared');
    assert.equal(summary?.preparedAt, new Date(AFTER_FINAL).toISOString());
    const gretzky = ballot!.find(award => award.award === 'wayne-gretzky')!;
    assert.deepEqual(gretzky.statSets, [{ name: 'regularSeason', label: 'Regular season' }]);
    assert.equal(gretzky.shown, 50);
    assert.deepEqual(gretzky.candidates, [
        {
            playerId: 's1', name: 'Connor McDavid', positions: ['C', 'RW'], nhlTeam: 'EDM', team: null,
            stats: { regularSeason: { group: 'skater', points: 120.5, perGame: 12.05, gamesPlayed: 10, goals: 7, assists: 9, shots: 40, hits: 3, blocks: 2 } },
        },
        {
            playerId: 'g1', name: 'Andrei Vasilevskiy', positions: ['G'], nhlTeam: 'TBL', team: null,
            stats: { regularSeason: { group: 'goalie', points: 100, perGame: 10, gamesPlayed: 10, wins: 7, goalsAgainst: 20, saves: 280, shutouts: 1 } },
        },
    ]);
    // s2 scored, below the candidate floor: captured, but no candidate
    const captured = await league.client.query<{ playerId: string; points: number }>(`
        select player_id as "playerId", (line ->> 'points')::float8 as points from league.award_vote_stats where season_year = ${SEASON} and stat_set = 'regularSeason' order by player_id`);
    assert.deepEqual(captured.rows.map(row => [row.playerId, row.points]), [['g1', 100], ['s1', 120.5], ['s2', -1.5]]);
});

test('the Bobby Orr Award lists players with D among their positions, the Hasek Trophy goalies, and the Wayne Gretzky Award and Le Magnifique everyone', async t => {
    const { act, vote, setRegularSeason, prepareFully } = await awardVoteLeague(t);
    setRegularSeason([
        skater('c', 130),
        skater('d', 120, { positions: 'D' }),
        skater('dual', 110, { positions: 'RW,D' }),
        skater('quiet-d', 0, { positions: 'D' }),
    ], [goalie('g', 100)]);
    await prepareFully();
    const { ballot } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.deepEqual(ballot!.map(award => [award.award, award.label, award.candidates.map(candidate => candidate.playerId)]), [
        ['wayne-gretzky', 'Wayne Gretzky Award', ['c', 'd', 'dual', 'g']],
        ['le-magnifique', 'Le Magnifique', ['c', 'd', 'dual', 'g']],
        ['bobby-orr', 'Bobby Orr Award', ['d', 'dual']],
        ['hasek', 'Hasek Award', ['g']],
        // nobody is a rookie
        ['teemu-selanne', 'Teemu Selanne Trophy', []],
        ['danny-briere', 'Danny Briere Trophy', []],
    ]);
});

test('the regular-season awards need at least 100 regular-season FPts, and the Danny Briere Award does not', async t => {
    const { act, vote, setRegularSeason, prepareFully, fantrax, nhl } = await awardVoteLeague(t);
    setRegularSeason([
        skater('in', 100, { age: 30 }),
        skater('out', 99.75, { age: 30 }),
        skater('d-in', 100, { positions: 'D', age: 30 }),
        skater('d-out', 99.75, { positions: 'D', age: 30 }),
        skater('rookie-in', 100, { age: 20 }),
        skater('rookie-out', 99.75, { age: 20 }),
    ], [goalie('g-in', 100), goalie('g-out', 99.75)]);
    nhl.players['rookie-in'] = nhlRecord();
    nhl.players['rookie-out'] = nhlRecord();
    // short of the floor, but on the champion's roster through the Final
    fantrax.skaters[rangeKey(PLAYOFF_ROUNDS)] = [skater('out', 30)];
    fantrax.skaters[rangeKey(FINAL)] = [skater('out', 10)];
    for (const period of ROSTER_PERIODS.slice(-7)) fantrax.rosters[period.number].fx1.push({ id: 'out', status: 'ACTIVE' });
    await prepareFully();
    const { ballot } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.deepEqual(ballot!.map(award => [award.award, award.candidates.map(candidate => candidate.playerId)]), [
        ['wayne-gretzky', ['g-in', 'd-in', 'in', 'rookie-in']],
        ['le-magnifique', ['g-in', 'd-in', 'in', 'rookie-in']],
        ['bobby-orr', ['d-in']],
        ['hasek', ['g-in']],
        ['teemu-selanne', ['rookie-in']],
        ['danny-briere', ['out']],
    ]);
});

test('each candidate is credited to the last franchise to roster them that season, and nobody rostered no one', async t => {
    const { act, vote, setRegularSeason, prepareFully, endedSeasonWith, dropped, claimed } = await awardVoteLeague(t);
    setRegularSeason([skater('kept', 130), skater('late-drop', 120), skater('traded-on', 110), skater('never', 100)]);
    // with franchise 3 all season
    await endedSeasonWith('kept', 3);
    // claimed by franchise 2, dropped by it late in the season, and a free agent at the end of it
    await claimed('late-drop', 2, '2026-10-14');
    await dropped('late-drop', 2, '2026-10-30');
    await endedSeasonWith('late-drop', null);
    // dropped by franchise 1, then claimed by franchise 4, who had him at the end
    await dropped('traded-on', 1, '2026-10-15');
    await claimed('traded-on', 4, '2026-10-16');
    await endedSeasonWith('traded-on', 4);
    await prepareFully();
    const { ballot } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.deepEqual(ballot![0].candidates.map(candidate => [candidate.playerId, candidate.team]), [
        ['kept', { teamSeasonId: 13, franchiseId: 3, name: 'Club 3', abbreviation: 'C3', logo: '/logos/c3.png' }],
        ['late-drop', { teamSeasonId: 12, franchiseId: 2, name: 'Club 2', abbreviation: 'C2', logo: '/logos/c2.png' }],
        ['traded-on', { teamSeasonId: 14, franchiseId: 4, name: 'Club 4', abbreviation: 'C4', logo: '/logos/c4.png' }],
        ['never', null],
    ]);
});

test('a candidate missing from the end-of-season rosters is credited to the franchise their last move put them on', async t => {
    const { act, vote, setRegularSeason, prepareFully, dropped, claimed, traded } = await awardVoteLeague(t);
    setRegularSeason([skater('claimed-last', 120), skater('traded-last', 110), skater('dropped-last', 100)]);
    // none of them has an end-of-season roster row in the archive
    await dropped('claimed-last', 1, '2026-10-14');
    await claimed('claimed-last', 2, '2026-10-20');
    await claimed('traded-last', 1, '2026-10-14');
    await traded('traded-last', 1, 3, '2026-10-25');
    await claimed('dropped-last', 4, '2026-10-14');
    await dropped('dropped-last', 4, '2026-10-28');
    await prepareFully();
    const { ballot } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.deepEqual(ballot![0].candidates.map(candidate => [candidate.playerId, candidate.team?.franchiseId ?? null]), [
        ['claimed-last', 2],
        ['traded-last', 3],
        ['dropped-last', 4],
    ]);
});

test('preparing runs in bounded batches, resuming from recorded progress until it is done', async t => {
    const { act, vote, setRegularSeason, prepareFully, fantrax, clock } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 150)], [goalie('g1', 100)]);
    // every Fantrax read takes 20 seconds
    fantrax.onRead = () => { clock.time += 20_000; };
    // a call reads Fantrax for one step at most
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: true, done: false, stepsDone: 1, steps: 10 });
    assert.deepEqual(fantrax.reads.map(read => read.split(' ')[0]), ['leagueInfo']);
    // an unfinished prepare shows no ballot
    const unfinished = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.equal(unfinished.vote?.preparedAt, null);
    assert.equal(unfinished.ballot, null);

    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: true, done: false, stepsDone: 2, steps: 10 });
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: true, done: false, stepsDone: 3, steps: 10 });
    assert.deepEqual(fantrax.reads.map(read => read.split(' ')[0]), ['leagueInfo', 'skaters', 'goalies']);
    assert.deepEqual((await prepareFully()).result, { ok: true, done: true, stepsDone: 10, steps: 10 });
    // each call carried on where the last stopped, so nothing was read twice
    assert.equal(new Set(fantrax.reads).size, fantrax.reads.length);
    const { ballot } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.deepEqual(ballot![0].candidates.map(candidate => candidate.playerId), ['s1', 'g1']);
});

test("a stat set's table of several pages is read a page per call, and its players are all captured", async t => {
    const { act, vote, setRegularSeason, prepareFully, fantrax } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 160), skater('s2', 150), skater('s3', 140)], [goalie('g1', 130)]);
    fantrax.pageSize = 2;
    await act(() => vote.prepare({ seasonYear: SEASON }));
    const range = rangeKey(REGULAR_SEASON);
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: true, done: false, stepsDone: 1, steps: 10 });
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: true, done: false, stepsDone: 2, steps: 10 });
    assert.deepEqual(fantrax.reads.slice(1), [`skaters ${range}`, `skaters ${range} page 2`]);
    assert.deepEqual((await prepareFully()).result, { ok: true, done: true, stepsDone: 10, steps: 10 });
    assert.equal(new Set(fantrax.reads).size, fantrax.reads.length);
    const { ballot } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.deepEqual(ballot![0].candidates.map(candidate => candidate.playerId), ['s1', 's2', 's3', 'g1']);
});

test("a stat set's table that changes between pages is read again from its first page", async t => {
    t.mock.method(console, 'error', () => {});
    const { act, vote, setRegularSeason, prepareFully, fantrax } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 160), skater('s2', 150), skater('s3', 140)]);
    fantrax.pageSize = 2;
    await act(() => vote.prepare({ seasonYear: SEASON }));
    await act(() => vote.prepare({ seasonYear: SEASON }));
    setRegularSeason([skater('s1', 160), skater('s2', 150), skater('s3', 140), skater('s4', 130)]);
    assert.equal((await prepareFully()).result.ok, true);
    const range = rangeKey(REGULAR_SEASON);
    assert.deepEqual(fantrax.reads.filter(read => read.startsWith(`skaters ${range}`)),
        [`skaters ${range}`, `skaters ${range} page 2`, `skaters ${range}`, `skaters ${range} page 2`]);
    const { ballot } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.deepEqual(ballot![0].candidates.map(candidate => candidate.playerId), ['s1', 's2', 's3', 's4']);
});

test('a failed Fantrax read stops preparing with its reason, and the next call retries it', async t => {
    t.mock.method(console, 'error', () => {});
    const { setRegularSeason, prepareFully, fantrax } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 100)], [goalie('g1', 50)]);
    fantrax.down.add('goalies');
    assert.deepEqual((await prepareFully()).result, { ok: false, reason: 'fantrax-failed', message: 'Fantrax goalies returned 503' });
    fantrax.down.clear();
    assert.deepEqual((await prepareFully()).result, { ok: true, done: true, stepsDone: 10, steps: 10 });
    assert.deepEqual(fantrax.reads.map(read => read.split(' ')[0]).slice(0, 4), ['leagueInfo', 'skaters', 'goalies', 'goalies']);
});

test('preparing refuses a season with no Fantrax league in the league configuration', async t => {
    const { act, vote, league, fantrax } = await awardVoteLeague(t);
    await league.client.exec(`delete from league.fantrax_teams where season_year = ${SEASON}`);
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: false, reason: 'no-fantrax-league' });
    assert.deepEqual(fantrax.reads, []);
});

test("preparing refuses a season whose Fantrax league is another season's", async t => {
    t.mock.method(console, 'error', () => {});
    const { act, vote, fantrax } = await awardVoteLeague(t);
    fantrax.leagueInfo.seasonYear = 2028;
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })),
        { ok: false, reason: 'fantrax-failed', message: 'Fantrax league league27 is the 2028 season, not 2027' });
});

test('preparing again replaces the snapshot', async t => {
    const { act, vote, setRegularSeason, prepareFully, clock } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 100), skater('d1', 160, { positions: 'D' })]);
    await prepareFully();
    // a stat correction: s1's points move, d1's go, and s2 has some
    setRegularSeason([skater('s1', 104), skater('s2', 100), skater('d1', 0, { positions: 'D' })]);
    clock.time += 3600_000;
    await prepareFully();
    const { vote: summary, ballot } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.equal(summary?.preparedAt, new Date(clock.time).toISOString());
    assert.deepEqual(ballot!.map(award => award.candidates.map(candidate => [candidate.playerId, candidate.stats.regularSeason?.points])), [
        [['s1', 104], ['s2', 100]],
        [['s1', 104], ['s2', 100]],
        [],
        [],
        [],
        [],
    ]);
});

test("an unfinished prepare can be started over from nothing, keeping the admin's rookie changes", async t => {
    const { act, vote, setRegularSeason, prepareFully, fantrax, clock, league } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 100), skater('unknown', 120, { age: 22 })], [goalie('g1', 50)]);
    await prepareFully();
    assert.deepEqual(await act(() => vote.adjustRookie({ seasonYear: SEASON, playerId: 'unknown', change: 'add' })), { ok: true });

    // preparing again, interrupted partway
    clock.time += 3600_000;
    await act(() => vote.prepare({ seasonYear: SEASON }));
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: true, done: false, stepsDone: 2, steps: 10 });

    // started over, it begins again at the first step with no snapshot
    clock.time += 3600_000;
    const restarted = clock.time;
    fantrax.reads.length = 0;
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON, startOver: true })), { ok: true, done: false, stepsDone: 1, steps: 10 });
    assert.deepEqual(fantrax.reads.map(read => read.split(' ')[0]), ['leagueInfo']);
    assert.equal((await act(() => vote.readPreview({ seasonYear: SEASON }))).vote?.prepareStartedAt, new Date(restarted).toISOString());
    const snapshot = await league.client.query<{ players: number }>(`select count(*)::int as players from league.award_vote_players where season_year = ${SEASON}`);
    assert.equal(snapshot.rows[0].players, 0);

    assert.equal((await prepareFully()).result.ok, true);
    const teemu = (await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot!.find(award => award.award === 'teemu-selanne')!;
    assert.deepEqual(teemu.candidates.map(candidate => candidate.playerId), ['unknown']);
});

test('starting over is refused once the award vote is past prepared', async t => {
    const { act, vote, setRegularSeason, prepareFully } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 100)]);
    await prepareFully();
    assert.deepEqual(await act(() => vote.openVoting({ seasonYear: SEASON, ballotLock: lockInHours(24) })), { ok: true });
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON, startOver: true })), { ok: false, reason: 'not-prepared' });
    assert.notEqual((await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot, null);
});
