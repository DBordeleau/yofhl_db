import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateColumns, listCandidates } from './candidate-list';
import { awardVoteLeague, goalie, savePercentageGoalie, SEASON, skater } from './testing/award-vote-league';

// Fantrax's goalie table shows the categories its league scores: the 2025–26 league scored OL+ShL and SV%, the
// 2026–27 league OL+ShL, GA and SV.

test("a season whose league scores SV% but no GA or SV prepares, and its goalies carry only the league's categories", async t => {
    const { act, vote, setRegularSeason, prepareFully } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 500)], [
        savePercentageGoalie('g1', 450, { name: 'Andrei Vasilevskiy', perGame: 9.38, gamesPlayed: 48, wins: 33, overtimeLosses: 3, savePercentage: 0.915, shutouts: 2 }),
        savePercentageGoalie('g2', 412, { name: 'Jeremy Swayman', savePercentage: 0.921 }),
    ]);
    assert.deepEqual((await prepareFully()).result, { ok: true, done: true, stepsDone: 10, steps: 10 });
    const ballot = (await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot!;
    const hasek = ballot.find(award => award.award === 'hasek')!;
    assert.deepEqual(hasek.candidates[0].stats.regularSeason,
        { group: 'goalie', points: 450, perGame: 9.38, gamesPlayed: 48, wins: 33, overtimeLosses: 3, savePercentage: 0.915, shutouts: 2 });
    assert.deepEqual(candidateColumns(hasek).map(column => column.label), ['FPts', 'FP/G', 'GP', 'W', 'OL+ShL', 'SV%', 'SHO']);
    assert.deepEqual(listCandidates(hasek, { sortBy: 'savePercentage' }).map(candidate => candidate.playerId), ['g2', 'g1']);
    // a list of skaters and goalies shows both groups' columns
    const gretzky = ballot.find(award => award.award === 'wayne-gretzky')!;
    assert.deepEqual(candidateColumns(gretzky).map(column => column.label),
        ['FPts', 'FP/G', 'GP', 'G', 'A', 'SOG', 'Hit', 'Blk', 'W', 'OL+ShL', 'SV%', 'SHO']);
});

test('a season whose league scores GA and SV keeps them', async t => {
    const { act, vote, setRegularSeason, prepareFully } = await awardVoteLeague(t);
    setRegularSeason([], [goalie('g1', 308.1, { perGame: 6.29, gamesPlayed: 49, wins: 30, overtimeLosses: 2, goalsAgainst: 127, saves: 1137, shutouts: 1 })]);
    await prepareFully();
    const hasek = (await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot!.find(award => award.award === 'hasek')!;
    assert.deepEqual(hasek.candidates[0].stats.regularSeason,
        { group: 'goalie', points: 308.1, perGame: 6.29, gamesPlayed: 49, wins: 30, overtimeLosses: 2, goalsAgainst: 127, saves: 1137, shutouts: 1 });
    assert.deepEqual(candidateColumns(hasek).map(column => column.label), ['FPts', 'FP/G', 'GP', 'W', 'OL+ShL', 'GA', 'SV', 'SHO']);
});

test('an unfinished prepare that stopped at the goalie step carries on, or starts over, with the league\'s categories', async t => {
    t.mock.method(console, 'error', () => {});
    const { act, vote, setRegularSeason, prepareFully, fantrax } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 500)], [savePercentageGoalie('g1', 450, { savePercentage: 0.915 })]);
    // as the earlier reader stopped on a table without GA
    fantrax.down.add('goalies');
    assert.equal((await prepareFully()).result.ok, false);
    fantrax.down.clear();
    assert.deepEqual((await prepareFully()).result, { ok: true, done: true, stepsDone: 10, steps: 10 });
    const ballot = async () => (await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot!;
    assert.equal((await ballot()).find(award => award.award === 'hasek')!.candidates[0].stats.regularSeason?.group, 'goalie');

    fantrax.down.add('goalies');
    await prepareFully();
    fantrax.down.clear();
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON, startOver: true })), { ok: true, done: false, stepsDone: 1, steps: 10 });
    assert.equal((await prepareFully()).result.ok, true);
    const hasek = (await ballot()).find(award => award.award === 'hasek')!;
    assert.deepEqual(candidateColumns(hasek).map(column => column.label), ['FPts', 'FP/G', 'GP', 'W', 'OL+ShL', 'SV%', 'SHO']);
});
