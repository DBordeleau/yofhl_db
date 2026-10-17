import test from 'node:test';
import assert from 'node:assert/strict';
import { initialDraft, mergeSnapshot, parseWorkspace, recordPick, type Player, type Position, type Snapshot } from './model';
import { applyPlan, draftTurn, parseOrder, validatePlan } from './order';
import { evaluateDraft } from './forecast';

const close = (actual: number | null | undefined, expected: number) => assert.ok(actual != null && Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

const player = (id: string, positions: Position[], points: number): Player => ({ id, name: id, positions, team: 'NHL', age: 25, available: true, note: '',
    previous: { points, games: 84, perGame: points / 84, categories: {} }, projected: { points, games: 84, perGame: points / 84, categories: {} } });
const snapshot = (players: Player[]): Snapshot => ({ version: 1, season: '2026–2027', fetchedAt: '2026-10-09T18:00:00Z', keeperSavedAt: '', keeperIds: [], minorIds: [], warnings: [], players });
const plan = (order: string[]) => ({ order, myTeam: 'Varrock', keepers: {} });
const pool = () => [player('d1', ['D'], 500), player('d2', ['D'], 495), ...Array.from({ length: 12 }, (_, i) => player(`d-low-${i}`, ['D'], 190 - i)),
    ...Array.from({ length: 20 }, (_, i) => player(`f-${i}`, ['LW', 'C', 'RW'], 510 - i * 3))];

test('order handles numbered lines, traded owners, and unequal gaps without assuming snake rounds', () => {
    assert.deepEqual(parseOrder('1. A\n2) Varrock\r\n3. B\n\n4\tVarrock'), ['A', 'Varrock', 'B', 'Varrock']);
    const s = snapshot(pool()), d = applyPlan(initialDraft(s), plan(['A', 'Varrock', 'B', 'A', 'Varrock', 'Varrock']));
    const turn = draftTurn(d);
    assert.equal(turn.first, 1); assert.equal(turn.next, 4); assert.equal(turn.before, 1); assert.equal(turn.between, 2);
});
test('scheduled picks assign the correct owner and reject the wrong team or an exhausted order', () => {
    const s = snapshot(pool()); let d = applyPlan(initialDraft(s), plan(['A', 'Varrock']));
    assert.throws(() => recordPick(d, s.players[0], true), /A/);
    d = recordPick(d, s.players[0]); assert.equal(d.picks[0].team, 'A'); assert.equal(d.picks[0].mine, false);
    d = recordPick(d, s.players[1]); assert.equal(d.picks[1].mine, true); assert.equal(d.picks[1].slot, 1);
    assert.equal(draftTurn(d).current, null); assert.throws(() => recordPick(d, s.players[2]), /complete/);
});
test('undoing an earlier pick reopens its slot without shifting later owners', () => {
    const s = snapshot(pool()); let d = applyPlan(initialDraft(s), plan(['A', 'Varrock', 'B', 'Varrock']));
    for (let i = 0; i < 3; i++) d = recordPick(d, s.players[i]);
    d = { ...d, picks: d.picks.filter(p => p.slot !== 0) };
    assert.equal(draftTurn(d).current?.slot, 0); assert.equal(d.picks[0].team, 'Varrock');
    d = recordPick(d, s.players[3]); assert.equal(d.picks.at(-1)?.team, 'A'); assert.equal(draftTurn(d).current?.slot, 3);
    assert.deepEqual(parseWorkspace({ snapshot: s, draft: d }).draft, d);
});
test('legacy backups still load; adding an order checks recorded ownership and refresh preserves it', () => {
    const s = snapshot(pool()); let d = recordPick(initialDraft(s), s.players[0], true);
    assert.deepEqual(parseWorkspace(JSON.parse(JSON.stringify({ snapshot: s, draft: d }))).draft, d);
    assert.throws(() => applyPlan(d, plan(['A', 'Varrock'])), /conflicts/);
    d = applyPlan(d, plan(['Varrock', 'A', 'Varrock']));
    assert.throws(() => applyPlan(d, { ...plan(['B', 'A', 'Varrock']), myTeam: 'B' }), /conflicts/);
    assert.deepEqual(mergeSnapshot({ snapshot: s, draft: d }, s).draft, d);
});
test('malformed plans and backups cannot corrupt pick ownership or keeper counts', () => {
    const s = snapshot(pool()), d = recordPick(applyPlan(initialDraft(s), plan(['A', 'Varrock'])), s.players[0]);
    assert.throws(() => validatePlan(plan(['A'])), /Enter/);
    assert.throws(() => validatePlan(plan(['Varrock', 'A', 'a'])), /capitalization/);
    assert.throws(() => validatePlan({ ...plan(['A', 'Varrock']), keepers: { A: { LW: 9, C: 9, RW: 0, D: 0, G: 0 } } }), /counts/);
    for (const pick of [{ ...d.picks[0], slot: 1 }, { ...d.picks[0], team: 'Varrock' }, { ...d.picks[0], slot: NaN }]) {
        assert.throws(() => parseWorkspace({ snapshot: s, draft: { ...d, picks: [pick] } }), /valid/);
    }
    assert.throws(() => parseWorkspace({ snapshot: s, draft: { ...d, picks: [...d.picks, { ...d.picks[0], id: s.players[1].id }] } }), /valid/);
});
test('replacement gap assumes the player is gone and does not depend on having a later pick', () => {
    const s = snapshot(pool()), d = applyPlan(initialDraft(s), plan(['Varrock', 'Varrock']));
    const evaluation = evaluateDraft(s, d);
    assert.equal(evaluation.turn.between, 0);
    for (const r of evaluation.ranked) assert.equal(r.timing?.atNext, 1);
    const top = evaluation.ranked.find(r => r.player.id === 'd1')!;
    assert.equal(top.alternative?.player.id, 'd2');
    close(top.alternative?.gap, 5);
    const last = evaluateDraft(s, recordPick(d, s.players[0]));
    assert.equal(last.turn.next, null); assert.equal(last.ranked[0].timing?.atNext, null);
    close(last.ranked.find(r => r.player.id === 'd2')!.alternative?.gap, 305);
});
test('a long gap before the next pick raises the cost of waiting at a thin position', () => {
    const s = snapshot(pool());
    const short = evaluateDraft(s, applyPlan(initialDraft(s), plan(['Varrock', 'A', 'Varrock'])));
    const long = evaluateDraft(s, applyPlan(initialDraft(s), plan(['Varrock', ...Array(12).fill('A'), 'Varrock'])));
    const row = (e: typeof short) => e.ranked.find(r => r.player.id === 'd1')!;
    close(row(long).alternative?.gap, 5);
    close(row(short).alternative?.gap, 5);
    assert.ok(row(long).timing!.atNext! < row(short).timing!.atNext!);
    assert.ok(row(short).outlook!.waitCost < 120, 'd2 usually survives one opponent pick');
    assert.ok(row(long).outlook!.waitCost > 250, 'twelve opponent picks usually take d2');
    assert.ok(row(long).fitScore! > row(short).fitScore!);
    assert.equal(row(long).outlook!.waitSlot, 13);
    assert.ok(long.depth.find(p => p.position === 'D')!.atNext! < short.depth.find(p => p.position === 'D')!.atNext!);
    assert.equal(long.depth.find(p => p.position === 'D')?.cliff?.after.id, 'd2');
    assert.equal(long.depth.find(p => p.position === 'D')?.nearTop, 2);
    assert.equal(long.ranked.find(r => r.player.id === 'd2')!.nextByPosition?.D?.tierBreak, true);
    assert.equal(long.ranked.find(r => r.player.id === 'd1')!.nextByPosition?.D?.tierBreak, false);
});
test('replacement level is the best player expected to remain after the whole draft', () => {
    const s = snapshot([player('g1', ['G'], 400), player('g2', ['G'], 350), player('g3', ['G'], 300), ...Array.from({ length: 30 }, (_, i) => player(`c-${i}`, ['C'], 420 - i))]);
    const e = evaluateDraft(s, applyPlan(initialDraft(s), plan(['Varrock', 'A', 'Varrock'])));
    const goalie = e.ranked.find(r => r.player.id === 'g1')!, centre = e.ranked.find(r => r.player.id === 'c-0')!;
    assert.ok(goalie.outlook!.replacement <= 350 && goalie.outlook!.replacement >= 300);
    assert.ok(centre.outlook!.replacement > 410, 'deep positions keep a strong waiver option');
    assert.ok(goalie.fitScore! > centre.fitScore!, 'a scarce starter beats a deep position with similar points');
});
test('taking a peer in a thin top tier increases urgency for the remaining player', () => {
    const s = snapshot(pool()), d = applyPlan(initialDraft(s), plan(['A', 'Varrock', 'A', 'A', 'A', 'A', 'Varrock']));
    const withoutPeer = evaluateDraft(s, recordPick(d, s.players[0]));
    const withPeer = evaluateDraft(s, recordPick(d, s.players[10]));
    close(withoutPeer.ranked.find(r => r.player.id === 'd2')!.alternative?.gap, 305);
    assert.equal(withPeer.ranked.find(r => r.player.id === 'd2')!.alternative?.gap, 0);
});
test('known opponent keepers reduce demand for already-covered goalies', () => {
    const s = snapshot([player('goalie', ['G'], 1000), ...pool()]);
    const d = applyPlan(initialDraft(s), plan(['Varrock', 'A', 'Varrock']));
    const unknown = evaluateDraft(s, d);
    const known = evaluateDraft(s, { ...d, plan: { ...d.plan!, keepers: { A: { LW: 2, C: 2, RW: 2, D: 3, G: 2 } } } });
    assert.equal(known.ranked.find(r => r.player.id === 'goalie')!.timing!.atNext, 1);
    assert.ok(unknown.ranked.find(r => r.player.id === 'goalie')!.timing!.atNext! < 0.1);
    assert.deepEqual(unknown.unknownTeams, ['A']); assert.deepEqual(known.unknownTeams, []);
});
test('one multi-position player leaves every positional pool when an opponent takes him', () => {
    const s = snapshot([player('flex', ['LW', 'C'], 2000), player('wing', ['LW'], 100), player('centre', ['C'], 100)]);
    const e = evaluateDraft(s, applyPlan(initialDraft(s), plan(['Varrock', 'A', 'Varrock'])));
    assert.equal(e.depth.find(d => d.position === 'LW')?.atNext, 100);
    assert.equal(e.depth.find(d => d.position === 'C')?.atNext, 100);
});
test('recorded opponent picks update their demand even without keeper counts', () => {
    const s = snapshot([player('g1', ['G'], 1000), player('g2', ['G'], 1000), player('g3', ['G'], 1000), ...pool()]);
    let d = applyPlan(initialDraft(s), plan(['A', 'A', 'Varrock', 'A', 'Varrock']));
    d = recordPick(recordPick(d, s.players[0]), s.players[1]);
    assert.equal(evaluateDraft(s, d).ranked.find(r => r.player.id === 'g3')!.timing!.atNext, 1);
});
test('forecast reports availability risk without excluding the best currently available player', () => {
    const s = snapshot([player('star', ['D'], 2000), ...pool()]), d = applyPlan(initialDraft(s), plan(['A', 'Varrock', 'A', 'Varrock']));
    const e = evaluateDraft(s, d);
    assert.equal(e.ranked.find(r => r.player.id === 'star')!.timing!.atPick, 0);
    assert.equal([...e.ranked].filter(r => r.fitScore !== null).sort((a, b) => b.fitScore! - a.fitScore!)[0].player.id, 'star');
    assert.deepEqual(e, evaluateDraft(s, d));
});

test('likely availability cannot promote a fifth D over a needed goalie or a stronger D', () => {
    const keepers = [player('kept-g', ['G'], 100), ...Array.from({ length: 4 }, (_, i) => player(`kept-d${i}`, ['D'], 100))];
    const s = snapshot([...keepers, player('Vejmelka', ['G'], 428), player('Weegar', ['D'], 324), player('Trouba', ['D'], 312)]);
    s.keeperIds = keepers.map(p => p.id);
    const d = applyPlan(initialDraft(s), plan(['A', 'Varrock']));
    const e = evaluateDraft(s, d);
    const [goalie, weegar, trouba] = ['Vejmelka', 'Weegar', 'Trouba'].map(id => e.ranked.find(r => r.player.id === id)!);
    assert.ok(goalie.timing!.atPick < weegar.timing!.atPick);
    assert.ok(weegar.timing!.atPick < trouba.timing!.atPick);
    assert.ok(goalie.fitScore! > weegar.fitScore!, 'A needed 428-point goalie must outrank the fifth D');
    assert.ok(weegar.fitScore! > trouba.fitScore!, 'Being likelier to survive must not make Trouba a better pick than Weegar');
    const afterPick = evaluateDraft(s, recordPick(d, goalie.player));
    assert.ok(!afterPick.ranked.some(r => r.player.id === 'Vejmelka'));
    const best = afterPick.ranked.filter(r => r.fitScore !== null).sort((a, b) => b.fitScore! - a.fitScore!)[0];
    assert.equal(best.player.id, 'Weegar', 'Recalculate from the remaining players after an actual selection');
});
test('missing rated alternatives do not invent a zero-point replacement or a ranking bonus', () => {
    const s = snapshot([player('d', ['D'], 300), player('f', ['C'], 300)]), d = initialDraft(s);
    const e = evaluateDraft(s, d);
    assert.equal(e.trials, 0); assert.equal(e.ranked[0].timing, undefined);
    assert.equal(e.ranked[0].fitScore, 300); assert.equal(e.ranked[1].fitScore, 300);
    assert.equal(e.depth.find(p => p.position === 'D')?.cliff, null);
    const exhausted = evaluateDraft(s, applyPlan(d, plan(['Varrock', 'A', 'A', 'Varrock'])));
    assert.equal(exhausted.depth.find(p => p.position === 'D')?.atNext, 0);
    assert.ok(exhausted.ranked.every(r => r.alternative === undefined));
});

test('replacement bonuses cannot override a full goalie roster or change the best-available points', () => {
    const s = snapshot([player('kept-g1', ['G'], 600), player('kept-g2', ['G'], 600), player('extra-g', ['G'], 1000), ...pool()]);
    s.keeperIds = ['kept-g1', 'kept-g2'];
    const e = evaluateDraft(s, applyPlan(initialDraft(s), plan(['Varrock', 'A', 'A', 'Varrock'])));
    assert.equal(e.ranked[0].player.id, 'extra-g'); assert.equal(e.ranked[0].value.points, 1000); assert.equal(e.ranked[0].fitScore, null);
});

test('current replacements work without an order and use eligible alternatives across multiple positions', () => {
    const s = snapshot([player('best', ['LW'], 400), player('flex', ['LW', 'C'], 350), player('wing', ['LW'], 300), player('centre', ['C'], 200)]);
    const d = initialDraft(s), e = evaluateDraft(s, d);
    const best = e.ranked.find(r => r.player.id === 'best')!;
    assert.equal(best.alternative?.player.id, 'flex');
    assert.equal(best.alternative?.gap, 50);
    assert.ok(Math.abs(best.fitScore! - 450) < 1e-9);
    assert.equal(e.ranked.find(r => r.player.id === 'wing')!.alternative?.gap, 0);
    const after = evaluateDraft(s, recordPick(d, s.players[1], false));
    assert.equal(after.ranked.find(r => r.player.id === 'best')!.alternative?.gap, 100);
    close(after.ranked.find(r => r.player.id === 'best')!.alternative?.perGameGap, 100 / 84);
});

test('FP/G losses divide season-point gaps by 84 even for goalies or unknown scoring rates', () => {
    const fullSeason = player('full-season', ['G'], 400), higherRate = player('higher-rate', ['G'], 350);
    for (const stats of [fullSeason.previous!, fullSeason.projected!]) { stats.games = 80; stats.perGame = 5; }
    for (const stats of [higherRate.previous!, higherRate.projected!]) { stats.games = 50; stats.perGame = 7; }
    const s = snapshot([fullSeason, higherRate]), e = evaluateDraft(s, initialDraft(s));
    const first = e.ranked[0];
    assert.equal(first.value.perGame, 5);
    assert.equal(first.alternative?.perGame, 7);
    assert.equal(first.alternative?.gap, 50);
    close(first.alternative?.perGameGap, 50 / 84);
    assert.equal(e.ranked[1].alternative?.gap, 0); assert.equal(e.ranked[1].alternative?.perGameGap, 0);
    const second = e.depth.find(d => d.position === 'G')!.players[1];
    assert.equal(second.lossFromBest, 50); close(second.perGameLossFromBest, 50 / 84);
    higherRate.projected = null;
    higherRate.previous = { points: 350, games: null, perGame: null, categories: {} };
    const missing = evaluateDraft(s, initialDraft(s)).ranked[0].alternative!;
    assert.equal(missing.gap, 50); close(missing.perGameGap, 50 / 84);
});

test('top 20 depth shows adjacent and cumulative gaps at every position and updates after picks', () => {
    const positions: Position[] = ['LW', 'C', 'RW', 'D', 'G'];
    const s = snapshot(positions.flatMap(pos => Array.from({ length: 22 }, (_, i) => player(`${pos}-${i}`, [pos], 500 - i * 10))));
    const d = initialDraft(s), e = evaluateDraft(s, d);
    for (const depth of e.depth) {
        assert.equal(depth.players.length, 20);
        assert.equal(depth.players[0].lossFromBest, 0);
        close(depth.players[4].lossFromBest, 40);
        assert.ok(Math.abs(depth.players[4].perGameLossFromBest! - 40 / 84) < 1e-9);
        close(depth.players[4].next?.gap, 10);
        assert.ok(Math.abs(depth.players[4].next!.perGameGap! - 10 / 84) < 1e-9);
        assert.equal(depth.players[19].next?.player.id, `${depth.position}-20`);
    }
    const after = evaluateDraft(s, recordPick(d, s.players.find(p => p.id === 'D-0')!, false));
    const defense = after.depth.find(p => p.position === 'D')!;
    assert.equal(defense.players[0].player.id, 'D-1');
    assert.equal(defense.players[0].lossFromBest, 0);
    close(defense.players[4].lossFromBest, 40);
    assert.equal(defense.players[4].player.id, 'D-5');
    const tiny = snapshot([player('one', ['D'], 100)]);
    const lone = evaluateDraft(tiny, initialDraft(tiny)).depth.find(p => p.position === 'D')!;
    assert.equal(lone.players[0].next, undefined);
});

test('Available gaps match positional depth after picks, even when the position is filled', () => {
    const s=snapshot(['LW','C','RW','D','G'].flatMap(pos=>Array.from({length:4},(_,i)=>player(`${pos}-${i}`,[pos as Position],400-i*25))));
    let d=initialDraft(s);
    for (const pos of ['LW','C','RW','D','G']) d=recordPick(d,s.players.find(p=>p.id===`${pos}-0`)!,false);
    d=recordPick(d,s.players.find(p=>p.id==='G-1')!,true);
    d=recordPick(d,s.players.find(p=>p.id==='G-2')!,true);
    const e=evaluateDraft(s,d);
    for (const depth of e.depth) for (const row of depth.players) {
        const available=e.ranked.find(r=>r.player.id===row.player.id)!;
        assert.deepEqual(available.nextByPosition?.[depth.position],row.next,`${row.player.id} should match depth`);
    }
    const secondD=e.ranked.find(r=>r.player.id==='D-2')!;
    close(secondD.nextByPosition?.D?.gap,25);close(secondD.nextByPosition?.D?.perGameGap,25/84);
    assert.equal(secondD.alternative?.gap,0, 'Recommendation still considers the best available alternative');
    const after=evaluateDraft(s,recordPick(d,s.players.find(p=>p.id==='D-2')!,false));
    close(after.ranked.find(r=>r.player.id==='D-1')!.nextByPosition?.D?.gap,50);
    assert.equal(after.ranked.find(r=>r.player.id==='D-3')!.nextByPosition?.D,undefined);
});

test('multi-position Available gaps use the selected position and include players outside the top 20', () => {
    const s=snapshot([player('flex',['LW','C'],400),player('wing',['LW'],350),player('centre',['C'],300),
        ...Array.from({length:23},(_,i)=>player(`d-${i}`,['D'],500-i*10)),player('g1',['G'],400),player('g2',['G'],350),player('g3',['G'],300),player('g4',['G'],250)]);
    s.keeperIds=['g1','g2'];
    const e=evaluateDraft(s,initialDraft(s)),flex=e.ranked.find(r=>r.player.id==='flex')!;
    close(flex.nextByPosition?.LW?.gap,50);close(flex.nextByPosition?.C?.gap,100);
    close(e.ranked.find(r=>r.player.id==='d-21')!.nextByPosition?.D?.gap,10);
    const extraGoalie=e.ranked.find(r=>r.player.id==='g3')!;
    assert.equal(extraGoalie.fitScore,null);close(extraGoalie.nextByPosition?.G?.gap,50);
});

test('board depth uses 84-game rates while recommendations and replacement bonuses use projected games', () => {
    const a=player('higher-total',['D'],400), b=player('higher-rate',['D'],350);
    for (const stats of [a.previous!,a.projected!]) { stats.games=80;stats.perGame=5; }
    for (const stats of [b.previous!,b.projected!]) { stats.games=50;stats.perGame=7; }
    const s=snapshot([a,b]),e=evaluateDraft(s,initialDraft(s));
    assert.equal(e.ranked[0].player.id,'higher-rate');assert.equal(e.ranked[0].value.points,588);
    assert.equal(e.ranked[0].nextByPosition?.D?.gap,168);assert.equal(e.ranked[0].nextByPosition?.D?.perGameGap,2);
    assert.equal(e.ranked[0].alternative?.gap,0);assert.equal(e.ranked[0].recommendationValue.points,350);
    const recommendation=[...e.ranked].sort((a,b)=>b.fitScore!-a.fitScore!)[0];
    assert.equal(recommendation.player.id,'higher-total');assert.equal(recommendation.recommendationValue.points,400);
    close(recommendation.alternative?.gap,50);close(recommendation.fitScore,450);
    const depth=e.depth.find(d=>d.position==='D')!;
    assert.equal(depth.players[1].lossFromBest,168);assert.equal(depth.players[1].perGameLossFromBest,2);
});

test('do-not-draft excludes both top cards and recommendation alternatives while preserving board gaps and opponent forecasts', () => {
    const s=snapshot([player('best',['D'],500),player('second',['D'],400),player('third',['D'],300)]);
    const d=applyPlan(initialDraft(s),plan(['A','Varrock','A','Varrock'])), before=evaluateDraft(s,d);
    const excluded=evaluateDraft(s,{...d,doNotDraftIds:['best']});
    assert.equal(excluded.bestAvailable?.player.id,'second');
    assert.equal(excluded.ranked[0].player.id,'best');assert.equal(excluded.ranked[0].fitScore,null);
    const recommended=excluded.ranked.filter(r=>r.fitScore!==null).sort((a,b)=>b.fitScore!-a.fitScore!)[0];
    assert.equal(recommended.player.id,'second');assert.equal(recommended.alternative?.player.id,'third');
    close(recommended.alternative?.gap,100);assert.ok(recommended.outlook);
    assert.deepEqual(excluded.depth[3].players.map(r=>r.next),before.depth[3].players.map(r=>r.next));
    assert.deepEqual(excluded.ranked.map(r=>r.timing),before.ranked.map(r=>r.timing));
    const allExcluded=evaluateDraft(s,{...d,doNotDraftIds:s.players.map(p=>p.id)});
    assert.equal(allExcluded.bestAvailable,undefined);assert.ok(allExcluded.ranked.every(r=>r.fitScore===null));
    const restored=evaluateDraft(s,{...d,doNotDraftIds:[]});assert.equal(restored.bestAvailable?.player.id,'best');
    const zero=player('zero-games',['D'],900);zero.projected={points:0,games:0,perGame:null,categories:{}};
    const withZero=snapshot([...s.players,zero]), row=evaluateDraft(withZero,initialDraft(withZero)).ranked.find(r=>r.player.id==='zero-games')!;
    assert.ok(row.value.points!>0);assert.equal(row.recommendationValue.points,0);assert.equal(row.fitScore,null);
});

test('one-game prospects do not displace NHL regulars in recommendations or positional gaps', () => {
    const regular=player('regular',['D'],400), booth=player('Booth',['D'],7.25), mcdonald=player('McDonald',['D'],5.75);
    for (const p of [booth,mcdonald]) {
        for (const stats of [p.previous!,p.projected!]) { stats.games=1;stats.perGame=stats.points; }
        p.gamesPlayed={'2024-25':0,'2025-26':1};
    }
    const s=snapshot([booth,mcdonald,regular]), draft=initialDraft(s), e=evaluateDraft(s,draft);
    assert.equal(e.ranked[0].player.id,'regular');
    assert.equal([...e.ranked].sort((a,b)=>(b.fitScore ?? -1)-(a.fitScore ?? -1))[0].player.id,'regular');
    close(e.ranked[0].alternative?.gap,392.75);
    close(e.ranked[0].alternative?.perGameGap,392.75/84);
    const depth=e.depth.find(d=>d.position==='D')!;
    assert.deepEqual(depth.players.map(p=>p.player.id),['regular','Booth','McDonald']);
    close(depth.players[1].value.points,7.25);close(depth.players[1].next?.gap,1.5);
    close(depth.players[1].next?.perGameGap,1.5/84);close(depth.players[1].perGameLossFromBest,392.75/84);
    const after=evaluateDraft(s,recordPick(draft,regular,false));
    assert.equal(after.ranked[0].player.id,'Booth');close(after.ranked[0].value.points,7.25);
});
