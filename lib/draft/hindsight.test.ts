import assert from 'node:assert/strict';
import test from 'node:test';
import type { SeasonDraftSelection } from '../history/model';
import { draftRegrets, laterAlternatives, rankDraft, redraftBoard, topSteals, type RankedPick } from './hindsight';

const pick = (overall: number, points: number | null, positions = 'C'): SeasonDraftSelection => ({
    year: 2024, overall, round: 1, pick: overall, playerId: `p${overall}`, player: `Player ${overall}`, positions, points, fpg: null,
    franchiseId: overall % 2 + 1, teamName: 'Team', teamAbbreviation: 'TEAM', teamLogo: null, regretEligible: true,
});

const rankedPick = (overall: number, rank: number, points = 100): RankedPick => ({
    ...pick(overall, points), value: points, rank, movement: overall - rank,
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

test('development picks cannot be regrets but remain ranked, redrafted, steals and later alternatives', () => {
    const picks = [pick(1, 100), { ...pick(2, 0), regretEligible: false }, { ...pick(3, 400), regretEligible: false }, pick(4, 500)];
    const ranked = rankDraft(picks);
    for (const samePosition of [true, false]) {
        assert.deepEqual(draftRegrets(ranked, samePosition).map(r => r.pick.overall), [1]);
        assert.deepEqual(laterAlternatives(ranked.find(p => p.overall === 1)!, ranked, samePosition).map(p => p.overall), [4, 3]);
    }
    assert.equal(ranked.length, 4);
    assert.ok(topSteals(ranked).some(p => p.overall === 3));
    assert.deepEqual(redraftBoard(picks, ranked).map(row => row.redrafted?.overall), [4, 3, 1, 2]);
    assert.deepEqual(draftRegrets(rankDraft(picks.map(p => ({ ...p, regretEligible: false }))), false), []);
});

test('steals keep only climbers, best value first, capped at the requested limit', () => {
    const ranked = rankDraft([pick(1, 100), pick(2, 300), pick(3, 50), pick(4, 400), pick(5, 200)]);
    assert.deepEqual(topSteals(ranked).map(p => [p.overall, p.movement]), [[4, 3], [5, 2]]);
    assert.deepEqual(topSteals(ranked, 1).map(p => p.overall), [4]);
});

test('steals value Hagel finishing fifth above a larger climb to 36th', () => {
    const hagel = { ...rankedPick(56, 5, 400), player: 'Brandon Hagel' };
    const debrusk = { ...rankedPick(88, 36, 250), player: 'Jake DeBrusk' };
    const ranked = [debrusk, hagel];
    const original = structuredClone(ranked);
    assert.deepEqual(topSteals(ranked), [hagel, debrusk]);
    assert.deepEqual(ranked, original, 'Sorting must preserve source order, stats, and displayed movement');
});

test('steals reward climbing near the top more than equal or larger gains late in the class', () => {
    const lateClimb = rankedPick(80, 70, 100);
    const topTenClimb = rankedPick(20, 10, 300);
    const firstPlaceClimb = rankedPick(10, 1, 500);
    assert.deepEqual(topSteals([lateClimb, topTenClimb, firstPlaceClimb]), [firstPlaceClimb, topTenClimb, lateClimb]);
});

test('steals reward a later draft slot for the same scoring finish', () => {
    const early = rankedPick(10, 5, 400);
    const late = rankedPick(56, 5, 400);
    assert.deepEqual(topSteals([early, late]), [late, early]);
});

test('steals break equal proportional gains by production then original draft order', () => {
    const late = rankedPick(80, 40, 100);
    const early = rankedPick(20, 10, 300);
    const earliest = rankedPick(10, 5, 300);
    assert.deepEqual(topSteals([late, early, earliest]), [earliest, early, late]);
});

test('steals apply the default top-ten cutoff after weighting and exclude non-climbers', () => {
    const lateClimbers = Array.from({ length: 12 }, (_, index) => rankedPick(80 + index, 60 + index, 200 - index));
    const winner = rankedPick(10, 1, 500);
    const steals = topSteals([...lateClimbers, winner, rankedPick(2, 2, 490), rankedPick(1, 3, 480)]);
    assert.deepEqual(steals, [winner, ...lateClimbers.slice(0, 9)]);
    assert.deepEqual(topSteals([]), []);
    assert.deepEqual(topSteals([rankedPick(1, 1), rankedPick(2, 3)]), []);
});
