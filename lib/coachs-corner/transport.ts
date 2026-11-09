import type { AudioCue } from './audio-cues';
import type { Timeline } from './timeline';

// The one clock behind a Coach's Corner episode. The caller passes real time (an animation-frame
// timestamp) in; show time, phase and everything that has to stay in step with it come out.
// No React and no DOM: the show hook applies each output to the audio graph, theme and bumper.

/** The bumper and theme run this long; the segment's first line starts here. */
export const INTRO_MS = 6000;
/** The gap between the last line and the end card. */
export const END_CARD_DELAY_MS = 400;
/** After a stall, only cues from this much real time before the playhead still fire. */
const BACKLOG_MS = 120;

export type Phase = 'intro' | 'segment' | 'end';

export const phaseAt = (t: number, showEnd: number): Phase =>
    t < INTRO_MS ? 'intro' : t >= showEnd + END_CARD_DELAY_MS ? 'end' : 'segment';

/** A stalled/background tab must not replay a backlog of syllables all at once. Cues fire in (from, to]. */
export const audioCuesBetween = (cues: AudioCue[], from: number, to: number, rate: number) => {
    const start = Math.max(from, to - BACKLOG_MS * rate);
    let lo = 0, hi = cues.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cues[mid].t <= start) lo = mid + 1; else hi = mid; }
    const out: AudioCue[] = [];
    for (let i = lo; i < cues.length && cues[i].t <= to; i++) out.push(cues[i]);
    return out;
};

/** Start the theme from a show time, stop it, or leave it as it is. */
export type ThemeCommand = { play: number } | 'pause' | null;

export interface BumperState {
    /** show time the bumper's animations start from, applied as a negative delay */
    offset: number;
    paused: boolean;
    /** changes whenever the bumper must remount and restart from its offset */
    mount: number;
}

export interface TransportOutput {
    time: number;
    phase: Phase;
    playing: boolean;
    /** how fast show time is moving against real time right now: 1 in the intro */
    rate: number;
    /** audio cues passed since the previous output */
    cues: AudioCue[];
    theme: ThemeCommand;
    /** null outside the intro */
    bumper: BumperState | null;
    ended: boolean;
    /** Show time moved without playing through: a seek, or play at the end restarting from the top. */
    jumped: boolean;
}

export interface Transport {
    tick: (now: number) => TransportOutput;
    play: (now: number) => TransportOutput;
    pause: () => TransportOutput;
    seek: (time: number) => TransportOutput;
    setSpeed: (speed: number) => TransportOutput;
}

// Shared by every transport, so a recompiled script's new transport never reuses a mount id.
let mounts = 0;

export function createTransport(tl: Timeline, cues: AudioCue[], { time: startAt = 0, speed: startSpeed = 1 } = {}): Transport {
    let time = Math.max(0, Math.min(tl.duration, startAt));
    let speed = startSpeed;
    let playing = false;
    let last = 0;
    // The bumper stays mounted through pauses; seeks and fresh starts remount it at the playhead.
    let mounted = false;
    let mount = 0;
    let offset = 0;

    const remount = () => { mounted = true; mount = ++mounts; offset = time; };
    const rateAt = (t: number) => t < INTRO_MS ? 1 : speed;
    const output = (theme: ThemeCommand = null, fired: AudioCue[] = [], jumped = false): TransportOutput => ({
        time, phase: phaseAt(time, tl.showEnd), playing, rate: rateAt(time), cues: fired, theme,
        bumper: time < INTRO_MS && mounted ? { offset, paused: !playing, mount } : null,
        ended: time >= tl.duration,
        jumped,
    });

    // The intro always plays at 1×; speed applies to the segment only. The theme is a recording and
    // the bumper is wall-clock CSS, so neither can follow a faster show clock without cutting out.
    // A tick that crosses into the segment spends its intro share at 1× and the rest at speed.
    const advance = (from: number, elapsed: number) => {
        const atOne = Math.min(elapsed, Math.max(0, INTRO_MS - from));
        return Math.min(tl.duration, from + atOne + (elapsed - atOne) * speed);
    };

    return {
        tick: now => {
            if (!playing) return output();
            const from = time;
            time = advance(time, Math.max(0, now - last));
            last = now;
            const fired = audioCuesBetween(cues, from, time, rateAt(time));
            if (time >= tl.duration) playing = false;
            if (from < INTRO_MS && time >= INTRO_MS) { mounted = false; return output('pause', fired); }
            return output(null, fired);
        },
        play: now => {
            const restart = time >= tl.duration;
            if (restart) { time = 0; mounted = false; }
            playing = true;
            last = now;
            if (time >= INTRO_MS) return output();
            if (!mounted) remount();
            return output({ play: time }, [], restart);
        },
        pause: () => {
            playing = false;
            return output('pause');
        },
        seek: t => {
            time = Math.max(0, Math.min(tl.duration, t));
            if (time >= INTRO_MS) { mounted = false; return output('pause', [], true); }
            remount();
            return output(playing ? { play: time } : 'pause', [], true);
        },
        setSpeed: s => { speed = s; return output(); },
    };
}
