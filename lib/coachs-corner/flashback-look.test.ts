import assert from 'node:assert/strict';
import test from 'node:test';
import { episodeFrom } from './episode';
import { flashbackLook, type FlashbackLook } from './flashback-look';
import { compileAudioCues } from './audio-cues';
import { frameAt, nextShownFrame, shownFrame } from './timeline';
import { createTransport, type TransportOutput } from './transport';

const SCRIPT = `---
title: Test
season: 2027
week: 6
---
DON: This week.

[flashback: week 4]
RON: Who's he going to get in a trade?

DON (point): He's sitting right there.
[end flashback]

RON: Back to now.

[flashback: week 2]
DON: Two weeks back.
[end flashback]

RON: Now again.`;

const tl = episodeFrom(SCRIPT).timeline;
const middle = (line: { t0: number; t1: number }) => (line.t0 + line.t1) / 2;

/** what the studio shows at show time t when it played straight into it */
const played = (t: number): FlashbackLook => flashbackLook(frameAt(tl, t).flashback, { jumped: false, cut: null });

test('outside a flashback there is no look; between its transitions the grade is full and still', () => {
    const [now, first] = tl.lines;
    assert.deepEqual(played(middle(now)), { grade: 0, blip: 0, ripple: 0, cut: null });
    assert.deepEqual(played(middle(first)), { grade: 1, blip: 0, ripple: 0, cut: null });
});

/** the look sampled through a transition, start to end */
const through = (from: number, to: number, steps = 40) => Array.from({ length: steps + 1 }, (_, i) => played(from + (to - from) * Math.min(i / steps, 0.999)));
const peak = (looks: FlashbackLook[], key: 'blip' | 'ripple') => Math.max(...looks.map(look => look[key]));

test('going in, the rewind blip hits at once and fades while the studio ripples into the full grade', () => {
    const span = tl.flashbacks![0];
    const looks = through(span.t0, span.entered);
    const [start, end] = [looks[0], looks[looks.length - 1]];
    assert.equal(start.grade, 0, 'the present is ungraded when the rewind starts');
    assert.ok(start.blip >= 0.9, `the blip hits at once: ${start.blip}`);
    assert.ok(end.grade > 0.99 && end.blip < 0.02 && end.ripple < 0.02, `it settles into the flashback: ${JSON.stringify(end)}`);
    for (let i = 1; i < looks.length; i++) assert.ok(looks[i].grade >= looks[i - 1].grade, 'the grade only deepens going in');
    const mid = looks[Math.floor(looks.length / 2)];
    assert.ok(mid.ripple >= 0.9 && start.ripple < 0.1, `the ripple swells to the dissolve's middle: ${start.ripple} -> ${mid.ripple}`);
    assert.ok(mid.grade > 0.2 && mid.grade < 0.8, `the dissolve is half way at the middle: ${mid.grade}`);
});

test('coming out plays a softer rewind and dissolves the grade away', () => {
    const span = tl.flashbacks![0];
    const going = through(span.t0, span.entered);
    const coming = through(span.leaving, span.t1);
    const [start, end] = [coming[0], coming[coming.length - 1]];
    assert.ok(start.grade > 0.99, `the past is fully graded when the exit starts: ${start.grade}`);
    assert.ok(end.grade < 0.01 && end.blip < 0.02 && end.ripple < 0.02, `it settles back into the present: ${JSON.stringify(end)}`);
    for (let i = 1; i < coming.length; i++) assert.ok(coming[i].grade <= coming[i - 1].grade, 'the grade only fades coming out');
    for (const key of ['blip', 'ripple'] as const) {
        assert.ok(peak(coming, key) > 0.2, `the exit still has a ${key}`);
        assert.ok(peak(coming, key) < 0.7 * peak(going, key), `the exit ${key} is softer: ${peak(coming, key)} vs ${peak(going, key)}`);
    }
});

/**
 * The studio's view of playback: every frame the show publishes, read the way the studio reads it,
 * carrying the held cut from one frame to the next.
 */
const watcher = () => {
    const transport = createTransport(tl, compileAudioCues(tl));
    let shown = shownFrame(frameAt(tl, 0));
    let cut: string | null = null;
    let now = 0, time = 0;
    const looks: { t: number; look: FlashbackLook }[] = [];
    const show = (out: TransportOutput, force = false) => {
        time = out.time;
        const next = nextShownFrame(shown, tl, out, { force });
        if (next === shown) return;
        shown = next;
        const look = flashbackLook(shown.frame.flashback, { jumped: shown.jumped, cut });
        cut = look.cut;
        looks.push({ t: out.time, look });
    };
    return {
        looks,
        seek: (t: number) => show(transport.seek(t)),
        play: () => show(transport.play(now), true),
        /** play on, one animation frame at a time, until show time reaches t */
        until: (t: number) => { while (time < t) { now += 16; show(transport.tick(now)); } },
    };
};
const moving = (look: FlashbackLook) => look.blip > 0 || look.ripple > 0;

test('a jump into a transition cuts straight to the flashback look and holds it until the transition ends', () => {
    const span = tl.flashbacks![0];
    const watch = watcher();
    watch.seek(span.t0 + (span.entered - span.t0) * 0.3);
    watch.play();
    watch.until(span.leaving + 1);
    const entry = watch.looks.filter(({ t }) => t < span.entered);
    assert.ok(entry.length > 3, 'the rest of the entry was published as it played');
    for (const { t, look } of entry) assert.deepEqual([look.grade, look.blip, look.ripple], [1, 0, 0], `no rewind after the jump at ${t} ms`);

    watch.until(span.t1);
    const exit = watch.looks.filter(({ t }) => t >= span.leaving && t < span.t1);
    assert.ok(exit.some(({ look }) => moving(look)), 'the exit the show then plays into still rewinds');
});

test('a jump into the way out stays in the flashback look until the present returns', () => {
    const [first, second] = tl.flashbacks!;
    const watch = watcher();
    watch.seek(first.leaving + 50);
    watch.play();
    watch.until(second.entered);
    const exit = watch.looks.filter(({ t }) => t < first.t1);
    for (const { t, look } of exit) assert.deepEqual([look.grade, look.blip, look.ripple], [1, 0, 0], `no rewind after the jump at ${t} ms`);
    const after = watch.looks.filter(({ t }) => t >= first.t1 && t < second.t0);
    assert.ok(after.length && after.every(({ look }) => look.grade === 0), 'then it snaps back to the present');
    assert.ok(watch.looks.some(({ t, look }) => t >= second.t0 && moving(look)), 'the next flashback the show plays into rewinds');
});
