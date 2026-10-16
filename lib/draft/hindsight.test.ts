import assert from 'node:assert/strict';
import test from 'node:test';
import type { SeasonDraftSelection } from '../history/model';
import { draftRegrets, laterAlternatives, rankDraft, redraftBoard } from './hindsight';

const pick = (overall: number, points: number | null, positions = 'C'): SeasonDraftSelection => ({
    year: 2024, overall, round: 1, pick: overall, playerId: `p${overall}`, player: `Player ${overall}`, positions, points, fpg: null,
    franchiseId: overall % 2 + 1, teamName: 'Team', teamAbbreviation: 'TEAM', teamLogo: null,
});

test('hindsight ranks ties equally and distinguishes missing stats, zero, and empty slots', () => {
    const picks = [pick(1, 0), pick(2, null), pick(3, 100), pick(4, 100), { ...pick(5, 200), playerId: null }];
    const ranked = rankDraft(picks);
    assert.deepEqual(ranked.map(p => [p.overall, p.rank, p.movement]), [[3, 1, 2], [4, 1, 3], [1, 3, -2]]);
    assert.equal(picks[0].overall, 1, 'Input order must not change');
});

test('redraft pairs original slots with production order without reassigning empty or unknown slots', () => {
    const picks = [pick(4, 300), pick(1, 100), { ...pick(2, null), playerId: null }, pick(3, null), pick(5, 300)];
    const board = redraftBoard(picks, rankDraft(picks));
    assert.deepEqual(board.map(row => [row.original.overall, row.redrafted?.overall ?? null]), [[1, 4], [2, null], [3, null], [4, 5], [5, 1]]);
    assert.deepEqual(board.filter(row => row.original.franchiseId === 2).map(row => row.redrafted?.overall ?? null), [4, null, 1]);
    assert.equal(picks[0].overall, 4, 'Original source order is preserved');
});

test('regrets use only better later selections and optionally match any eligible position', () => {
    const ranked = rankDraft([pick(1, 400), pick(2, 100, 'C,LW'), pick(3, 300, 'G'), pick(4, 250, 'LW'), pick(5, 100)]);
    const selected = ranked.find(p => p.overall === 2)!;
    assert.deepEqual(laterAlternatives(selected, ranked, true).map(p => p.overall), [4]);
    assert.deepEqual(laterAlternatives(selected, ranked, false).map(p => p.overall), [3, 4]);
    assert.equal(draftRegrets(ranked, true).find(r => r.pick.overall === 2)?.gap, 150);
    assert.equal(draftRegrets(ranked, false).find(r => r.pick.overall === 2)?.gap, 200);
    assert.deepEqual(laterAlternatives(ranked.find(p => p.overall === 5)!, ranked, false), []);
});

test('regrets and alternatives include exactly 100 FPts but exclude a 99.75 FPts gap', () => {
    const ranked = rankDraft([pick(1, 100), pick(2, 199.75), pick(3, 200), pick(4, 199.5)]);
    const selected = ranked.find(p => p.overall === 1)!;
    assert.deepEqual(laterAlternatives(selected, ranked, false).map(p => p.overall), [3]);
    assert.deepEqual(draftRegrets(ranked, false).map(r => [r.pick.overall, r.gap]), [[1, 100]]);
    assert.deepEqual(draftRegrets(rankDraft([pick(1, 100), pick(2, 199.75)]), false), []);
});
