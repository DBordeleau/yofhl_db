import assert from 'node:assert/strict';
import test from 'node:test';
import type { SeasonDraftSelection } from '../history/model';
import { draftRegrets, laterAlternatives, rankDraft } from './hindsight';

const pick = (overall: number, points: number | null, positions = 'C'): SeasonDraftSelection => ({
    year: 2024, overall, round: 1, pick: overall, playerId: `p${overall}`, player: `Player ${overall}`, positions, points, fpg: null,
    franchiseId: overall % 2 + 1, teamName: 'Team', teamAbbreviation: 'TEAM', teamLogo: null,
});

test('hindsight ranks ties equally and distinguishes missing stats, zero, and empty slots', () => {
    const picks = [pick(1, 0), pick(2, null), pick(3, 100), pick(4, 100), { ...pick(5, 200), playerId: null }];
    const ranked = rankDraft(picks, [], 'season');
    assert.deepEqual(ranked.map(p => [p.overall, p.rank, p.movement]), [[3, 1, 2], [4, 1, 3], [1, 3, -2]]);
    assert.equal(picks[0].overall, 1, 'Input order must not change');
});

test('since-draft totals exclude earlier seasons and leave wholly missing players unranked', () => {
    const ranked = rankDraft([pick(1, 20), pick(2, null)], [
        { playerId: 'p1', year: 2023, points: 900 }, { playerId: 'p1', year: 2024, points: 20.25 },
        { playerId: 'p1', year: 2026, points: 30.5 },
    ], 'since');
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].value, 50.75);
});

test('regrets use only better later selections and optionally match any eligible position', () => {
    const ranked = rankDraft([pick(1, 400), pick(2, 100, 'C,LW'), pick(3, 300, 'G'), pick(4, 250, 'LW'), pick(5, 100)], [], 'season');
    const selected = ranked.find(p => p.overall === 2)!;
    assert.deepEqual(laterAlternatives(selected, ranked, true).map(p => p.overall), [4]);
    assert.deepEqual(laterAlternatives(selected, ranked, false).map(p => p.overall), [3, 4]);
    assert.equal(draftRegrets(ranked, true).find(r => r.pick.overall === 2)?.gap, 150);
    assert.equal(draftRegrets(ranked, false).find(r => r.pick.overall === 2)?.gap, 200);
    assert.deepEqual(laterAlternatives(ranked.find(p => p.overall === 5)!, ranked, false), []);
});
