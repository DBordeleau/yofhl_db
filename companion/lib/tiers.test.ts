import test from 'node:test';
import assert from 'node:assert/strict';
import { initialDraft, recordPick, type Player, type Position, type Snapshot } from './model';
import { applyPlan } from './order';
import { evaluateDraft } from './forecast';
import { buildTiers, tierStarts } from './tiers';

const player = (id: string, positions: Position[], points: number): Player => ({ id, name: id, positions, team: 'NHL', age: 25, available: true, note: '',
    previous: { points, games: 84, perGame: points / 84, categories: {} }, projected: { points, games: 84, perGame: points / 84, categories: {} } });
const snapshot = (players: Player[]): Snapshot => ({ version: 1, season: '2026–2027', fetchedAt: '2026-10-09T18:00:00Z', keeperSavedAt: '', keeperIds: [], minorIds: [], warnings: [], players });
// The RW board from draft night: Boldy alone, then Nylander/Thompson, Jarvis/Zibanejad, and a long flat group.
const rw = [518, 492, 481, 453, 453, 434, 426, 425, 424, 420, 418, 417, 405, 405, 401, 401, 400, 394];

test('tiers are the fewest 20-point groups, with breaks placed in the biggest gaps', () => {
    assert.deepEqual(tierStarts(rw), [0, 1, 3, 5, 12]);
    assert.deepEqual(tierStarts([]), []);
    assert.deepEqual(tierStarts([300]), [0]);
    // A smooth slide still splits by width, choosing the larger 6-point gap over the 4-point ones.
    assert.deepEqual(tierStarts([400, 396, 392, 386, 382, 378]), [0, 3]);
});

test('strong breaks mark real drops; width-only splits stay soft', () => {
    const members = rw.map((points, i) => ({ player: player(`p${i}`, ['RW'], points), points, takenBy: null }));
    const tiers = buildTiers('RW', members);
    assert.deepEqual(tiers.map(t => t.members.length), [1, 2, 2, 7, 6]);
    assert.deepEqual(tiers.map(t => t.strongBreak), [false, true, true, true, false]);
    assert.equal(tiers[1].gapAbove, 26); assert.equal(tiers[4].gapAbove, 12);
    assert.equal(tiers[3].top, 434); assert.equal(tiers[3].bottom, 417);
});

test('tiers stay fixed as players are drafted and report players left and expected survivors', () => {
    const s = snapshot([...rw.map((points, i) => player(`rw${i}`, ['RW'], points)), player('g1', ['G'], 400), player('g2', ['G'], 300)]);
    let d = applyPlan(initialDraft(s), { order: ['A', 'Varrock', 'A', 'A', 'Varrock'], myTeam: 'Varrock', keepers: {} });
    const before = evaluateDraft(s, d);
    d = recordPick(d, s.players[1]);
    const after = evaluateDraft(s, d), tiers = after.tiers.get('RW')!;
    assert.deepEqual(tiers.map(t => t.members.map(m => m.player.id)), before.tiers.get('RW')!.map(t => t.members.map(m => m.player.id)));
    assert.equal(tiers[1].left, 1); assert.equal(tiers[1].members[0].takenBy, 'A');
    assert.equal(after.tierOf.get('RW:rw2'), tiers[1]);
    // It is our pick: nobody else picks first, so every remaining tier player survives to it.
    assert.equal(tiers[3].expected!.atPick, 7);
    assert.ok(tiers[0].expected!.atNext! < 1, 'Boldy rarely survives two opponent picks');
    assert.equal(evaluateDraft(s, initialDraft(s)).tiers.get('RW')![0].expected, null, 'no order, no simulations');
});
