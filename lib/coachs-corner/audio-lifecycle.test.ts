import { mediaUrl } from './media';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createShowAudio } from '../../components/coachs-corner/audio';
import { CLASSIC_SOUND_BANK, STUDIO_SOUND_BANK } from './sound-bank';

// Control the clock and source lifetime to exercise rapid transport/mix changes.
class Param {
    value = 0;
    setValueAtTime(v: number) { this.value = v; }
    exponentialRampToValueAtTime(v: number) { this.value = v; }
    linearRampToValueAtTime(v: number) { this.value = v; }
    setTargetAtTime(v: number) { this.value = v; }
    cancelScheduledValues() {}
}
class Node {
    gain = new Param(); frequency = new Param(); detune = new Param(); Q = new Param(); playbackRate = new Param();
    loop = false;
    stops: number[] = [];
    starts: number[] = [];
    onended?: () => void;
    connect<T>(target: T) { return target; }
    disconnect() {}
    start(t: number) { this.starts.push(t); }
    stop(t: number) { this.stops.push(t); }
}
class Context {
    static instances: Context[] = [];
    currentTime = 0; sampleRate = 100; state = 'running'; destination = new Node();
    sources: Node[] = [];
    constructor() { Context.instances.push(this); }
    createGain() { return new Node(); }
    createDynamicsCompressor() { return new Node(); }
    createBiquadFilter() { return new Node(); }
    createOscillator() { const n = new Node(); this.sources.push(n); return n; }
    createBufferSource() { return this.createOscillator(); }
    createBuffer(_channels: number, length: number, sampleRate: number) { return { duration: length / sampleRate, getChannelData: () => new Float32Array(length) }; }
    resume() { return Promise.resolve(); }
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
    assert.deepEqual(fetch.mock.calls.map(call => call.arguments[0]).sort(), [mediaUrl('/coachs-corner/audio/tie-cloth-7.wav'), '/voice.wav']);
    audio.fire({ t: 6000, id: 'don', voice: { who: 'don', delivery: 'normal', duration: 100, progress: 0, variation: 0, question: false,
        wordStart: true, phraseEnd: false, cutoff: false, interrupting: false } }, 1);
    const ctx = Context.instances.at(-1)!;
    assert.equal(ctx.sources.length, 1);
    assert.ok(ctx.sources[0].stops[0] < 0.2);
    audio.stop();
    assert.equal(ctx.sources[0].stops.at(-1), 0.025);
    audio.dispose();
});

test('the default episode mix loads the approved cloth sample once and plays it for a tie cue', async t => {
    installContext(t);
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1])));
    const audio = createShowAudio();
    audio.unlock();
    await Promise.all([audio.prepare(), audio.prepare()]);
    assert.deepEqual(fetch.mock.calls.map(call => call.arguments[0]), [mediaUrl('/coachs-corner/audio/tie-cloth-7.wav')]);
    const ctx = Context.instances.at(-1)!;
    audio.fire({ t: 31000, id: 'tie' }, 1);
    assert.equal(ctx.sources.length, 1);
    assert.equal(ctx.sources[0].starts.length, 1);
    audio.sync(true, true, 6000, 40000);
    assert.equal(ctx.sources.length, 3, 'the default mix also starts studio ambience');
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
