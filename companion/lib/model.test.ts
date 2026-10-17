import test from 'node:test';
import assert from 'node:assert/strict';
import { BENCH_WEIGHT, isProspect, recentGames, assignRoster, availablePlayers, initialDraft, mergeSnapshot, parseWorkspace, rankPlayers, recordPick, valuePlayer, goalieBaseline, averageMissedGames, isInjuryProne, type Player, type Snapshot, type Position, type Stats } from './model';

const stats = (points: number, games = 84): Stats => ({ points, games, perGame: games ? points / games : null, categories: {} });
const player = (id: string, positions: Position[], points = 400): Player => ({ id, name: id, positions, team: 'NHL', age: 25, available: true, note: '', previous: stats(points), projected: stats(points) });
const snapshot = (players: Player[], keeperIds: string[] = []): Snapshot => ({ version: 1, season: '2026–2027', fetchedAt: '2026-10-09T18:00:00Z', keeperSavedAt: '2026-10-05T12:00:00Z', keeperIds, minorIds: [], warnings: [], players });
const starters = () => [player('lw1', ['LW']), player('lw2', ['LW']), player('c1', ['C']), player('c2', ['C']), player('rw1', ['RW']), player('rw2', ['RW']), player('d1', ['D']), player('d2', ['D']), player('d3', ['D']), player('g1', ['G'])];

test('multi-position players cover distinct slots and relocate to leave room for a specialist', () => {
    const players = [player('flex', ['LW','C']), player('lw1', ['LW']), player('lw2', ['LW']), player('lw3', ['LW']), player('c1', ['C']), player('rw1', ['RW']), player('rw2', ['RW'])];
    const assignment = assignRoster(players);
    assert.equal(assignment.filled, 7);
    assert.equal(assignment.roles.get('flex'), 'C');
    assert.equal(Object.values(assignment.counts).reduce((a,b) => a+b,0), 7);
    assert.equal(new Set(assignment.roles.keys()).size, 7);
});
test('minors do not fill playing roles and all keepers stay unavailable', () => {
    const s = snapshot([player('greaves',['G']), player('parekh',['D']), player('other',['G'])], ['greaves','parekh']); s.minorIds = ['parekh'];
    const d = initialDraft(s), rows = rankPlayers(s,d);
    assert.deepEqual(availablePlayers(s,d).map(p => p.id), ['other']);
    assert.match(rows[0].reason, /Starter G 2\/2/);
});
test('a third goalie stays visible as best available but is not recommended for the team', () => {
    const s = snapshot([player('g1',['G']),player('g2',['G']),player('g3',['G'],800),player('d',['D'],300)],['g1','g2']);
    const ranked = rankPlayers(s, initialDraft(s));
    assert.equal(ranked[0].player.id,'g3'); assert.equal(ranked[0].fitScore,null);
    assert.ok(ranked.find(r=>r.player.id==='d')!.fitScore! > 0);
});
test('D receives priority when two of each forward role are covered and fourth D is missing', () => {
    const roster = starters(), s = snapshot([...roster,player('newD',['D'],350),player('newF',['LW'],400)],roster.map(p=>p.id));
    const rows = rankPlayers(s, initialDraft(s));
    assert.ok(rows.find(r=>r.player.id==='newD')!.fitScore! > rows.find(r=>r.player.id==='newF')!.fitScore!);
});
test('the final bench spot goes to the stronger player whether forward or fifth D', () => {
    const roster = [...starters(),player('d4',['D']),player('g2',['G']),player('lw3',['LW']),player('c3',['C']),player('rw3',['RW'])];
    for (const [points, shouldWin] of [[290,false],[310,true]] as const) {
        const s=snapshot([...roster,player('newD',['D'],300),player('newF',['C'],points)],roster.map(p=>p.id));
        const rows=rankPlayers(s,initialDraft(s)), d=rows.find(r=>r.player.id==='newD')!, f=rows.find(r=>r.player.id==='newF')!;
        assert.equal(f.fitScore! > d.fitScore!,shouldWin);
        assert.equal(d.reason,'Bench D');assert.equal(d.slotWeight,BENCH_WEIGHT);
    }
});
test('starting roles outweigh bench roles, including through a multi-position reshuffle', () => {
    const roster=[player('lw1',['LW']),player('lw2',['LW']),player('c1',['C']),player('flex',['LW','C'])];
    const s=snapshot([...roster,player('lw3',['LW'],400),player('c3',['C'],400)],roster.map(p=>p.id));
    const rows=rankPlayers(s,initialDraft(s));
    assert.equal(rows.find(r=>r.player.id==='lw3')!.reason,'Bench LW');
    assert.equal(rows.find(r=>r.player.id==='c3')!.slotWeight,BENCH_WEIGHT);
    const open=snapshot([player('lw1',['LW']),player('flex',['LW','C']),player('c3',['C'],400)],['lw1','flex']);
    const c3=rankPlayers(open,initialDraft(open)).find(r=>r.player.id==='c3')!;
    assert.equal(c3.slotWeight,1);assert.match(c3.reason,/^Starter/);
});
test('drafting to minors bypasses the full playing roster but respects two minor slots', () => {
    const roster=Array.from({length:16},(_,i)=>player(`r${i}`,[(['LW','C','RW','D'] as Position[])[i%4]]));
    const s=snapshot([...roster,player('a',['D']),player('b',['C']),player('c',['RW'])],roster.map(p=>p.id));
    let d=initialDraft(s);
    assert.throws(()=>recordPick(d,s.players[16],true),/16 players/);
    assert.throws(()=>recordPick(d,s.players[16],false,true),/own picks/);
    d=recordPick(d,s.players[16],true,true);assert.deepEqual(d.minorIds,['a']);
    d=recordPick(d,s.players[17],true,true);assert.throws(()=>recordPick(d,s.players[18],true,true),/full/);
    assert.deepEqual(parseWorkspace(JSON.parse(JSON.stringify({snapshot:s,draft:d}))).draft,d);
});
test('targets survive backups and refreshes, and reject unknown players', () => {
    const s=snapshot([player('a',['C']),player('b',['D'])]),d={...initialDraft(s),targetIds:['b']};
    assert.deepEqual(parseWorkspace(JSON.parse(JSON.stringify({snapshot:s,draft:d}))).draft,d);
    assert.deepEqual(mergeSnapshot({snapshot:s,draft:d},snapshot([player('a',['C'])])).draft.targetIds,['b']);
    for(const ids of [['missing'],['b','b'],'b']) assert.throws(()=>parseWorkspace({snapshot:s,draft:{...d,targetIds:ids}}));
});
test('roster completion preserves room for required roles', () => {
    const roster=[...starters(),player('lw3',['LW']),player('c3',['C']),player('rw3',['RW']),player('d4',['D']),player('d5',['D'])];
    const s=snapshot([...roster,player('extraF',['C'],700),player('g2',['G'],300)],roster.map(p=>p.id));
    const rows=rankPlayers(s,initialDraft(s));
    assert.equal(rows.find(r=>r.player.id==='extraF')!.fitScore,null);
    assert.ok(rows.find(r=>r.player.id==='g2')!.fitScore!>0);
});
test('established skaters use 84 games for blended, projected-only and historical-only scoring rates', () => {
    const p=player('p',['LW']);p.previous=stats(200,40);p.projected=stats(320,80);
    assert.equal(valuePlayer(p,0).points,369.6);
    assert.equal(valuePlayer(p,0).games,84);
    assert.equal(valuePlayer(p,0).projectedPoints,336);
    p.projected=stats(200,50);assert.equal(valuePlayer(p,0).points,369.6);
    p.gamesPlayed={'2024-25':40,'2025-26':null};
    p.previous=null;assert.equal(valuePlayer(p,0).points,336);
    p.projected=stats(0,0);assert.equal(valuePlayer(p,0).points,null);
    p.projected=null;assert.equal(valuePlayer(p,0).points,null);
    p.previous=stats(200,40);assert.equal(valuePlayer(p,0).points,420);
    p.projected=stats(0,0);assert.equal(valuePlayer(p,0).points,420);
    p.previous={points:200,games:null,perGame:null,categories:{}};assert.equal(valuePlayer(p,0).points,null);
});

test('only a recent 40-game NHL season qualifies a skater for 84 games', () => {
    const p=player('p',['D']);p.previous=stats(78,39);p.projected=stats(20,10);
    assert.equal(valuePlayer(p,0).games,10);
    p.gamesPlayed={'2024-25':40,'2025-26':39};assert.equal(valuePlayer(p,0).games,84);
    p.gamesPlayed={'2024-25':39,'2025-26':40};assert.equal(valuePlayer(p,0).games,84);
    p.gamesPlayed={'2024-25':39,'2025-26':39};p.nhlBefore2024=true;
    assert.equal(valuePlayer(p,0).games,10);
    p.previous=null;p.gamesPlayed=undefined;p.projected=stats(300,60);
    assert.equal(valuePlayer(p,0).points,300);assert.equal(valuePlayer(p,0).games,60);
    p.projected=null;assert.equal(valuePlayer(p,0).points,null);
});

test('one-game prospects retain projected workloads, explicit zero games and historical totals', () => {
    for (const [name, points] of [['Angus Booth',7.25],['Hunter McDonald',5.75]] as const) {
        const p=player(name,['D']);p.previous=stats(points,1);p.projected=stats(points,1);
        p.gamesPlayed={'2024-25':0,'2025-26':1};
        let value=valuePlayer(p,0);
        assert.ok(Math.abs(value.points!-points)<1e-9);assert.equal(value.games,1);assert.equal(value.projectedPoints,points);
        assert.equal(value.confidence,'Limited NHL history');
        p.projected=stats(0,0);value=valuePlayer(p,0);
        assert.equal(value.points,0);assert.equal(value.games,0);
        p.projected=null;value=valuePlayer(p,0);
        assert.equal(value.points,points);assert.equal(value.games,1);
    }
});

test('goalies retain projected appearances and zero-game projections', () => {
    const p=player('backup',['G']);p.previous=stats(100,20);p.projected=stats(100,20);
    assert.equal(valuePlayer(p,0).points,100);assert.equal(valuePlayer(p,0).games,20);
    p.projected=stats(250,50);assert.equal(valuePlayer(p,0).points,250);assert.equal(valuePlayer(p,0).games,50);
    p.projected=stats(0,0);assert.equal(valuePlayer(p,0).points,0);
});

test('recommendation estimates use projected games while the board keeps established skaters at 84', () => {
    const p=player('regular',['LW']);p.previous=stats(200,40);p.projected=stats(200,50);
    assert.equal(valuePlayer(p,0).games,84);assert.equal(valuePlayer(p,0).points,369.6);
    let expected=valuePlayer(p,0,'projected');
    assert.equal(expected.games,50);assert.ok(Math.abs(expected.points!-220)<1e-9);assert.equal(expected.projectedPoints,200);
    p.projected=stats(0,0);expected=valuePlayer(p,0,'projected');
    assert.equal(expected.points,0);assert.equal(expected.games,0);assert.equal(valuePlayer(p,0).points,420);
    p.projected={games:30,points:null,perGame:null,categories:{}};
    expected=valuePlayer(p,0,'projected');assert.equal(expected.points,150);assert.equal(expected.games,30);
    p.projected=null;expected=valuePlayer(p,0,'projected');
    assert.equal(expected.points,200);assert.equal(expected.games,40);assert.equal(expected.confidence,'No projection');
    p.positions=['G'];p.projected=stats(200,50);
    assert.deepEqual(valuePlayer(p,0,'projected'),valuePlayer(p,0));
});

test('do-not-draft choices survive backups, refresh and opponent picks without hiding players', () => {
    const s=snapshot([player('a',['C']),player('b',['D'])]);
    const legacy=initialDraft(s);assert.deepEqual(parseWorkspace({snapshot:s,draft:legacy}).draft,legacy);
    const d={...legacy,doNotDraftIds:['a']};
    assert.deepEqual(parseWorkspace(JSON.parse(JSON.stringify({snapshot:s,draft:d}))).draft,d);
    const refreshed=mergeSnapshot({snapshot:s,draft:d},snapshot([player('b',['D'],500)]));
    assert.deepEqual(refreshed.draft.doNotDraftIds,['a']);
    assert.deepEqual(availablePlayers(s,d).map(p=>p.id),['a','b']);
    const ranked=rankPlayers(s,d), avoided=ranked.find(p=>p.player.id==='a')!;
    assert.equal(avoided.fitScore,null);assert.equal(avoided.doNotDraft,true);
    const picked=recordPick(d,s.players[0],false);assert.equal(picked.picks[0].id,'a');
    assert.deepEqual(picked.doNotDraftIds,['a']);assert.deepEqual(availablePlayers(s,picked).map(p=>p.id),['b']);
    for(const ids of [null,'a',['missing'],['a','a'],[1]]) assert.throws(()=>parseWorkspace({snapshot:s,draft:{...d,doNotDraftIds:ids}}));
});

test('injury flag uses strictly more than 10 missed games averaged over two 82-game seasons without changing value', () => {
    const p=player('skater',['D']), healthy=valuePlayer(p,0);
    p.gamesPlayed={'2024-25':72,'2025-26':72};
    assert.equal(averageMissedGames(p),10);assert.equal(isInjuryProne(p),false);
    p.gamesPlayed['2025-26']=71;assert.equal(averageMissedGames(p),10.5);assert.equal(isInjuryProne(p),true);
    assert.deepEqual(valuePlayer(p,0),healthy);
    p.gamesPlayed={'2024-25':84,'2025-26':60};assert.equal(averageMissedGames(p),11);
    p.gamesPlayed={'2024-25':null,'2025-26':60};assert.equal(averageMissedGames(p),null);assert.equal(isInjuryProne(p),false);
    p.gamesPlayed={'2024-25':0,'2025-26':60};assert.equal(averageMissedGames(p),null);assert.equal(isInjuryProne(p),false);
    p.nhlBefore2024=true;assert.equal(averageMissedGames(p),52);assert.equal(isInjuryProne(p),true);
    p.positions=['G'];assert.equal(isInjuryProne(p),false);
});
test('goalie estimate recovers actual per-game SV bonuses instead of applying average-SV band', () => {
    const p=player('thompson',['G']);
    p.previous={...stats(492,58),categories:{W:31,'OL+ShL':6,SHO:4,'SV%':.912}};
    p.projected={...stats(298,56),categories:{W:29,'OL+ShL':0,SHO:3,'SV%':.911}};
    const v=valuePlayer(p,goalieBaseline([p]));
    assert.ok(v.projectedPoints!>450);assert.ok(v.points!>450);assert.match(v.explanation,/No games-limit/);
});
test('recording picks prevents duplicates, removes availability and survives a backup round trip', () => {
    const s=snapshot([player('a',['C']),player('b',['D'])]);let d=initialDraft(s);
    d=recordPick(d,s.players[0],true); assert.throws(()=>recordPick(d,s.players[0],false),/not available/);
    assert.deepEqual(availablePlayers(s,d).map(p=>p.id),['b']);
    assert.deepEqual(parseWorkspace(JSON.parse(JSON.stringify({snapshot:s,draft:d}))),{snapshot:s,draft:d});
    d={...d,picks:[]};assert.equal(availablePlayers(s,d).length,2);
});
test('backup validation rejects unknown IDs, duplicate picks, missing stats fields and non-finite values', () => {
    const s=snapshot([player('a',['C'])]), base={snapshot:s,draft:initialDraft(s)};
    const copy=()=>JSON.parse(JSON.stringify(base));
    const unknown=copy();unknown.draft.keeperIds=['missing'];assert.throws(()=>parseWorkspace(unknown));
    const dup=copy();dup.draft.picks=[{id:'a',mine:true},{id:'a',mine:false}];assert.throws(()=>parseWorkspace(dup));
    const corrupt=copy();corrupt.snapshot.players[0].projected={points:'bad'};assert.throws(()=>parseWorkspace(corrupt));
    const infinite=copy();infinite.snapshot.players[0].projected.points=Infinity;assert.throws(()=>parseWorkspace(infinite));
    for (const history of [null, {'2024-25':72}, {'2024-25':-1,'2025-26':70}, {'2024-25':72.5,'2025-26':70}, {'2024-25':101,'2025-26':70}]) {
        const bad=copy();bad.snapshot.players[0].gamesPlayed=history;assert.throws(()=>parseWorkspace(bad));
    }
    const history=copy();history.snapshot.players[0].gamesPlayed={'2024-25':72,'2025-26':null};assert.deepEqual(parseWorkspace(history),history);
    const badCareer=copy();badCareer.snapshot.players[0].nhlBefore2024='yes';assert.throws(()=>parseWorkspace(badCareer));
});
test('data refresh retains the latest picks, CSV pool and newly imported prospects', () => {
    const s=snapshot([player('a',['C']),player('custom',['D'])]);
    const draft={...recordPick(initialDraft(s),s.players[0],true),poolIds:['a','custom'],poolLabel:'final.csv',importedAt:'2026-10-09T20:00:00Z'};
    const refreshed=snapshot([player('a',['C'],500),player('b',['LW'])]);
    const merged=mergeSnapshot({snapshot:s,draft},refreshed);
    assert.deepEqual(merged.draft,draft);assert.equal(merged.snapshot.players.find(p=>p.id==='a')!.projected!.points,500);
    assert.ok(merged.snapshot.players.some(p=>p.id==='custom'));assert.deepEqual(availablePlayers(merged.snapshot,merged.draft).map(p=>p.id),['custom']);
});
test('prospects need fewer than 25 known NHL games across the last two seasons, goalies included', () => {
    const p=player('kid',['C']);
    p.gamesPlayed={'2024-25':0,'2025-26':24};assert.equal(recentGames(p),24);assert.equal(isProspect(p),true);
    p.gamesPlayed={'2024-25':10,'2025-26':15};assert.equal(isProspect(p),false);
    p.gamesPlayed={'2024-25':null,'2025-26':3};assert.equal(isProspect(p),false);
    p.gamesPlayed=undefined;assert.equal(isProspect(p),false);
    const g=player('goalie',['G']);g.gamesPlayed={'2024-25':4,'2025-26':20};assert.equal(isProspect(g),true);
    assert.equal(averageMissedGames(g),null);
});
