import { CAST, CHARACTERS, DELIVERIES, gestureAfter, type CharacterId, type Delivery, type Motion, type Shot, type Sound } from './cast';
import type { Cue, Graphic, Meta, Script, Span } from './script';

// Compiles a parsed script into an absolute-time timeline, then answers "what does the studio look
// like at time t?" as a pure function. Playback, seeking, scrubbing and the admin preview all read
// the same frames, so a show always plays identically.

// the intro theme runs 5.9 s
export const INTRO_MS = 6000;
const OUTRO_MS = 1800;
const LINE_GAP_MS = 180;
const MIN_SYLLABLE_MS = 80;
const MOUTH_OPEN_SHARE = 0.58;

export interface Piece { text: string; delivery: Delivery }

export interface Word {
    /** whitespace before the word, kept so captions read exactly as written */
    space: string;
    pieces: Piece[];
    /** reveal time */
    t: number;
    /** time spent speaking it, before any pause */
    dur: number;
    /** silence after it, from its punctuation */
    pause: number;
    delivery: Delivery;
}

export interface Line {
    index: number;
    sourceLine: number;
    speaker: CharacterId;
    t0: number;
    /** last word finished */
    t1: number;
    /** next event may begin */
    end: number;
    /** ends on a dash: someone cuts in, or the speaker abandons the thought */
    cutoff: boolean;
    words: Word[];
    text: string;
}

interface Key<T> { t: number; value: T }

export interface Timeline {
    meta: Meta;
    duration: number;
    /** when the last line ends; the end card follows */
    showEnd: number;
    segment: number;
    lines: Line[];
    gestures: Record<CharacterId, Key<string>[]>;
    flaps: Record<CharacterId, [number, number][]>;
    voice: Record<CharacterId, { t0: number; t1: number; delivery: Delivery }[]>;
    monitor: Key<Graphic>[];
    shots: Key<Shot>[];
    sounds: Key<Sound>[];
    /** yell onsets: the camera punches in and the listener flinches */
    punches: { t: number; who: CharacterId }[];
    clears: number[];
    /** every distinct artwork the show uses, for preloading */
    art: string[];
}

const PUNCTUATION_MS: Record<string, number> = { ',': 110, ';': 170, ':': 170, '.': 245, '!': 245, '?': 280, '…': 470, '—': 135 };

const syllables = (word: string) => {
    const w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!w) return 1;
    if (/^\d+$/.test(w)) return Math.min(4, w.length);
    const groups = w.replace(/e$/, '').match(/[aeiouy]+/g);
    return Math.max(1, Math.min(6, groups?.length ?? 1));
};

const trailingMark = (text: string) => {
    const bare = text.replace(/[”’"')\]]+$/, '');
    return bare.slice(-1);
};

const endsCut = (text: string) => /[—]\s*[”’"]?\s*$/.test(text);

export function compile(script: Script): Timeline {
    const { meta, events } = script;
    const gestures = Object.fromEntries(CHARACTERS.map(c => [c, [] as Key<string>[]])) as Timeline['gestures'];
    const flaps = Object.fromEntries(CHARACTERS.map(c => [c, [] as [number, number][]])) as Timeline['flaps'];
    const voice = Object.fromEntries(CHARACTERS.map(c => [c, [] as Timeline['voice'][CharacterId]])) as Timeline['voice'];
    const monitor: Key<Graphic>[] = [];
    const shots: Key<Shot>[] = [{ t: 0, value: 'auto' }];
    const sounds: Key<Sound>[] = [];
    const punches: Timeline['punches'] = [];
    const clears: number[] = [];
    const lines: Line[] = [];
    const rest = Object.fromEntries(CHARACTERS.map(c => [c, 'rest'])) as Record<CharacterId, string>;
    const setGesture = (who: CharacterId, gesture: string, t: number) => {
        const track = gestures[who];
        if (track.length && track[track.length - 1].t === t) track[track.length - 1].value = gesture;
        else if (track[track.length - 1]?.value !== gesture) track.push({ t, value: gesture });
    };

    // cues ahead of the first line set the opening picture
    let first = events.findIndex(e => e.kind === 'line' || e.cues.some(c => c.type === 'pause'));
    if (first < 0) first = events.length;
    let monitorSet = false;
    for (const e of events.slice(0, first)) {
        if (e.kind !== 'stage') continue;
        for (const cue of e.cues) {
            if (cue.type === 'pose') rest[cue.who] = cue.gesture;
            else if (cue.type === 'monitor') { monitor.push({ t: 0, value: cue.graphic }); monitorSet = true; }
            else if (cue.type === 'cam') shots.push({ t: 0, value: cue.shot });
        }
    }
    if (!monitorSet) monitor.push({ t: 0, value: { type: 'title', title: meta.title, sub: meta.week ? `Week ${meta.week}` : undefined } });
    for (const c of CHARACTERS) setGesture(c, rest[c], 0);

    let t = INTRO_MS;
    const applyCue = (cue: Cue, speaker?: CharacterId): string | undefined => {
        switch (cue.type) {
            case 'pause': t += cue.ms; break;
            case 'pose':
                if (cue.who === speaker) return cue.gesture;
                rest[cue.who] = cue.gesture;
                setGesture(cue.who, cue.gesture, t);
                break;
            case 'cam': shots.push({ t, value: cue.shot }); break;
            case 'sfx': sounds.push({ t, value: cue.sound }); break;
            case 'monitor': monitor.push({ t, value: cue.graphic }); break;
            case 'clear': clears.push(t); break;
        }
        return undefined;
    };

    for (const event of events.slice(first)) {
        if (event.kind === 'stage') {
            for (const cue of event.cues) applyCue(cue);
            continue;
        }

        const who = event.speaker;
        const t0 = t;
        const words: Word[] = [];
        let inlineGesture: string | undefined;
        let lastGesture = rest[who];
        let pendingSpace = '';
        let lastDelivery: Delivery | null = null;

        const speak = (text: string, span: Span) => {
            const delivery = span.delivery ?? event.style.delivery ?? 'normal';
            const style = DELIVERIES[delivery];
            const rate = span.wpm ?? event.style.wpm ?? meta.pace * style.speed * (span.speed ?? 1) * (event.style.speed ?? 1);
            const slot = 60000 / rate;
            const gesture = span.gesture ?? inlineGesture ?? event.style.gesture ?? CAST[who].deliveryGestures[delivery] ?? 'rest';

            for (const token of text.split(/(\s+)/)) {
                if (!token) continue;
                if (/^\s+$/.test(token)) { pendingSpace = ' '; continue; }
                // punctuation glued to the previous span (!!NOW!!,) joins that word
                const prev = words[words.length - 1];
                if (!pendingSpace && prev) {
                    prev.pieces.push({ text: token, delivery });
                    const extra = PUNCTUATION_MS[trailingMark(token)] ?? 0;
                    if (extra > prev.pause) { t += extra - prev.pause; prev.pause = extra; }
                    continue;
                }
                if (delivery === 'yell' && lastDelivery !== 'yell') {
                    punches.push({ t, who });
                }
                lastDelivery = delivery;
                if (gesture !== lastGesture || !gestures[who].length) setGesture(who, gesture, t);
                lastGesture = gesture;

                const n = syllables(token);
                const weight = Math.min(2.4, Math.max(0.6, 0.45 + 0.55 * (n / 1.45)));
                const dur = slot * weight;
                const pauseScale = delivery === 'sneak' ? 0.45 : delivery === 'yell' ? 0.8 : 1;
                const pause = (PUNCTUATION_MS[trailingMark(token)] ?? 0) * pauseScale;
                const word: Word = { space: words.length ? pendingSpace : '', pieces: [{ text: token, delivery }], t, dur, pause, delivery };
                words.push(word);
                pendingSpace = '';

                // mouth flaps, one per syllable
                const flapsN = Math.max(1, Math.min(n, Math.floor(dur / MIN_SYLLABLE_MS)));
                const each = dur / flapsN;
                for (let k = 0; k < flapsN; k++) flaps[who].push([t + k * each, t + k * each + each * MOUTH_OPEN_SHARE]);
                voice[who].push({ t0: t, t1: t + dur, delivery });

                t += dur + pause;
            }
        };

        for (const part of event.parts) {
            if (part.kind === 'text') speak(part.text, part.style);
            else {
                const g = applyCue(part.cue, who);
                if (g) { inlineGesture = g; if (g !== lastGesture) { setGesture(who, g, t); lastGesture = g; } }
            }
        }

        const text = words.map(w => w.space + w.pieces.map(p => p.text).join('')).join('');
        const cutoff = endsCut(text);
        const lastWord = words[words.length - 1] as Word | undefined;
        // the closing punctuation pause becomes the gap before the next line
        if (lastWord?.pause) t -= lastWord.pause;
        const t1 = t;
        const after = event.after ?? gestureAfter(who, lastGesture);
        setGesture(who, after, t1);
        rest[who] = after;
        const end = cutoff ? t1 : t1 + Math.max(LINE_GAP_MS, lastWord?.pause ?? 0);
        t = end;

        // merge voice runs split only by short pauses so the body keeps moving through a sentence
        const runs = voice[who];
        for (let k = runs.length - 1; k > 0; k--) {
            const a = runs[k - 1], b = runs[k];
            if (a.t1 < t0) break;
            if (b.t0 - a.t1 < 220 && a.delivery === b.delivery) { a.t1 = b.t1; runs.splice(k, 1); }
        }
        lines.push({ index: lines.length, sourceLine: event.line, speaker: who, t0, t1, end, cutoff, words, text });
    }

    const showEnd = t;
    const art = new Set<string>();
    for (const c of CHARACTERS) for (const key of gestures[c]) {
        const g = CAST[c].gestures[key.value];
        if (g?.closed) art.add(g.closed);
        if (g?.open) art.add(g.open);
    }
    return {
        meta, duration: showEnd + OUTRO_MS, showEnd, segment: meta.segment ?? showEnd - INTRO_MS,
        lines, gestures, flaps, voice, monitor, shots, sounds, punches, clears, art: Array.from(art),
    };
}

// ---------- reading a frame ----------

/** index of the last item with time ≤ t, or -1 */
const lastAt = <T>(items: T[], t: number, time: (item: T) => number) => {
    let lo = 0, hi = items.length - 1, found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (time(items[mid]) <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found;
};

export interface HostFrame {
    gesture: string;
    open: boolean;
    /** body motion while words are coming out */
    motion: Motion | null;
    delivery: Delivery | null;
    /** recoiling from the other host's yell */
    flinch: boolean;
}

export interface CaptionFrame {
    line: number;
    shown: number;
    active: boolean;
    /** this line was cut off and the next one has started */
    knocked: boolean;
}

export interface Frame {
    phase: 'intro' | 'show' | 'end';
    hosts: Record<CharacterId, HostFrame>;
    captions: Record<CharacterId, CaptionFrame | null>;
    monitor: number;
    shot: Shot;
    /** most recent yell onset within the last second */
    punch: { who: CharacterId; index: number } | null;
    line: number;
    /** ms left in the segment; negative in overtime */
    clock: number;
}

export function frameAt(tl: Timeline, t: number): Frame {
    const phase = t < INTRO_MS ? 'intro' : t >= tl.showEnd + 400 ? 'end' : 'show';
    const line = lastAt(tl.lines, t, l => l.t0);
    const lastClear = tl.clears.length ? tl.clears[lastAt(tl.clears, t, x => x)] ?? -1 : -1;
    const punchIndex = lastAt(tl.punches, t, p => p.t);
    const punch = punchIndex >= 0 && t - tl.punches[punchIndex].t < 900 ? { who: tl.punches[punchIndex].who, index: punchIndex } : null;

    const hosts = {} as Frame['hosts'];
    const captions = {} as Frame['captions'];
    for (const who of CHARACTERS) {
        const g = tl.gestures[who];
        const gesture = g[Math.max(0, lastAt(g, t, k => k.t))]?.value ?? 'rest';
        const f = tl.flaps[who];
        const fi = lastAt(f, t, x => x[0]);
        const open = fi >= 0 && t < f[fi][1];
        const v = tl.voice[who];
        const vi = lastAt(v, t, x => x.t0);
        const speaking = vi >= 0 && t < v[vi].t1 ? v[vi] : null;
        hosts[who] = {
            gesture, open,
            motion: speaking ? DELIVERIES[speaking.delivery].motion : null,
            delivery: speaking?.delivery ?? null,
            flinch: !!punch && punch.who !== who && t - tl.punches[punch.index].t < 520,
        };

        // each host keeps their latest line on screen until they speak again or a clear
        let ci = line;
        while (ci >= 0 && tl.lines[ci].speaker !== who) ci--;
        const l = ci >= 0 ? tl.lines[ci] : null;
        if (!l || l.t0 < lastClear) { captions[who] = null; continue; }
        const shown = lastAt(l.words, t, w => w.t) + 1;
        captions[who] = { line: ci, shown, active: ci === line, knocked: l.cutoff && line > ci };
    }

    const shotKey = tl.shots[lastAt(tl.shots, t, k => k.t)]?.value ?? 'auto';
    let shot: Shot = shotKey;
    if (shotKey === 'auto') {
        shot = 'wide';
        for (const who of CHARACTERS) if (hosts[who].gesture === 'lean' && line >= 0 && tl.lines[line].speaker === who) shot = `close ${who}` as Shot;
    }

    return {
        phase, hosts, captions,
        monitor: Math.max(0, lastAt(tl.monitor, t, k => k.t)),
        shot, punch, line,
        clock: tl.segment - Math.max(0, Math.min(t, tl.showEnd) - INTRO_MS),
    };
}

/** sounds and flaps that fire in (from, to], for audio */
export const firedBetween = <T>(items: T[], from: number, to: number, time: (item: T) => number) => {
    const out: T[] = [];
    let i = lastAt(items, from, time) + 1;
    for (; i < items.length && time(items[i]) <= to; i++) out.push(items[i]);
    return out;
};

export const lineAtTime = (tl: Timeline, t: number) => lastAt(tl.lines, t, l => l.t0);
