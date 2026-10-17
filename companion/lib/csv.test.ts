import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePoolCsv } from './csv';
import { initialDraft, type Snapshot, type Player } from './model';
const p=(id:string,name:string):Player=>({id,name,positions:['C'],team:'EDM',age:25,available:true,note:'',previous:null,projected:null});
const s:Snapshot={version:1,season:'2026–2027',fetchedAt:'2026-10-09T18:00:00Z',keeperSavedAt:'2026-10-05T18:00:00Z',keeperIds:['mcdavid'],minorIds:[],warnings:[],players:[p('mcdavid','Connor McDavid'),p('a','Available Player'),p('b','Other Player')]};
test('Fantrax import uses stable IDs, removes own keepers and filters rostered statuses',()=>{
    const d=initialDraft(s),parsed=parsePoolCsv('ID,Player,Position,Status\n*mcdavid*,Connor McDavid,C,FA\n*a*,Available Player,C,FA\n*b*,Other Player,C,OTHER',s,d);
    assert.deepEqual(parsed.ids,['a']);assert.equal(parsed.excludedKeepers,1);assert.equal(parsed.ignoredOwned,1);
});
test('name-only imports match exact normalized names; unknown and ambiguous names fail atomically',()=>{
    assert.deepEqual(parsePoolCsv('Player\nAvailable Player',s,initialDraft(s)).ids,['a']);
    assert.throws(()=>parsePoolCsv('Player\nUnknown Player',s,initialDraft(s)),/Nothing was imported/);
    const ambiguous={...s,players:[...s.players,p('duplicate','Available Player')]};
    assert.throws(()=>parsePoolCsv('Player\nAvailable Player',ambiguous,initialDraft(ambiguous)),/multiple/);
});
test('new players require an ID, name and eligibility and remain explicitly unrated',()=>{
    const result=parsePoolCsv('ID,Player,Position\n*new*,New Prospect,"C,RW"',s,initialDraft(s));
    assert.equal(result.added,1);assert.deepEqual(result.players.at(-1)?.positions,['C','RW']);assert.equal(result.players.at(-1)?.projected,null);
});
test('duplicate IDs and empty imports are rejected',()=>{
    assert.throws(()=>parsePoolCsv('ID,Player\n*a*,Available Player\na,Available Player',s,initialDraft(s)),/duplicate/);
    assert.throws(()=>parsePoolCsv('ID,Player\n',s,initialDraft(s)),/no player rows/);
});
