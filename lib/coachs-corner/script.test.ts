import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, hasErrors, playerRefs, type ScriptEvent } from './script';
import { compile, frameAt, INTRO_MS } from './timeline';
import { PILOT_SCRIPT } from './pilot';

const lines = (source: string) => parseScript(source).events.filter((e): e is Extract<ScriptEvent, { kind: 'line' }> => e.kind === 'line');
const head = '---\ntitle: Test\n---\n';

test('the pilot parses cleanly and lasts about four minutes', () => {
    const script = parseScript(PILOT_SCRIPT);
    assert.deepEqual(script.diagnostics.filter(d => d.severity === 'error'), []);
    const tl = compile(script);
    assert.equal(tl.lines.length, 73);
    const minutes = (tl.showEnd - INTRO_MS) / 60000;
    assert.ok(minutes > 3 && minutes < 5, `runtime ${minutes.toFixed(2)} min`);
});

test('inline markup becomes styled parts with smart typography', () => {
    const [line] = lines(`${head}DON: !!THE DRAFT.!! That's what I said. {sneak fast: psst} --`);
    const text = line.parts.filter(p => p.kind === 'text');
    assert.deepEqual(text.map(p => p.kind === 'text' && p.style.delivery), ['yell', undefined, 'sneak', undefined]);
    assert.match((text[1] as { text: string }).text, /That’s/);
    assert.equal((text[3] as { text: string }).text, ' —');
});

test('a yell ending in ! closes on the last two marks', () => {
    const [line] = lines(`${head}DON: !!FIVE!!!`);
    assert.deepEqual(line.parts, [{ kind: 'text', text: 'FIVE!', style: { delivery: 'yell' } }]);
});

test('header modifiers resolve gestures, deliveries, speed and the after pose', () => {
    const [line] = lines(`${head}DON (point-talk, deadpan, slow, then stare): Who took him?`);
    assert.equal(line.style.gesture, 'point');
    assert.equal(line.style.delivery, 'deadpan');
    assert.equal(line.style.speed, 0.78);
    assert.equal(line.after, 'stare');
});

test('indented lines continue dialogue; blank lines end it', () => {
    const script = parseScript(`${head}RON: one\n  two\n\nDON: three`);
    const [a, b] = script.events as Extract<ScriptEvent, { kind: 'line' }>[];
    assert.equal(a.parts.map(p => p.kind === 'text' ? p.text : '').join(''), 'one two');
    assert.equal(b.speaker, 'don');
});

test('stage lines carry cues, holds and a note', () => {
    const script = parseScript(`${head}[don: stare, ron: down, 1.9s] Don stares.\nRON: Hi.`);
    const stage = script.events[0];
    assert.equal(stage.kind, 'stage');
    if (stage.kind !== 'stage') return;
    assert.deepEqual(stage.cues, [{ type: 'pose', who: 'don', gesture: 'stare' }, { type: 'pose', who: 'ron', gesture: 'down' }, { type: 'pause', ms: 1900 }]);
    assert.equal(stage.note, 'Don stares.');
});

test('monitor graphics parse their arguments', () => {
    const script = parseScript(`${head}>> matchup HH 41.5 vs NPD 38 "Week 1"\n>> pick 3 HH "Ivar Stenberg"\n>> list "Standings" HUNG 3-0, "Everyone else" 0-3\nRON: Hi.`);
    const graphics = script.events.flatMap(e => e.kind === 'stage' ? e.cues : []).map(c => c.type === 'monitor' && c.graphic);
    assert.deepEqual(graphics[0], { type: 'matchup', home: 'HH', away: 'NPD', homeScore: '41.5', awayScore: '38', caption: 'Week 1' });
    assert.deepEqual(graphics[1], { type: 'pick', pick: '3', team: 'HH', player: 'Ivar Stenberg', detail: undefined });
    assert.deepEqual(graphics[2], { type: 'list', title: 'Standings', rows: [{ team: 'HUNG', value: '3-0' }, { label: 'Everyone else', value: '0-3' }] });
});

test('mistakes are reported on their line', () => {
    const script = parseScript(`${head}DON (moonwalk): hi\nGARY: hello\n[cam: dutch]\n>> scoreboard\nRON: {yell no colon}`, { knownTeam: () => false });
    assert.ok(hasErrors(script));
    const at = (n: number) => script.diagnostics.filter(d => d.line === n).map(d => d.message).join(' ');
    assert.match(at(4), /moonwalk/);
    assert.match(at(5), /GARY/);
    assert.match(at(6), /camera shot/);
    assert.match(at(7), /monitor graphic/);
    assert.match(at(8), /colon/);
});

test('a cut-off line hands over with no gap, and yells punch and flinch', () => {
    const tl = compile(parseScript(`${head}RON: The draft was--\n\nDON: !!THE DRAFT.!!`));
    const [ron, don] = tl.lines;
    assert.ok(ron.cutoff);
    assert.equal(don.t0, ron.t1);
    assert.equal(tl.punches.length, 1);
    const frame = frameAt(tl, tl.punches[0].t + 100);
    assert.equal(frame.hosts.don.gesture, 'angry');
    assert.equal(frame.hosts.ron.flinch, true);
    assert.equal(frame.captions.ron?.knocked, true);
});

test('frames are deterministic and reveal words over time', () => {
    const tl = compile(parseScript(`${head}DON (point): Yeah. And put the thing up.`));
    const line = tl.lines[0];
    assert.equal(frameAt(tl, line.t0 - 1).captions.don, null);
    assert.equal(frameAt(tl, line.t0).captions.don?.shown, 1);
    assert.equal(frameAt(tl, line.t1).captions.don?.shown, line.words.length);
    // holds the point with a closed mouth afterwards
    assert.equal(frameAt(tl, line.end + 10).hosts.don.gesture, 'point');
    assert.deepEqual(frameAt(tl, 5000), frameAt(tl, 5000));
});

test('compare, numbers and player graphics parse', () => {
    const script = parseScript(`${head}>> compare Reapers 158 TEEHAW 114.1, G 12 8, *Hit 29 17\n>> numbers HH 1 goal, 18 assists\n>> player "Tom Wilson" Lali hearts "76th overall"\nRON: Hi.`);
    const graphics = script.events.flatMap(e => e.kind === 'stage' ? e.cues : []).map(c => c.type === 'monitor' && c.graphic);
    assert.deepEqual(graphics[0], { type: 'compare', home: 'Reapers', away: 'TEEHAW', homeScore: '158', awayScore: '114.1', rows: [{ label: 'G', home: '12', away: '8', highlight: undefined }, { label: 'Hit', home: '29', away: '17', highlight: true }] });
    assert.deepEqual(graphics[1], { type: 'numbers', team: 'HH', items: [{ value: '1', label: 'goal' }, { value: '18', label: 'assists' }] });
    assert.deepEqual(graphics[2], { type: 'player', name: 'Tom Wilson', team: 'Lali', caption: '76th overall', mood: 'hearts' });
    assert.deepEqual(playerRefs(script), ['Tom Wilson']);
});
