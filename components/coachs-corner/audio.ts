import { CAST, DELIVERIES, type CharacterId } from '@/lib/coachs-corner/cast';
import type { AudioCue, VoiceCue } from '@/lib/coachs-corner/audio-cues';
import { INTRO_MS } from '@/lib/coachs-corner/timeline';
import { CURRENT_SOUND_BANK, STUDIO_ROOM, TIE_RUSTLE, sourceKey, type SoundBank, type SoundId } from '@/lib/coachs-corner/sound-bank';
import { robotSyllable } from '@/lib/coachs-corner/robot-voice';

export interface ShowAudio {
    unlock: () => boolean;
    prepare: () => Promise<void>;
    load: (url: string) => Promise<void>;
    forget: (url: string) => void;
    setBank: (bank: SoundBank) => void;
    fire: (cue: AudioCue, rate: number) => void;
    sync: (playing: boolean, audible: boolean, time: number, end: number) => void;
    stop: () => void;
    dispose: () => void;
}

/** One audio graph per player. No sound starts until unlock() runs in a user gesture. */
export function createShowAudio(initialBank: SoundBank = CURRENT_SOUND_BANK): ShowAudio {
    let bank = initialBank;
    let ctx: AudioContext | null = null;
    let master: GainNode | null = null;
    let noise: AudioBuffer | null = null;
    let roomNoise: AudioBuffer | null = null;
    let roomPlaying = false;
    const buses = new Map<SoundId, GainNode>();
    const buffers = new Map<string, AudioBuffer>();
    const pending = new Map<string, Promise<void>>();
    const active = new Set<{ id: SoundId; source: AudioScheduledSourceNode; gate: GainNode; stopping: boolean }>();

    const makeNoise = (seconds: number, seed: number) => {
        const c = ctx!;
        const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            seed = (seed * 16807) % 2147483647;
            data[i] = seed / 1073741823.5 - 1;
        }
        return buffer;
    };

    const unlock = () => {
        if (typeof window === 'undefined') return false;
        if (!ctx) {
            const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) return false;
            ctx = new Ctor();
            master = ctx.createGain();
            master.gain.value = 0.38;
            master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
            noise = makeNoise(1, 73);
        }
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
        return true;
    };

    const bus = (id: SoundId) => {
        if (!buses.has(id)) {
            const node = ctx!.createGain();
            node.gain.value = bank[id].gain;
            node.connect(master!);
            buses.set(id, node);
        }
        return buses.get(id)!;
    };

    const track = (id: SoundId, source: AudioScheduledSourceNode, gate: GainNode, nodes: AudioNode[] = []) => {
        const item = { id, source, gate, stopping: false };
        active.add(item);
        source.onended = () => {
            active.delete(item);
            for (const node of [source, gate, ...nodes]) node.disconnect();
        };
    };

    const stopSlot = (id?: SoundId) => {
        if (!ctx) return;
        const now = ctx.currentTime;
        for (const item of active) {
            if (id && item.id !== id) continue;
            if (item.stopping) continue;
            item.stopping = true;
            if (typeof item.gate.gain.cancelAndHoldAtTime === 'function') item.gate.gain.cancelAndHoldAtTime(now);
            else {
                const value = item.gate.gain.value;
                item.gate.gain.cancelScheduledValues(now);
                item.gate.gain.setValueAtTime(value, now);
            }
            item.gate.gain.setTargetAtTime(0, now, 0.004);
            try { item.source.stop(now + 0.025); } catch { /* source already ended */ }
        }
        if (!id || id === 'room') roomPlaying = false;
    };

    const env = (gain: GainNode, at: number, peak: number, attack: number, release: number) => {
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
    };

    const tone = (id: SoundId, freq: number, type: OscillatorType, at: number, peak: number, attack: number, release: number, filter?: number) => {
        const c = ctx!;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, at);
        const nodes: AudioNode[] = [];
        let node: AudioNode = osc;
        if (filter) {
            const lp = c.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = filter;
            osc.connect(lp);
            node = lp;
            nodes.push(lp);
        }
        node.connect(gain).connect(bus(id));
        env(gain, at, peak, attack, release);
        track(id, osc, gain, nodes);
        osc.start(at);
        osc.stop(at + attack + release + 0.05);
        return osc;
    };

    const hiss = (id: SoundId, at: number, peak: number, dur: number, band: number, q = 1.2, attack = 0.004) => {
        const c = ctx!;
        const src = c.createBufferSource();
        src.buffer = noise;
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = band;
        bp.Q.value = q;
        const gain = c.createGain();
        src.connect(bp).connect(gain).connect(bus(id));
        env(gain, at, peak, attack, dur);
        track(id, src, gain, [bp]);
        src.start(at, (Math.sin(at * 17) + 1) * 0.2);
        src.stop(at + dur + 0.05);
    };

    const classicVoice = (id: SoundId, who: CharacterId, voice: VoiceCue, rate: number, at: number) => {
        const spec = CAST[who].voice;
        const style = DELIVERIES[voice.delivery];
        const freq = (spec.base + (Math.random() * 2 - 1) * spec.spread) * style.pitch;
        const len = (voice.delivery === 'sneak' ? 0.035 : voice.delivery === 'yell' ? 0.075 : 0.055) / Math.sqrt(rate);
        const peak = 0.16 * style.volume;
        const osc = tone(id, freq, spec.wave, at, peak, 0.004, len, who === 'don' ? 1400 : 2600);
        osc.frequency.exponentialRampToValueAtTime(freq * (voice.delivery === 'yell' ? 0.82 : 0.92), at + len);
        if (spec.grit) hiss(id, at, peak * spec.grit * 0.5, len * 0.8, who === 'don' ? 900 : 2200, 2);
    };

    const robotVoice = (id: SoundId, who: CharacterId, voice: VoiceCue, rate: number, at: number) => {
        const c = ctx!;
        const syllable = robotSyllable(voice, rate, who);
        const { length, peak } = syllable;
        const osc = c.createOscillator();
        osc.type = syllable.wave;
        osc.frequency.setValueAtTime(syllable.pitch[0], at);
        osc.frequency.exponentialRampToValueAtTime(syllable.pitch[1], at + syllable.bodyAt);
        osc.frequency.exponentialRampToValueAtTime(syllable.pitch[2], at + length);
        const lowpass = c.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = syllable.brightness;
        osc.connect(lowpass);
        let node: AudioNode = lowpass;
        const filters: AudioNode[] = [lowpass];
        for (const frequency of syllable.vowels) {
            const formant = c.createBiquadFilter();
            formant.type = 'peaking';
            formant.frequency.setValueAtTime(frequency, at);
            formant.Q.value = 2.4;
            formant.gain.value = syllable.formantGain;
            node.connect(formant);
            node = formant;
            filters.push(formant);
        }
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(peak, at + syllable.attack);
        gain.gain.exponentialRampToValueAtTime(peak * syllable.body, at + syllable.bodyAt);
        gain.gain.linearRampToValueAtTime(peak * syllable.body * 0.8, at + syllable.releaseAt);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
        node.connect(gain).connect(bus(id));
        track(id, osc, gain, filters);
        osc.start(at);
        osc.stop(at + length + 0.01);
        hiss(id, at, syllable.grit, length * 0.32, syllable.gritBand, 1.4, syllable.attack);
    };

    const load = async (url: string) => {
        if (buffers.has(url)) return;
        if (pending.has(url)) return pending.get(url)!;
        if (!ctx) throw new Error('Press Play to enable audio first.');
        const c = ctx;
        const promise = (async () => {
            const response = await fetch(url);
            if (!response.ok) throw new Error('The audio file could not be loaded.');
            const buffer = await c.decodeAudioData(await response.arrayBuffer());
            if (ctx === c) buffers.set(url, buffer);
        })();
        pending.set(url, promise);
        try { await promise; } finally { if (pending.get(url) === promise) pending.delete(url); }
    };

    const fileSound = (cue: AudioCue, rate: number, at: number, loop = false, offset = 0) => {
        const source = bank[cue.id].source;
        if (!('files' in source) || !source.files.length) return false;
        const index = cue.voice?.variation ?? Math.round(cue.t);
        const buffer = buffers.get(source.files[index % source.files.length]);
        if (!buffer) return false;
        const src = ctx!.createBufferSource();
        const gain = ctx!.createGain();
        src.buffer = buffer;
        src.loop = loop;
        const style = cue.voice && DELIVERIES[cue.voice.delivery];
        src.playbackRate.value = style ? style.pitch : 1;
        const peak = style ? 0.2 * style.volume : loop ? 0.06 : 0.25;
        src.connect(gain).connect(bus(cue.id));
        let duration = 0;
        if (loop) {
            gain.gain.setValueAtTime(0, at);
            gain.gain.linearRampToValueAtTime(peak, at + STUDIO_ROOM.fadeSeconds);
        } else {
            duration = cue.voice ? Math.max(0.025, Math.min(buffer.duration / src.playbackRate.value, cue.voice.duration / 1000 / rate)) : buffer.duration;
            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.linearRampToValueAtTime(peak, at + Math.min(0.008, duration / 4));
            gain.gain.setValueAtTime(peak, at + duration * 0.7);
            gain.gain.linearRampToValueAtTime(0, at + duration);
        }
        track(cue.id, src, gain);
        src.start(at, offset % buffer.duration);
        if (!loop) src.stop(at + duration + 0.01);
        return true;
    };

    const fire = (cue: AudioCue, rate: number) => {
        if (!ctx || ctx.state !== 'running' || bank[cue.id].gain <= 0) return;
        const source = bank[cue.id].source;
        const at = ctx.currentTime + 0.005;
        if ('files' in source) { fileSound(cue, rate, at); return; }
        switch (source.synth) {
            case 'classic-don': case 'classic-ron':
                if (cue.voice) classicVoice(cue.id, source.synth === 'classic-don' ? 'don' : 'ron', cue.voice, rate, at);
                break;
            case 'robot-don': case 'robot-ron':
                if (cue.voice) robotVoice(cue.id, source.synth === 'robot-don' ? 'don' : 'ron', cue.voice, rate, at);
                break;
            case 'monitor':
                hiss(cue.id, at, 0.12, 0.03, 4200, 0.8);
                tone(cue.id, 60, 'sine', at, 0.05, 0.002, 0.12);
                break;
            case 'tie-rustle':
                for (const stroke of TIE_RUSTLE.strokes) {
                    hiss(cue.id, at + stroke.offset, TIE_RUSTLE.clothGain * stroke.gain,
                        stroke.duration, stroke.band, 0.45, stroke.attack);
                }
                break;
            case 'sting':
                [[392, 0], [523.25, 0.13], [659.25, 0.26]].forEach(([f, d]) => tone(cue.id, f, 'sawtooth', at + d, 0.12, 0.01, 0.11, 2200));
                [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(cue.id, f, 'sawtooth', at + 0.4, 0.09 - i * 0.012, 0.02, 1.1, 2600));
                hiss(cue.id, at + 0.4, 0.05, 0.5, 6000, 0.5);
                break;
            case 'horn':
                for (const f of [110, 138.6, 165]) tone(cue.id, f, 'sawtooth', at, 0.12, 0.06, 1.6, 900).detune.setValueAtTime(-8, at);
                break;
            case 'whistle': {
                const osc = tone(cue.id, 2900, 'sine', at, 0.14, 0.01, 0.45);
                const lfo = ctx.createOscillator();
                const depth = ctx.createGain();
                lfo.frequency.value = 38;
                depth.gain.value = 140;
                lfo.connect(depth).connect(osc.frequency);
                track(cue.id, lfo, depth);
                lfo.start(at);
                lfo.stop(at + 0.5);
                break;
            }
            case 'buzzer':
                tone(cue.id, 196, 'square', at, 0.1, 0.01, 0.9, 1200);
                tone(cue.id, 207, 'square', at, 0.08, 0.01, 0.9, 1200);
                break;
            case 'organ':
                [392, 523.25, 659.25, 783.99, 659.25, 783.99].forEach((f, i) =>
                    tone(cue.id, f, 'square', at + [0, 0.16, 0.32, 0.48, 0.72, 0.84][i], 0.07, 0.01, i === 5 ? 0.6 : 0.13, 1800));
                break;
            case 'thud':
                tone(cue.id, 90, 'sine', at, 0.22, 0.003, 0.22).frequency.exponentialRampToValueAtTime(42, at + 0.2);
                hiss(cue.id, at, 0.05, 0.06, 300, 0.7);
                break;
        }
    };

    const startRoom = (time: number) => {
        const c = ctx!;
        const at = c.currentTime;
        if ('files' in bank.room.source) return fileSound({ t: 0, id: 'room' }, 1, at, true, Math.max(0, time - INTRO_MS + 400) / 1000);
        if (bank.room.source.synth !== 'studio-room') return false;
        roomNoise ??= makeNoise(11, 157);
        const src = c.createBufferSource();
        src.buffer = roomNoise;
        src.loop = true;
        const hp = c.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = STUDIO_ROOM.highpass;
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = STUDIO_ROOM.lowpass;
        const gain = c.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(STUDIO_ROOM.noiseGain, at + STUDIO_ROOM.fadeSeconds);
        src.connect(hp).connect(lp).connect(gain).connect(bus('room'));
        track('room', src, gain, [hp, lp]);
        src.start(at, Math.max(0, time - INTRO_MS + 400) / 1000 % roomNoise.duration);
        const hum = c.createOscillator();
        const humGain = c.createGain();
        hum.frequency.value = 120;
        humGain.gain.setValueAtTime(0, at);
        humGain.gain.linearRampToValueAtTime(STUDIO_ROOM.humGain, at + STUDIO_ROOM.fadeSeconds);
        hum.connect(humGain).connect(bus('room'));
        track('room', hum, humGain);
        hum.start(at);
        return true;
    };

    return {
        unlock, load,
        prepare: async () => {
            const urls = Object.values(bank).flatMap(slot => 'files' in slot.source ? [...slot.source.files] : []);
            await Promise.all(Array.from(new Set(urls)).map(load));
        },
        forget: url => { buffers.delete(url); },
        setBank: next => {
            for (const id of Object.keys(next) as SoundId[]) {
                if (sourceKey(bank[id].source) !== sourceKey(next[id].source)) stopSlot(id);
                if (ctx) buses.get(id)?.gain.setTargetAtTime(Math.max(0, next[id].gain), ctx.currentTime, 0.02);
                if (next[id].gain === 0 && bank[id].gain !== 0) stopSlot(id);
            }
            bank = next;
        },
        fire,
        sync: (playing, audible, time, end) => {
            if (!playing || !audible) { if (active.size) stopSlot(); return; }
            const wantsRoom = time >= INTRO_MS - 400 && time < end && bank.room.gain > 0;
            if (!wantsRoom && roomPlaying) stopSlot('room');
            if (wantsRoom && !roomPlaying && ctx?.state === 'running') roomPlaying = startRoom(time);
        },
        stop: () => stopSlot(),
        dispose: () => {
            stopSlot();
            if (ctx) void ctx.close();
            ctx = null; master = null; noise = null; roomNoise = null;
            active.clear(); buses.clear(); buffers.clear(); pending.clear();
        },
    };
}
