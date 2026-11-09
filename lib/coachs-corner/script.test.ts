import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, hasErrors, playerRefs, type ScriptEvent } from './script';
import { compile, frameAt } from './timeline';

const lines = (source: string) => parseScript(source).events.filter((e): e is Extract<ScriptEvent, { kind: 'line' }> => e.kind === 'line');
const head = '---\ntitle: Test\n---\n';

test('the front matter can pin a poppy on both hosts', () => {
    assert.equal(parseScript('---\ntitle: Test\nlapel: poppy\n---\n').meta.lapel, 'poppy');
    assert.equal(parseScript(head).meta.lapel, undefined);
    const wrong = parseScript('---\ntitle: Test\nlapel: rose\n---\n');
    assert.ok(hasErrors(wrong) && wrong.meta.lapel === undefined);
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
    const script = parseScript(`${head}DON (moonwalk): hi\nGARY: hello\n[cam: dutch]\n>> scoreboard\nRON: {yell no colon}`, );
    assert.ok(hasErrors(script));
    const at = (n: number) => script.diagnostics.filter(d => d.line === n).map(d => d.message).join(' ');
    assert.match(at(4), /moonwalk/);
    assert.match(at(5), /GARY/);
    assert.match(at(6), /camera shot/);
    assert.match(at(7), /monitor graphic/);
    assert.match(at(8), /colon/);
});

test('completed matchups opt into winner labels and require both scores', () => {
    const script = parseScript(`${head}>> matchup SKGS 230.8 JAGR 222.85 final "Week 1 / Final"\nRON: Final.`);
    assert.deepEqual(script.diagnostics, []);
    const event = script.events[0];
    assert.equal(event.kind, 'stage');
    if (event.kind !== 'stage') return;
    assert.deepEqual(event.cues, [{ type: 'monitor', graphic: {
        type: 'matchup', home: 'SKGS', away: 'JAGR', homeScore: '230.8', awayScore: '222.85',
        caption: 'Week 1 / Final', status: 'final',
    } }]);
    assert.ok(hasErrors(parseScript(`${head}>> matchup HH NPD final`)));
    assert.ok(hasErrors(parseScript(`${head}>> matchup HH 41.5 NPD final`)));
});

test('standings preserve point precision and validate records and team references', () => {
    const script = parseScript(`${head}>> standings "Week 1 standings" HH 1 0 212.35, NPD 0 1 174.20\nRON: Standings.`);
    const event = script.events[0];
    assert.equal(event.kind, 'stage');
    if (event.kind !== 'stage') return;
    assert.deepEqual(event.cues, [{ type: 'monitor', graphic: {
        type: 'standings', title: 'Week 1 standings', rows: [
            { team: 'HH', wins: 1, losses: 0, points: '212.35' },
            { team: 'NPD', wins: 0, losses: 1, points: '174.20' },
        ],
    } }]);
    assert.deepEqual(script.diagnostics, []);
    assert.deepEqual(script.teamRefs, [{ ref: 'HH', line: 4 }, { ref: 'NPD', line: 4 }], 'every team the graphic names, on its line');
    for (const bad of ['', 'HH 1 212.35', 'HH -1 0 212.35', 'HH 1.5 0 212.35', 'HH 1 0 unknown', Array(11).fill('HH 1 0 212.35').join(', ')]) {
        assert.ok(hasErrors(parseScript(`${head}>> standings ${bad}\nRON: Standings.`)), bad);
    }
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
    assert.deepEqual(graphics[2], { type: 'player', player: { name: 'Tom Wilson' }, team: 'Lali', caption: '76th overall', mood: 'hearts' });
    assert.deepEqual(playerRefs(script), [{ name: 'Tom Wilson' }]);
});

test('every player cue can pin a namesake by Fantrax id, and refs carry the id', () => {
    const script = parseScript(`${head}>> player "Elias Pettersson" #048x9 VAN "Lali's guy"
>> gap "Elias Pettersson" #048X9 "Elias Pettersson" #0ab12 "Tom Wilson"
>> stat "2x" "Hat tricks" VWIZ with "Elias Pettersson" #0ab12
RON: Hi. [>> numbers Lali 1 goal with "Elias Pettersson" #048x9 "Week 1"]`);
    assert.deepEqual(script.diagnostics, []);
    const graphics = script.events.flatMap(e => e.kind === 'stage' ? e.cues : e.parts.flatMap(p => p.kind === 'cue' ? [p.cue] : []))
        .map(c => c.type === 'monitor' && c.graphic);
    assert.deepEqual(graphics[0], { type: 'player', player: { name: 'Elias Pettersson', id: '048x9' }, team: 'VAN', caption: 'Lali’s guy', mood: undefined });
    assert.deepEqual(graphics[1], { type: 'gap', base: { name: 'Elias Pettersson', id: '048x9' }, others: [{ name: 'Elias Pettersson', id: '0ab12' }, { name: 'Tom Wilson' }] });
    assert.deepEqual(graphics[2], { type: 'stat', value: '2x', label: 'Hat tricks', detail: undefined, team: 'VWIZ', player: { name: 'Elias Pettersson', id: '0ab12' } });
    assert.deepEqual(graphics[3], { type: 'numbers', team: 'Lali', items: [{ value: '1', label: 'goal' }], player: { name: 'Elias Pettersson', id: '048x9' }, caption: 'Week 1' });
    assert.deepEqual(playerRefs(script), [{ name: 'Elias Pettersson', id: '048x9' }, { name: 'Elias Pettersson', id: '0ab12' }, { name: 'Tom Wilson' }]);
});

test('an id keeps its asterisks out', () => {
    const script = parseScript(`${head}>> player "Elias Pettersson" #*048x9*\nRON: Hi.`);
    assert.match(script.diagnostics.map(d => d.message).join('\n'), /without its asterisks/);
});

test('the stats season is the season before the episode unless the front matter names an earlier one', () => {
    const front = (lines: string) => parseScript(`---\ntitle: T\n${lines}\n---\nRON: Hi.`);
    assert.equal(front('season: 2027').meta.stats, undefined);
    const retro = front('season: 2027\nstats: 2025');
    assert.deepEqual(retro.diagnostics, []);
    assert.equal(retro.meta.stats, 2025);
    for (const value of ['2027', '2028', 'last year']) {
        const wrong = front(`season: 2027\nstats: ${value}`);
        assert.ok(hasErrors(wrong), value);
        assert.equal(wrong.meta.stats, undefined);
    }
    assert.ok(hasErrors(front('stats: 2025')), 'stats needs a season to be earlier than');
});

test('stat and numbers graphics can feature a player headshot', () => {
    const script = parseScript(`${head}>> stat "2x" "Hat tricks" "Oct 13 and 15" VWIZ with "Brady Tkachuk"\n>> numbers Lali 0 goals, 0 assists with "Tom Wilson" "Oct 12–18 · 3 GP"\n>> numbers HH 2 goals "Week 1"\nRON: Hi.`);
    const graphics = script.events.flatMap(e => e.kind === 'stage' ? e.cues : []).map(c => c.type === 'monitor' && c.graphic);
    assert.deepEqual(graphics[0], { type: 'stat', value: '2x', label: 'Hat tricks', detail: 'Oct 13 and 15', team: 'VWIZ', player: { name: 'Brady Tkachuk' } });
    assert.deepEqual(graphics[1], { type: 'numbers', team: 'Lali', items: [{ value: '0', label: 'goals' }, { value: '0', label: 'assists' }], player: { name: 'Tom Wilson' }, caption: 'Oct 12–18 · 3 GP' });
    assert.deepEqual(graphics[2], { type: 'numbers', team: 'HH', items: [{ value: '2', label: 'goals' }], caption: 'Week 1' });
    assert.deepEqual(playerRefs(script), [{ name: 'Brady Tkachuk' }, { name: 'Tom Wilson' }]);
});

test('wire cards name the move, the team and the players, and their players get headshots', () => {
    const script = parseScript(`${head}>> wire claim JAGR "Ryan O'Reilly" "Mon. Nov. 9 / C · Nashville"
>> wire drop HUNG "Stuart Skinner"
>> wire swap HH "Mackenzie Blackwood" "John Gibson" "Sun. Nov. 8"
>> wire free "Kent Johnson" #06abc "5th overall, 2021"
RON: Hi.`);
    assert.deepEqual(script.diagnostics, []);
    const graphics = script.events.flatMap(e => e.kind === 'stage' ? e.cues : []).map(c => c.type === 'monitor' && c.graphic);
    assert.deepEqual(graphics[0], { type: 'wire', action: 'claim', team: 'JAGR', player: { name: "Ryan O'Reilly" }, detail: 'Mon. Nov. 9 / C · Nashville' });
    assert.deepEqual(graphics[1], { type: 'wire', action: 'drop', team: 'HUNG', player: { name: 'Stuart Skinner' } });
    assert.deepEqual(graphics[2], { type: 'wire', action: 'swap', team: 'HH', player: { name: 'Mackenzie Blackwood' }, out: { name: 'John Gibson' }, detail: 'Sun. Nov. 8' });
    assert.deepEqual(graphics[3], { type: 'wire', action: 'free', team: undefined, player: { name: 'Kent Johnson', id: '06abc' }, detail: '5th overall, 2021' });
    assert.deepEqual(playerRefs(script), [{ name: "Ryan O'Reilly" }, { name: 'Stuart Skinner' }, { name: 'Mackenzie Blackwood' }, { name: 'John Gibson' }, { name: 'Kent Johnson', id: '06abc' }]);
});

test('a wire card without a move, team or second swap player says how to write it', () => {
    const script = parseScript(`${head}>> wire JAGR "Ryan O'Reilly"\n>> wire claim "Ryan O'Reilly"\n>> wire swap HH "Mackenzie Blackwood"\nRON: Hi.`);
    const at = (n: number) => script.diagnostics.filter(d => d.line === n).map(d => d.message).join(' ');
    assert.match(at(4), /needs a move/);
    assert.match(at(5), /names the team/);
    assert.match(at(6), /player in, then the player out/);
});

test('a wire card carries this season’s FPts and FP/G for each player, in the order they are named', () => {
    const script = parseScript(`${head}>> wire free "Kent Johnson" fpts 83.75 fpg 5.58 "Columbus"
>> wire swap HH "Mackenzie Blackwood" "John Gibson" fpg 6.46 fpts 90.4 fpg 3.69 fpts 40.6 "Sun. Nov. 8"
>> wire claim JAGR "Ryan O'Reilly" fp/g 5.68
RON: Hi.`);
    assert.deepEqual(script.diagnostics, []);
    const graphics = script.events.flatMap(e => e.kind === 'stage' ? e.cues : []).map(c => c.type === 'monitor' && c.graphic);
    assert.deepEqual(graphics[0], { type: 'wire', action: 'free', team: undefined, player: { name: 'Kent Johnson' }, detail: 'Columbus', stats: [{ fpts: '83.75', fpg: '5.58' }] });
    assert.deepEqual(graphics[1], { type: 'wire', action: 'swap', team: 'HH', player: { name: 'Mackenzie Blackwood' }, out: { name: 'John Gibson' }, detail: 'Sun. Nov. 8',
        stats: [{ fpg: '6.46', fpts: '90.4' }, { fpg: '3.69', fpts: '40.6' }] });
    assert.deepEqual(graphics[2], { type: 'wire', action: 'claim', team: 'JAGR', player: { name: "Ryan O'Reilly" }, stats: [{ fpg: '5.68' }] });
    const extra = parseScript(`${head}>> wire claim JAGR "Ryan O'Reilly" fpts 96.5 fpts 1\nRON: Hi.`);
    assert.match(extra.diagnostics.map(d => d.message).join(' '), /one fpts and one fpg/);
});

test('an unknown gesture lists the host’s actions and wardrobe prefixes, not every gesture', () => {
    const gestureError = (source: string) => parseScript(source).diagnostics.find(d => d.message.includes('gesture'))?.message;
    assert.equal(gestureError(`${head}[don: wave]`), 'Don has no “wave” gesture. Try: rest, point, thumbs, angry, surprised, lean, stare, pause, tie, mic, pound, pound-ready. '
        + 'For another wardrobe, start it with halloween-, alternate-1-, alternate-2-, alternate-3- or remembrance-.');
    assert.equal(gestureError(`${head}[ron: wave]`), 'Ron has no “wave” gesture. Try: rest, skeptical, warning, surprised, down.');
});
