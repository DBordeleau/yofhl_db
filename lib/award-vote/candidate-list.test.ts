import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateColumns, listCandidates } from './candidate-list';
import { awardVoteLeague, goalie, SEASON, skater } from './testing/award-vote-league';

// 60 skaters, p01 with the most FPts (160) down to p60 (101), p02 with the most hits, then a goalie with 10 FPts
const id = (rank: number) => `p${String(rank).padStart(2, '0')}`;
async function preparedBallot(t: import('node:test').TestContext) {
    const { act, vote, setRegularSeason, prepareFully } = await awardVoteLeague(t);
    setRegularSeason(
        Array.from({ length: 60 }, (_, index) => skater(id(index + 1), 160 - index, { hits: index === 1 ? 99 : index, name: index === 54 ? 'Juraj Slafkovský' : `Skater ${id(index + 1)}` })),
        [goalie('g1', 10, { name: 'Ilya Sorokin', saves: 300 })],
    );
    await prepareFully();
    return (await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot!;
}

test('each list opens on the top 50 candidates by FPts', async t => {
    const [gretzky] = await preparedBallot(t);
    assert.equal(gretzky.candidates.length, 61);
    assert.deepEqual(listCandidates(gretzky).map(candidate => candidate.playerId), Array.from({ length: 50 }, (_, index) => id(index + 1)));
});

test('a list sorts every candidate by any stat column and shows the top 50 of that ranking, and a column a candidate lacks puts them last', async t => {
    const [gretzky] = await preparedBallot(t);
    const byHits = listCandidates(gretzky, { sortBy: 'hits' }).map(candidate => candidate.playerId);
    // p51 to p60 are outside the FPts top 50 but have the most hits after p02
    assert.deepEqual(byHits.slice(0, 3), ['p02', 'p60', 'p59']);
    assert.equal(byHits.length, 50);
    assert.ok(!byHits.includes('p01') && !byHits.includes('g1'));
    assert.deepEqual(listCandidates(gretzky, { sortBy: 'hits', ascending: true }).map(candidate => candidate.playerId).slice(0, 2), ['p01', 'p03']);
    // the goalie is found by search, and has no hits
    assert.deepEqual(listCandidates(gretzky, { sortBy: 'hits', search: 'o' }).map(candidate => candidate.playerId).at(-1), 'g1');
    assert.deepEqual(candidateColumns(gretzky).map(column => column.label), ['FPts', 'FP/G', 'GP', 'G', 'A', 'SOG', 'Hit', 'Blk', 'W', 'GA', 'SV', 'SHO']);
});

test('search finds any eligible candidate outside the top 50, ignoring case and accents', async t => {
    const [gretzky, , orr, hasek] = await preparedBallot(t);
    assert.deepEqual(listCandidates(gretzky, { search: 'slafkovsky' }).map(candidate => candidate.playerId), ['p55']);
    assert.deepEqual(listCandidates(gretzky, { search: 'SOROKIN' }).map(candidate => candidate.playerId), ['g1']);
    // only an award's own candidates
    assert.deepEqual(listCandidates(orr, { search: 'sorokin' }), []);
    assert.deepEqual(listCandidates(hasek, { search: 'sorokin' }).map(candidate => candidate.playerId), ['g1']);
    assert.deepEqual(candidateColumns(hasek).map(column => column.label), ['FPts', 'FP/G', 'GP', 'W', 'GA', 'SV', 'SHO']);
});
