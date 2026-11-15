import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateColumns, listCandidates, statLeaders, statValue } from './candidate-list';
import type { BallotAward, GoalieLine, PlayerCandidate, SkaterLine, StatLine } from './model';
import { awardVoteLeague, goalie, SEASON, skater } from './testing/award-vote-league';

// 60 skaters, p01 with the most FPts (160) down to p60 (101), p02 with the most hits, then a goalie with 100 FPts
const id = (rank: number) => `p${String(rank).padStart(2, '0')}`;
async function preparedBallot(t: import('node:test').TestContext) {
    const { act, vote, setRegularSeason, prepareFully } = await awardVoteLeague(t);
    setRegularSeason(
        Array.from({ length: 60 }, (_, index) => skater(id(index + 1), 160 - index, { hits: index === 1 ? 99 : index, name: index === 54 ? 'Juraj Slafkovský' : `Skater ${id(index + 1)}` })),
        [goalie('g1', 100, { name: 'Ilya Sorokin', saves: 300 })],
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
    assert.deepEqual(candidateColumns(gretzky).map(column => column.label), ['FPts', 'FP/G', 'GP', 'G', 'A', 'P', 'SOG', 'Hit', 'Blk', 'W', 'GA', 'SV', 'SHO']);
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

test("a list shows only the goalie categories its candidates' lines have, in order, and sorts by any of them", () => {
    const candidate = (playerId: string, line: StatLine) =>
        ({ playerId, name: playerId, positions: [line.group === 'goalie' ? 'G' : 'C'], nhlTeam: null, team: null, stats: { regularSeason: line } });
    const goalie = (savePercentage: number | null) => ({ group: 'goalie' as const, points: 10, perGame: 1, gamesPlayed: 10, wins: 5, overtimeLosses: 1, savePercentage, shutouts: 0 });
    const award: BallotAward = {
        award: 'wayne-gretzky', label: 'Wayne Gretzky Award', honor: '', shown: 50, statSets: [{ name: 'regularSeason', label: 'Regular season' }],
        candidates: [
            candidate('s1', { group: 'skater', points: 30, perGame: 3, gamesPlayed: 10, goals: 1, assists: 1, shots: 1, hits: 1, blocks: 1 }),
            candidate('g-low', goalie(0.901)),
            candidate('g-none', goalie(null)),
            candidate('g-high', goalie(0.925)),
        ],
    };
    assert.deepEqual(candidateColumns(award).map(column => column.label), ['FPts', 'FP/G', 'GP', 'G', 'A', 'P', 'SOG', 'Hit', 'Blk', 'W', 'OL+ShL', 'SV%', 'SHO']);
    // a skater, or a goalie with no SV%, goes last either way
    assert.deepEqual(listCandidates(award, { sortBy: 'savePercentage' }).map(c => c.playerId), ['g-high', 'g-low', 's1', 'g-none']);
    assert.deepEqual(listCandidates(award, { sortBy: 'savePercentage', ascending: true }).map(c => c.playerId), ['g-low', 'g-high', 's1', 'g-none']);
    const goaliesOnly = { ...award, candidates: award.candidates.slice(1) };
    assert.deepEqual(candidateColumns(goaliesOnly).map(column => column.label), ['FPts', 'FP/G', 'GP', 'W', 'OL+ShL', 'SV%', 'SHO']);
});

const skaterLine = (points: number, more: Partial<SkaterLine> = {}): SkaterLine =>
    ({ group: 'skater', points, perGame: points / 10, gamesPlayed: 10, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, ...more });
const goalieLine = (points: number, more: Partial<GoalieLine> = {}): GoalieLine =>
    ({ group: 'goalie', points, perGame: points / 10, gamesPlayed: 10, wins: 0, goalsAgainst: 0, saves: 0, shutouts: 0, ...more });
const candidateOf = (playerId: string, stats: PlayerCandidate['stats']): PlayerCandidate =>
    ({ playerId, name: `Player ${playerId}`, positions: ['C'], nhlTeam: null, team: null, stats });
const regularSeasonAward = (candidates: PlayerCandidate[], shown: number | null = 50): BallotAward => ({
    award: 'wayne-gretzky', label: 'Wayne Gretzky Award', honor: '', shown, statSets: [{ name: 'regularSeason', label: 'Regular season' }], candidates,
});

test("skaters show P, their goals and assists, right after A, sortable like any column, and goalies have none", () => {
    const award = regularSeasonAward([
        candidateOf('few', { regularSeason: skaterLine(300, { goals: 2, assists: 3 }) }),
        candidateOf('many', { regularSeason: skaterLine(200, { goals: 7, assists: 9 }) }),
        candidateOf('g', { regularSeason: goalieLine(150) }),
        candidateOf('some', { regularSeason: skaterLine(100, { goals: 10, assists: 0 }) }),
    ]);
    assert.deepEqual(candidateColumns(award).map(column => column.label), ['FPts', 'FP/G', 'GP', 'G', 'A', 'P', 'SOG', 'Hit', 'Blk', 'W', 'GA', 'SV', 'SHO']);
    assert.equal(statValue(award.candidates[1], 'regularSeason', 'goalsAndAssists'), 16);
    assert.equal(statValue(award.candidates[2], 'regularSeason', 'goalsAndAssists'), null);
    assert.deepEqual(listCandidates(award, { sortBy: 'goalsAndAssists' }).map(c => c.playerId), ['many', 'some', 'few', 'g']);
    assert.deepEqual(listCandidates(award, { sortBy: 'goalsAndAssists', ascending: true }).map(c => c.playerId), ['few', 'some', 'many', 'g']);
    // a list of goalies alone has no P
    assert.ok(!candidateColumns(regularSeasonAward([award.candidates[2]])).some(column => column.label === 'P'));
});

test("each column's best value across the award's whole list leads it, ties all lead, and goals against never does", () => {
    const award = regularSeasonAward([
        candidateOf('top', { regularSeason: skaterLine(300, { goals: 5, assists: 5, hits: 10 }) }),
        candidateOf('second', { regularSeason: skaterLine(200, { goals: 5, assists: 1, hits: 30 }) }),
        // outside the top 2 the list opens on, and the only one who blocks
        candidateOf('deep', { regularSeason: skaterLine(110, { goals: 1, assists: 20, hits: 30, blocks: 4 }) }),
        candidateOf('g-busy', { regularSeason: goalieLine(105, { wins: 6, goalsAgainst: 40, saves: 400 }) }),
        candidateOf('g-tidy', { regularSeason: goalieLine(101, { wins: 6, goalsAgainst: 10, saves: 100, savePercentage: null }) }),
    ], 2);
    const leads = statLeaders(award);
    const leaders = (key: Parameters<typeof leads>[2]) => award.candidates.filter(candidate => leads(candidate, 'regularSeason', key)).map(c => c.playerId);
    assert.deepEqual(leaders('points'), ['top']);
    assert.deepEqual(leaders('perGame'), ['top']);
    // everyone played 10 games
    assert.deepEqual(leaders('gamesPlayed'), ['top', 'second', 'deep', 'g-busy', 'g-tidy']);
    assert.deepEqual(leaders('goals'), ['top', 'second']);
    assert.deepEqual(leaders('goalsAndAssists'), ['deep']);
    assert.deepEqual(leaders('hits'), ['second', 'deep']);
    assert.deepEqual(leaders('blocks'), ['deep']);
    assert.deepEqual(leaders('wins'), ['g-busy', 'g-tidy']);
    assert.deepEqual(leaders('saves'), ['g-busy']);
    assert.deepEqual(leaders('goalsAgainst'), []);
    // a column nobody has a value in has no leader
    assert.deepEqual(leaders('savePercentage'), []);
    assert.deepEqual(leaders('overtimeLosses'), []);

    // the same whatever the list shows
    assert.ok(!listCandidates(award).some(candidate => candidate.playerId === 'deep'));
    const shown = (view: Parameters<typeof listCandidates>[1]) =>
        listCandidates(award, view).filter(candidate => leads(candidate, 'regularSeason', 'goalsAndAssists')).map(c => c.playerId);
    assert.deepEqual(shown({ search: 'deep' }), ['deep']);
    assert.deepEqual(shown({ sortBy: 'goalsAndAssists' }), ['deep']);
    assert.deepEqual(shown({ search: 'top' }), []);
});

test("each of the Danny Briere Award's stat sets has its own leaders", () => {
    const award: BallotAward = {
        award: 'danny-briere', label: 'Danny Briere Trophy', honor: '', shown: 50,
        statSets: [{ name: 'playoffRounds', label: 'Playoffs' }, { name: 'final', label: 'Final' }],
        candidates: [
            candidateOf('rounds', { playoffRounds: skaterLine(60, { goals: 6 }), final: skaterLine(10, { goals: 1 }) }),
            candidateOf('final', { playoffRounds: skaterLine(40, { goals: 2 }), final: skaterLine(20, { goals: 2 }) }),
        ],
    };
    const leads = statLeaders(award);
    assert.deepEqual(award.candidates.map(candidate => [leads(candidate, 'playoffRounds', 'points'), leads(candidate, 'final', 'points')]), [[true, false], [false, true]]);
    assert.deepEqual(award.candidates.map(candidate => [leads(candidate, 'playoffRounds', 'goals'), leads(candidate, 'final', 'goals')]), [[true, false], [false, true]]);
    // nobody has a regular-season line here
    assert.ok(!award.candidates.some(candidate => leads(candidate, 'regularSeason', 'points')));
});
