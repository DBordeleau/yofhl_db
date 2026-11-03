import assert from 'node:assert/strict';
import test from 'node:test';
import { compileAudioCues } from './audio-cues';
import { parseScript } from './script';
import { compile } from './timeline';
import { createTransport } from './transport';

const SCRIPT = '---\ntitle: Transport check\n---\nRON: The draft was Saturday, and we have the opening matchups to get through.\nDON (point): Yeah. Put the thing up. The other thing. With the kid.\nRON (deadpan): It is a keeper league.';

const setup = () => {
    const tl = compile(parseScript(SCRIPT));
    return { tl, transport: createTransport(tl, compileAudioCues(tl)) };
};

test('the intro runs at 1× at every speed', () => {
    for (const speed of [1, 1.25, 1.5]) {
        const { transport } = setup();
        transport.setSpeed(speed);
        transport.play(1000);
        assert.equal(transport.tick(1500).time, 500);
        assert.equal(transport.tick(5000).time, 4000);
        assert.equal(transport.tick(5000).phase, 'intro');
    }
});

test('the segment runs at the chosen speed', () => {
    const { transport } = setup();
    transport.seek(7000);
    transport.setSpeed(1.5);
    transport.play(0);
    const out = transport.tick(100);
    assert.equal(out.time, 7150);
    assert.equal(out.phase, 'segment');
});

test('a tick crossing the intro boundary is split exactly', () => {
    const { transport } = setup();
    transport.seek(5980);
    transport.setSpeed(1.5);
    transport.play(0);
    // 20 ms at 1× reaches 6000, then 30 ms at 1.5× reaches 6045
    assert.equal(transport.tick(50).time, 6045);
});

test('play from the top starts the theme and bumper together', () => {
    const { transport } = setup();
    const out = transport.play(0);
    assert.deepEqual(out.theme, { play: 0 });
    assert.equal(out.bumper?.offset, 0);
    assert.equal(out.bumper?.paused, false);
    assert.equal(transport.tick(16).theme, null, 'a plain tick leaves the theme alone');
});

test('a seek into the intro plays the theme from there and remounts the bumper at that moment', () => {
    const { transport } = setup();
    const start = transport.play(0);
    transport.tick(9000);
    const out = transport.seek(2500);
    assert.deepEqual(out.theme, { play: 2500 });
    assert.equal(out.bumper?.offset, 2500);
    assert.equal(out.bumper?.paused, false);
    assert.notEqual(out.bumper?.mount, start.bumper?.mount);
    assert.equal(transport.seek(2500).bumper?.mount !== out.bumper?.mount, true, 'seeking to the same moment still restarts the bumper');
});

test('a seek out of the intro stops the theme and removes the bumper', () => {
    const { transport } = setup();
    transport.play(0);
    transport.tick(1000);
    const out = transport.seek(8000);
    assert.equal(out.theme, 'pause');
    assert.equal(out.bumper, null);
});

test('pause freezes the bumper and theme; resume continues the same bumper', () => {
    const { transport } = setup();
    transport.play(0);
    const running = transport.tick(2000);
    const paused = transport.pause();
    assert.equal(paused.theme, 'pause');
    assert.deepEqual(paused.bumper, { ...running.bumper!, paused: true });
    assert.equal(transport.tick(5000).time, 2000, 'a paused transport holds show time');
    const resumed = transport.play(5000);
    assert.deepEqual(resumed.theme, { play: 2000 });
    assert.deepEqual(resumed.bumper, running.bumper);
    assert.equal(transport.tick(5100).time, 2100);
});

test('regression: at 1.5× the bumper stays until 6000 ms of show time, so its wipe finishes', () => {
    const { transport } = setup();
    transport.setSpeed(1.5);
    transport.play(0);
    for (let now = 16; now < 6000; now += 16) {
        const out = transport.tick(now);
        assert.equal(out.phase, 'intro', `still intro at ${now} ms of real time`);
        assert.notEqual(out.bumper, null);
    }
    const out = transport.tick(6000);
    assert.equal(out.time, 6000);
    assert.equal(out.bumper, null);
    assert.equal(out.theme, 'pause');
});

test('ticks fire the cues they pass, at the rate show time is moving', () => {
    const { tl, transport } = setup();
    const first = tl.lines[0].t0;
    transport.seek(first - 10);
    transport.setSpeed(1.25);
    transport.play(0);
    const out = transport.tick(16);
    assert.ok(out.cues.some(cue => cue.id === 'ron' && cue.t === first), 'the first syllable fires');
    assert.ok(out.cues.every(cue => cue.t > first - 10 && cue.t <= out.time));
    assert.equal(out.rate, 1.25);
    assert.deepEqual(transport.tick(16).cues, [], 'a repeated timestamp fires nothing');
    assert.deepEqual(transport.seek(first - 10).cues, [], 'seeking is silent');

    const intro = setup().transport;
    intro.setSpeed(1.5);
    const opening = intro.play(0);
    assert.equal(opening.rate, 1, 'the intro runs at 1× however fast the segment will be');
    assert.deepEqual(intro.tick(16).cues.map(cue => cue.id), ['sting']);
});

test('a stalled two-second tick fires only the last 120 ms × speed of cues', () => {
    const { tl, transport } = setup();
    transport.seek(tl.lines[0].t0);
    transport.setSpeed(1.5);
    transport.play(0);
    const out = transport.tick(2000);
    assert.equal(out.time, tl.lines[0].t0 + 3000);
    assert.ok(out.cues.length > 0);
    assert.ok(out.cues.every(cue => cue.t > out.time - 180), 'nothing older than 180 ms of show time');
});

test('reaching the end of the episode stops playback and reports it ended', () => {
    const { tl, transport } = setup();
    transport.seek(tl.showEnd);
    const card = transport.play(0);
    assert.equal(card.ended, false);
    assert.equal(transport.tick(300).phase, 'segment', 'the end card waits a beat after the last line');
    assert.equal(transport.tick(500).phase, 'end');
    const out = transport.tick(60_000);
    assert.equal(out.time, tl.duration);
    assert.equal(out.playing, false);
    assert.equal(out.ended, true);
    assert.equal(transport.tick(70_000).time, tl.duration, 'it does not run past the end');
});

test('play at the end restarts from the top', () => {
    const { tl, transport } = setup();
    transport.seek(tl.duration);
    const out = transport.play(0);
    assert.equal(out.time, 0);
    assert.equal(out.ended, false);
    assert.deepEqual(out.theme, { play: 0 });
    assert.equal(out.bumper?.offset, 0);
});

test('seeks clamp to the episode', () => {
    const { tl, transport } = setup();
    assert.equal(transport.seek(-500).time, 0);
    assert.equal(transport.seek(tl.duration + 500).time, tl.duration);
});

test('a speed change during the intro waits for the segment; during the segment it applies on the next tick', () => {
    const { transport } = setup();
    transport.play(0);
    transport.tick(3000);
    transport.setSpeed(1.5);
    assert.equal(transport.tick(4000).time, 4000);
    assert.equal(transport.tick(7000).time, 7500);
    transport.setSpeed(1);
    assert.equal(transport.tick(7100).time, 7600);
});
