import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AFTER_FINAL, awardVoteLeague, goalie, REGULAR_SEASON, SEASON, skater } from './testing/award-vote-league';

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
    const { act, vote, setRegularSeason, prepareFully, fantrax } = await awardVoteLeague(t);
    setRegularSeason([
        skater('s1', 120.5, { name: 'Connor McDavid', positions: 'C,RW', perGame: 12.05, gamesPlayed: 10, goals: 7, assists: 9, shots: 40, hits: 3, blocks: 2 }),
        skater('s2', -1.5),
        skater('s3', 0),
    ], [
        goalie('g1', 80, { name: 'Andrei Vasilevskiy', nhlTeam: 'TBL', perGame: 8, gamesPlayed: 10, wins: 7, goalsAgainst: 20, saves: 280, shutouts: 1 }),
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
            stats: { regularSeason: { group: 'goalie', points: 80, perGame: 8, gamesPlayed: 10, wins: 7, goalsAgainst: 20, saves: 280, shutouts: 1 } },
        },
        {
            playerId: 's2', name: 'Skater s2', positions: ['C'], nhlTeam: 'EDM', team: null,
            stats: { regularSeason: { group: 'skater', points: -1.5, perGame: -0.15, gamesPlayed: 10, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0 } },
        },
    ]);
});

test('the Bobby Orr Award lists players with D among their positions, the Hasek Trophy goalies, and the Wayne Gretzky Award and Le Magnifique everyone', async t => {
    const { act, vote, setRegularSeason, prepareFully } = await awardVoteLeague(t);
    setRegularSeason([
        skater('c', 100),
        skater('d', 90, { positions: 'D' }),
        skater('dual', 80, { positions: 'RW,D' }),
        skater('quiet-d', 0, { positions: 'D' }),
    ], [goalie('g', 70)]);
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

test('each candidate is credited to the last franchise to roster them that season, and nobody rostered no one', async t => {
    const { act, vote, setRegularSeason, prepareFully, endedSeasonWith, dropped, claimed } = await awardVoteLeague(t);
    setRegularSeason([skater('kept', 100), skater('late-drop', 90), skater('traded-on', 80), skater('never', 70)]);
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
    setRegularSeason([skater('claimed-last', 100), skater('traded-last', 90), skater('dropped-last', 80)]);
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
    setRegularSeason([skater('s1', 100)], [goalie('g1', 50)]);
    // every Fantrax read takes 20 seconds
    fantrax.onRead = () => { clock.time += 20_000; };
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: true, done: false, stepsDone: 2, steps: 10 });
    assert.deepEqual(fantrax.reads.map(read => read.split(' ')[0]), ['leagueInfo', 'skaters']);
    // an unfinished prepare shows no ballot
    const unfinished = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.equal(unfinished.vote?.preparedAt, null);
    assert.equal(unfinished.ballot, null);

    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: true, done: false, stepsDone: 4, steps: 10 });
    assert.deepEqual(fantrax.reads.map(read => read.split(' ')[0]).slice(0, 4), ['leagueInfo', 'skaters', 'goalies', 'dayRosters']);
    assert.deepEqual((await prepareFully()).result, { ok: true, done: true, stepsDone: 10, steps: 10 });
    // each call carried on where the last stopped, so nothing was read twice
    assert.equal(new Set(fantrax.reads).size, fantrax.reads.length);
    const { ballot } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.deepEqual(ballot![0].candidates.map(candidate => candidate.playerId), ['s1', 'g1']);
});

test('a failed Fantrax read stops preparing with its reason, and the next call retries it', async t => {
    t.mock.method(console, 'error', () => {});
    const { act, vote, setRegularSeason, prepareFully, fantrax } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 100)], [goalie('g1', 50)]);
    fantrax.down.add('goalies');
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: false, reason: 'fantrax-failed', message: 'Fantrax goalies returned 503' });
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
    setRegularSeason([skater('s1', 100), skater('d1', 60, { positions: 'D' })]);
    await prepareFully();
    // a stat correction: s1's points move, d1's go, and s2 has some
    setRegularSeason([skater('s1', 104), skater('s2', 20), skater('d1', 0, { positions: 'D' })]);
    clock.time += 3600_000;
    await prepareFully();
    const { vote: summary, ballot } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.equal(summary?.preparedAt, new Date(clock.time).toISOString());
    assert.deepEqual(ballot!.map(award => award.candidates.map(candidate => [candidate.playerId, candidate.stats.regularSeason?.points])), [
        [['s1', 104], ['s2', 20]],
        [['s1', 104], ['s2', 20]],
        [],
        [],
        [],
        [],
    ]);
});
