import type { FlashbackFrame } from './timeline';

// How the studio goes into and out of a flashback, as numbers the stylesheet draws from. The tape
// blip hits as the transition starts and fades through its first part; the studio ripples while the
// grade dissolves in (or out), strongest half way. Everything follows the transition's progress in
// show time, so it scales with playback speed and holds still when paused.

/** How strongly the studio shows a flashback on one frame, each from 0 to 1. */
export interface FlashbackLook {
    /** the sepia grade, vignette and grain */
    grade: number;
    /** the tape-rewind blip: tracking bands and a sideways tear */
    blip: number;
    /** the ripple the studio dissolves through */
    ripple: number;
    /** the transition a jump landed in, played as a cut until it ends; pass it back on the next frame */
    cut: string | null;
}

/** the share of a transition the blip lasts */
const BLIP_SHARE = 0.6;
/** the way out is a softer version of the way in */
const EXIT_STRENGTH = 0.5;

const smoothstep = (from: number, to: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - from) / (to - from)));
    return k * k * (3 - 2 * k);
};

/**
 * The look for the frame on screen. A jump (a seek, a scrub, a line skip) that lands inside a
 * transition cuts straight to the flashback look, and the rest of that transition plays as the
 * cut: `cut` names it, and the studio passes it back with every later frame.
 */
export function flashbackLook(flashback: FlashbackFrame | null, { jumped, cut }: { jumped: boolean; cut: string | null }): FlashbackLook {
    if (!flashback) return { grade: 0, blip: 0, ripple: 0, cut: null };
    const { transition } = flashback;
    if (!transition) return { grade: 1, blip: 0, ripple: 0, cut: null };
    const key = `${flashback.span}:${transition.edge}`;
    if (jumped || cut === key) return { grade: 1, blip: 0, ripple: 0, cut: key };
    const p = transition.progress;
    const strength = transition.edge === 'entry' ? 1 : EXIT_STRENGTH;
    const blip = strength * Math.pow(Math.max(0, 1 - p / BLIP_SHARE), 1.5);
    const ripple = strength * Math.sin(Math.PI * p);
    const dissolved = smoothstep(0.15, 0.85, p);
    const grade = transition.edge === 'entry' ? dissolved : 1 - dissolved;
    return { grade, blip, ripple, cut: null };
}
