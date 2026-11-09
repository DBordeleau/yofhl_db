import assert from 'node:assert/strict';
import test from 'node:test';
import { compileAudioCues } from './audio-cues';
import { parseScript } from './script';
import { compile, frameAt, frameSignature, nextShownFrame, shownFrame } from './timeline';
import { createTransport } from './transport';

// Don changes gesture on every line and the monitor cuts twice, so most seeks land on a new pose and a new graphic.
const SCRIPT = [
    '---', 'title: Seek check', '---',
    '[don: rest, ron: rest]',
    'RON: [>> stat "311" "All-time record" "Most points in one week"] Three-eleven. A new record.',
    'DON (point): Again? Three weeks ago somebody set the old one!',
    'RON (deadpan): It keeps happening.',
    'DON (angry, yell): !!EVERY WEEK!!',
    '>> off',
    'DON (thumbs-up, warm): Good for him, though.',
].join('\n');

const setup = () => {
    const tl = compile(parseScript(SCRIPT));
    return { tl, transport: createTransport(tl, compileAudioCues(tl)) };
};

test('a seek lands on the frame that playing to the same moment shows', () => {
    const { tl, transport } = setup();
    const targets = [...tl.lines.flatMap(line => [line.t0, line.t0 + 120, (line.t0 + line.t1) / 2]), ...tl.monitor.map(cut => cut.t + 40), tl.showEnd - 1];
    assert.ok(new Set(targets.map(t => frameAt(tl, t).hosts.don.gesture)).size >= 4, 'the seeks cover several of Don’s gestures');
    transport.play(0);
    let now = 0;
    for (const t of [...targets].sort((a, b) => a - b)) {
        // play there one animation frame at a time, then compare with jumping straight to the same time
        let out = transport.tick(now);
        while (out.time < t) { now += Math.min(16, t - out.time); out = transport.tick(now); }
        assert.equal(out.time, t);
        assert.deepEqual(frameAt(tl, transport.seek(t).time), frameAt(tl, t), `seeking to ${t} ms`);
    }
});

test('the frame a jump lands on is shown as a jump until something visible changes', () => {
    const { tl, transport } = setup();
    const line = tl.lines.find(l => l.speaker === 'don' && frameAt(tl, l.t0 - 1).hosts.don.gesture !== frameAt(tl, l.t0).hosts.don.gesture)!;
    let shown = shownFrame(frameAt(tl, 0));
    assert.equal(shown.jumped, false, 'the opening picture is not a jump');

    shown = nextShownFrame(shown, tl, transport.seek(line.t0));
    assert.equal(shown.jumped, true);
    assert.equal(shown.frame.hosts.don.gesture, frameAt(tl, line.t0).hosts.don.gesture, 'it lands on the target’s pose at once');
    assert.equal(shown.signature, frameSignature(frameAt(tl, line.t0)));

    const played = nextShownFrame(shown, tl, transport.play(0), { force: true });
    assert.equal(played.jumped, true, 'pressing play on the frame a seek landed on keeps it a jump');

    // the next tick with nothing new on screen keeps the same frame object, so the studio doesn't re-render
    const still = transport.tick(0);
    assert.equal(nextShownFrame(played, tl, still), played);

    let now = 0, next = played;
    while (next === played) { now += 16; next = nextShownFrame(played, tl, transport.tick(now)); }
    assert.equal(next.jumped, false, 'the first visible change after the jump plays as normal');
    assert.notEqual(next.signature, played.signature);
});

test('jumping to the moment already on screen is still a jump', () => {
    const { tl, transport } = setup();
    const t = tl.lines[2].t0;
    const before = nextShownFrame(shownFrame(frameAt(tl, 0)), tl, { ...transport.seek(t), jumped: false }, { force: true });
    const after = nextShownFrame(before, tl, transport.seek(t));
    assert.equal(after.signature, before.signature);
    assert.equal(after.jumped, true);
});
