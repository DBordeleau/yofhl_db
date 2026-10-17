import test from 'node:test';
import assert from 'node:assert/strict';
import { keeperCounts, parseFantraxOrder, parseFantraxRosters } from './fantrax-order';
import { applyPlan, draftTurn } from './order';
import type { Draft, Player, Position } from './model';

const mine = '7jmn4yymmutybt24';
const info = { seasonYear: 2026, teamInfo: { a: { name: 'Team A' }, b: { name: 'Team B' }, [mine]: { name: 'Varrock' } } };
const results = { draftType: 'snake', draftOrder: ['a', 'b', mine], draftPicks: [
    { pick: 1, round: 1, pickInRound: 1, teamId: 'b' },
    { pick: 2, round: 1, pickInRound: 2, teamId: 'a' },
    { pick: 3, round: 1, pickInRound: 3, teamId: mine },
    { pick: 4, round: 2, pickInRound: 1, teamId: mine },
    { pick: 5, round: 2, pickInRound: 2, teamId: 'b' },
    { pick: 6, round: 2, pickInRound: 3, teamId: mine },
] };

test('Fantrax import uses explicit overall picks, including lottery changes and traded owners', () => {
    const plan = parseFantraxOrder(info, { ...results, draftPicks: [...results.draftPicks].reverse() }, '2026-10-09T20:00:00Z');
    assert.deepEqual(plan.order, ['Team B', 'Team A', 'Varrock', 'Varrock', 'Team B', 'Varrock']);
    assert.equal(plan.myTeam, 'Varrock'); assert.equal(plan.fantraxFetchedAt, '2026-10-09T20:00:00Z');
});
test('Fantrax import retains recorded selections and maps their owners without clearing progress', () => {
    const draft: Draft = { version: 1, keeperIds: [], minorIds: [], poolIds: ['p1', 'p2'], poolLabel: 'Pool', importedAt: null,
        picks: [{ id: 'p1', mine: false }, { id: 'p2', mine: false }] };
    const updated = applyPlan(draft, parseFantraxOrder(info, results));
    assert.deepEqual(updated.picks.map(p => p.id), ['p1', 'p2']);
    assert.deepEqual(updated.picks.map(p => p.team), ['Team B', 'Team A']);
    assert.equal(draftTurn(updated).first, 2); assert.equal(draftTurn(updated).between, 0);
    const conflicting = { ...updated, picks: [{ ...updated.picks[0], team: 'Team A' }] };
    assert.throws(() => applyPlan(conflicting, parseFantraxOrder(info, results)), /conflicts/);
    assert.equal(conflicting.picks[0].team, 'Team A');
});
test('incomplete, duplicate, wrong-season and unknown-owner data is rejected', () => {
    for (const bad of [null, {}, { draftPicks: [] },
        { draftPicks: results.draftPicks.slice(1) },
        { draftPicks: [...results.draftPicks, results.draftPicks[0]] },
        { draftPicks: results.draftPicks.map(p => ({ ...p, teamId: 'unknown' })) },
        { draftPicks: [{ ...results.draftPicks[0], pick: '1' }] },
    ]) assert.throws(() => parseFantraxOrder(info, bad), /invalid draft order/);
    assert.throws(() => parseFantraxOrder({ ...info, seasonYear: 2025 }, results), /invalid/);
    assert.throws(() => parseFantraxOrder({ ...info, teamInfo: { ...info.teamInfo, a: { name: 'Team B' } } }, results), /invalid/);
    assert.throws(() => parseFantraxOrder(info, results, 'not-a-date'), /Enter/);
});
test('opponent keeper counts come from Fantrax playing rosters, once per player, skipping minors and recorded picks', () => {
    const player = (id: string, positions: Position[]): Player => ({ id, name: id, positions, team: '', available: false, age: null, note: '', previous: null, projected: null });
    const rosters = parseFantraxRosters(info, { rosters: {
        a: { rosterItems: [{ id: '*f*', status: 'ACTIVE' }, { id: 'c', status: 'RESERVE' }, { id: 'g', status: 'INJURED_RESERVE' }, { id: 'kid', status: 'MINORS' }, { id: 'pick', status: 'ACTIVE' }] },
        [mine]: { rosterItems: [{ id: 'c', status: 'ACTIVE' }] },
    } });
    assert.deepEqual(rosters, { 'Team A': ['f', 'c', 'g', 'pick'] });
    const counts = keeperCounts([player('f', ['LW', 'C']), player('c', ['C']), player('g', ['G']), player('kid', ['D']), player('pick', ['D'])], rosters, new Set(['pick']));
    assert.deepEqual(counts, { 'Team A': { LW: 1, C: 1, RW: 0, D: 0, G: 1 } });
    assert.throws(() => parseFantraxRosters(info, { rosters: { a: {} } }), /invalid rosters/);
});
