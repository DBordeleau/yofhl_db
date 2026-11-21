import { mediaUrl } from './media';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createShowAudio } from '../../components/coachs-corner/audio';
import { CLASSIC_SOUND_BANK, STUDIO_SOUND_BANK } from './sound-bank';
import { episodeFrom } from './episode';

// Control the clock and source lifetime to exercise rapid transport/mix changes.
class Param {
    value: number;
    scheduled: { t: number; v: number }[] = [];
    held: number | null = null;
    private readonly ctx?: Context;
    constructor(initial = 0, ctx?: Context) { this.value = initial; this.ctx = ctx; }
    setValueAtTime(v: number, t = 0) {
        if (!this.ctx || t <= this.ctx.currentTime) this.value = v;
        else this.scheduled.push({ t, v });
    }
    exponentialRampToValueAtTime(v: number, t = 0) {
        if (!this.ctx || t <= this.ctx.currentTime) this.value = v;
        else this.scheduled.push({ t, v });
    }
    linearRampToValueAtTime(v: number, t = 0) {
        if (!this.ctx || t <= this.ctx.currentTime) this.value = v;
        else this.scheduled.push({ t, v });
    }
    setTargetAtTime() {}
    cancelScheduledValues() { this.scheduled.length = 0; }
    cancelAndHoldAtTime(t: number) {
        let current = this.value;
        for (const item of this.scheduled) if (item.t <= t) current = item.v;
        this.scheduled.length = 0;
        this.value = current;
        this.held = current;
    }
}
class Node {
    gain: Param; frequency: Param; detune: Param; Q: Param; playbackRate: Param;
    loop = false;
    stops: number[] = [];
    starts: number[] = [];
    onended?: () => void;
    constructor(ctx?: Context) {
        this.gain = new Param(1, ctx);
        this.frequency = new Param(0, ctx);
        this.detune = new Param(0, ctx);
        this.Q = new Param(0, ctx);
        this.playbackRate = new Param(1, ctx);
    }
    connect<T>(target: T) { return target; }
    disconnect() {}
    start(t: number) { this.starts.push(t); }
    stop(t: number) { this.stops.push(t); }
}
class Context {
    static instances: Context[] = [];
    currentTime = 0; sampleRate = 100; state = 'running'; destination: Node;
    sources: Node[] = [];
    gains: Node[] = [];
    resumeCalls = 0;
    constructor() { this.destination = new Node(this); Context.instances.push(this); }
    createGain() { const n = new Node(this); this.gains.push(n); return n; }
    createDynamicsCompressor() { return new Node(this); }
    createBiquadFilter() { return new Node(this); }
    createOscillator() { const n = new Node(this); this.sources.push(n); return n; }
    createBufferSource() { return this.createOscillator(); }
    createBuffer(_channels: number, length: number, sampleRate: number) { return { duration: length / sampleRate, getChannelData: () => new Float32Array(length) }; }
    resume() { this.resumeCalls++; return Promise.resolve(); }
    decodeAudioData() { return Promise.resolve(this.createBuffer(1, 20, 100)); }
    close() { this.state = 'closed'; return Promise.resolve(); }
}

function installContext(t: TestContext) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: Context } });
    t.after(() => {
        if (previous) Object.defineProperty(globalThis, 'window', previous);
        else Reflect.deleteProperty(globalThis, 'window');
    });
}

test('ambience starts once, survives voice gaps, and stops on pause/mute/end and a switch to classic', t => {
    installContext(t);
    const audio = createShowAudio(STUDIO_SOUND_BANK);
    assert.ok(audio.unlock());
    const ctx = Context.instances.at(-1)!;
    audio.sync(true, true, 5000, 40000);
    assert.equal(ctx.sources.length, 0);
    audio.sync(true, true, 5600, 40000);
    assert.equal(ctx.sources.length, 2);
    audio.sync(true, true, 8000, 40000);
    assert.equal(ctx.sources.length, 2);
    audio.setBank(CLASSIC_SOUND_BANK);
    assert.ok(ctx.sources.every(source => source.stops.length === 1));
    audio.sync(true, true, 9000, 40000);
    assert.equal(ctx.sources.length, 2);
    audio.setBank(STUDIO_SOUND_BANK);
    audio.sync(true, true, 10000, 40000);
    assert.equal(ctx.sources.length, 4);
    audio.sync(true, false, 10001, 40000);
    audio.sync(true, false, 10002, 40000);
    assert.ok(ctx.sources.every(source => source.stops.length === 1), 'mute must not keep postponing source termination');
    audio.sync(true, true, 11000, 40000);
    audio.sync(false, true, 11001, 40000);
    assert.ok(ctx.sources.every(source => source.stops.length === 1));
    audio.sync(true, true, 12000, 40000);
    audio.sync(true, true, 40000, 40000);
    assert.ok(ctx.sources.every(source => source.stops.length === 1));
    audio.dispose();
    assert.equal(ctx.state, 'closed');
});

test('separate players do not stop each other, and disposal permits a clean remount', t => {
    installContext(t);
    const first = createShowAudio(STUDIO_SOUND_BANK), second = createShowAudio(STUDIO_SOUND_BANK);
    first.unlock(); second.unlock();
    const [a, b] = Context.instances.slice(-2);
    first.sync(true, true, 6000, 40000); second.sync(true, true, 6000, 40000);
    first.stop();
    assert.ok(a.sources.every(source => source.stops.length === 1));
    assert.ok(b.sources.every(source => source.stops.length === 0));
    first.dispose();
    first.unlock();
    first.sync(true, true, 6000, 40000);
    assert.equal(Context.instances.at(-1)!.sources.length, 2);
    first.dispose(); second.dispose();
});

test('replacement samples are cached, fit the voice slot, and stop on seeking', async t => {
    installContext(t);
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1])));
    const audio = createShowAudio({ ...STUDIO_SOUND_BANK, don: { source: { files: ['/voice.wav'] }, gain: 1 } });
    audio.unlock();
    await Promise.all([audio.prepare(), audio.prepare()]);
    assert.deepEqual(fetch.mock.calls.map(call => call.arguments[0]).sort(),
        [mediaUrl('/coachs-corner/audio/desk-pound.wav'), mediaUrl('/coachs-corner/audio/happy-twinkle.wav'), mediaUrl('/coachs-corner/audio/tie-cloth-7.wav'), '/voice.wav']);
    audio.fire({ t: 6000, id: 'don', voice: { who: 'don', delivery: 'normal', duration: 100, progress: 0, variation: 0, question: false,
        wordStart: true, phraseEnd: false, cutoff: false, interrupting: false } }, 1);
    const ctx = Context.instances.at(-1)!;
    assert.equal(ctx.sources.length, 1);
    assert.ok(ctx.sources[0].stops[0] < 0.2);
    audio.stop();
    assert.equal(ctx.sources[0].stops.at(-1), 0.025);
    audio.dispose();
});

test('the default mix caches recorded effects once, plays each cue once and stops them on mute', async t => {
    installContext(t);
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1])));
    const audio = createShowAudio();
    audio.unlock();
    await Promise.all([audio.prepare(), audio.prepare()]);
    assert.deepEqual(fetch.mock.calls.map(call => call.arguments[0]).sort(),
        [mediaUrl('/coachs-corner/audio/desk-pound.wav'), mediaUrl('/coachs-corner/audio/happy-twinkle.wav'), mediaUrl('/coachs-corner/audio/tie-cloth-7.wav')]);
    const ctx = Context.instances.at(-1)!;
    audio.fire({ t: 31000, id: 'tie' }, 1);
    assert.equal(ctx.sources.length, 1);
    assert.equal(ctx.sources[0].starts.length, 1);
    audio.fire({ t: 32000, id: 'desk-pound' }, 1);
    assert.equal(ctx.sources.length, 2);
    assert.equal(ctx.sources[1].starts.length, 1);
    audio.sync(true, true, 6000, 40000);
    assert.equal(ctx.sources.length, 4, 'the default mix also starts studio ambience');
    audio.sync(true, false, 6001, 40000);
    assert.ok(ctx.sources.every(source => source.stops.at(-1) === 0.025));
    audio.dispose();
});

test('a failed sample load is reported and can be retried', async t => {
    installContext(t);
    let attempts = 0;
    t.mock.method(globalThis, 'fetch', async () => ++attempts === 1 ? new Response(null, { status: 404 }) : new Response(new Uint8Array([1])));
    const audio = createShowAudio();
    audio.unlock();
    await assert.rejects(audio.load('/tie.wav'), /could not be loaded/);
    await audio.load('/tie.wav');
    assert.equal(attempts, 2);
    audio.dispose();
});

test('a reaction sound follows playback speed, ends within its visible duration and stops on pause', async t => {
    installContext(t);
    t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1])));
    t.mock.method(Context.prototype, 'decodeAudioData', function (this: Context) {
        return Promise.resolve(this.createBuffer(1, 660, 100));
    });
    const audio = createShowAudio();
    audio.unlock();
    await audio.prepare();
    const twinkle = episodeFrom('---\ntitle: Twinkle\n---\n[fx: don happy 2s, 3s]\nDON: Good.').audioCues.find(cue => cue.id === 'happy-twinkle')!;
    audio.fire(twinkle, 2);
    const source = Context.instances.at(-1)!.sources.at(-1)!;
    assert.equal(source.playbackRate.value, 2);
    assert.ok(source.stops[0] <= 1.05, 'two show seconds must fit one real second at 2x');
    audio.sync(false, true, 6500, 40000);
    assert.equal(source.stops.at(-1), 0.025);
    audio.dispose();
});

test('a recorded sfx: plays at its natural rate whatever the show speed', async t => {
    installContext(t);
    t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1])));
    t.mock.method(Context.prototype, 'decodeAudioData', function (this: Context) {
        return Promise.resolve(this.createBuffer(1, 660, 100));
    });
    const audio = createShowAudio();
    audio.unlock();
    await audio.prepare();
    const pound = episodeFrom('---\ntitle: Pound\n---\nDON: Look.\n[don: pound, sfx: desk-pound, 480ms]\nDON: Again.').audioCues.find(cue => cue.id === 'desk-pound')!;
    audio.fire(pound, 2);
    const source = Context.instances.at(-1)!.sources.at(-1)!;
    assert.equal(source.playbackRate.value, 1);
    assert.ok(Math.abs(source.stops[0] - (0.005 + 6.6 + 0.01)) < 1e-9, 'the whole recording plays');
    audio.dispose();
});

test('unlock resumes iOS interrupted contexts and ignores closed ones', t => {
    installContext(t);
    const audio = createShowAudio();
    assert.ok(audio.unlock());
    const ctx = Context.instances.at(-1)!;
    assert.equal(ctx.resumeCalls, 0);
    ctx.state = 'interrupted';
    assert.ok(audio.unlock());
    assert.equal(ctx.resumeCalls, 1);
    ctx.state = 'closed';
    assert.ok(audio.unlock());
    assert.equal(ctx.resumeCalls, 1);
    audio.dispose();
});

test('stopping before a future-scheduled cue starts holds gate gain at <= 0.0001 instead of 1', async t => {
    installContext(t);
    t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1])));
    const audio = createShowAudio(STUDIO_SOUND_BANK);
    audio.unlock();
    await audio.prepare();
    const ctx = Context.instances.at(-1)!;
    const busCount = 3; // master + any created buses excluded by checking gate gains
    void busCount;
    audio.fire({ t: 1, id: 'sting' }, 1);
    audio.fire({ t: 6000, id: 'don', voice: {
        who: 'don', delivery: 'normal', duration: 100, progress: 0, variation: 0,
        question: false, wordStart: true, phraseEnd: false, cutoff: false, interrupting: false,
    } }, 1);
    audio.fire({ t: 7000, id: 'desk-pound' }, 1);
    audio.stop();
    const heldGains = ctx.gains.filter(g => g.gain.held !== null).map(g => g.gain.held!);
    assert.ok(heldGains.length > 0);
    assert.ok(heldGains.every(v => v <= 0.0001), `expected held gains <= 0.0001, got ${heldGains}`);
    audio.dispose();
});

test('cues fired during cold async resume replay once running, unless stopped first', async t => {
    let finishResume!: () => void;
    class ColdContext extends Context {
        override state = 'suspended';
        override resume() {
            this.resumeCalls++;
            return new Promise<void>(resolve => {
                finishResume = () => { this.state = 'running'; resolve(); };
            });
        }
    }
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: ColdContext } });
    t.after(() => {
        if (previous) Object.defineProperty(globalThis, 'window', previous);
        else Reflect.deleteProperty(globalThis, 'window');
    });

    const audio = createShowAudio(CLASSIC_SOUND_BANK);
    assert.ok(audio.unlock());
    const ctx = Context.instances.at(-1)!;
    audio.fire({ t: 1, id: 'sting' }, 1);
    assert.equal(ctx.sources.length, 0, 'nothing schedules before context is running');
    finishResume();
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(ctx.sources.length > 0, 'queued cue plays once resume resolves');

    // A stop before resume completes cancels the queued cue.
    audio.stop();
    const before = ctx.sources.length;
    ctx.state = 'suspended';
    audio.unlock();
    audio.fire({ t: 1, id: 'sting' }, 1);
    audio.stop();
    finishResume();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(ctx.sources.length, before);
    audio.dispose();
});
