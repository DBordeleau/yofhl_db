// The seam of an open week's strip: where the two clubs' slabs meet, as the away side's share of the strip (0 to 1).
// It rides a spring, so a hover leans it toward a club and a pick drives it across with a little overshoot. It is
// written to the strip as --split, which the two sides' flex-grow read; one animation frame loop serves every strip and
// stops once they all settle.

const STIFFNESS = 300;
const DAMPING = 16;
const REST = .0004;

interface Spring { x: number; v: number; target: number }

const springs = new Map<HTMLElement, Spring>();
let frame = 0;
let last = 0;

const paint = (strip: HTMLElement, x: number) => strip.style.setProperty('--split', x.toFixed(4));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function step(now: number) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    let moving = false;
    for (const [strip, spring] of springs) {
        spring.v += (STIFFNESS * (spring.target - spring.x) - DAMPING * spring.v) * dt;
        spring.x += spring.v * dt;
        if (Math.abs(spring.v) > REST || Math.abs(spring.target - spring.x) > REST) moving = true;
        else { spring.x = spring.target; spring.v = 0; }
        paint(strip, spring.x);
    }
    frame = moving ? requestAnimationFrame(step) : 0;
}

/** Start following a strip's seam, resting at the middle */
export function trackSeam(strip: HTMLElement) {
    if (!springs.has(strip)) springs.set(strip, { x: .5, v: 0, target: .5 });
    paint(strip, springs.get(strip)!.x);
}

export function untrackSeam(strip: HTMLElement) {
    springs.delete(strip);
}

/** Send a strip's seam toward a share; with reduced motion it jumps there */
export function aimSeam(strip: HTMLElement, target: number) {
    const spring = springs.get(strip);
    if (!spring || spring.target === target) return;
    spring.target = target;
    if (reduced()) { spring.x = target; spring.v = 0; paint(strip, target); return; }
    if (!frame) { last = performance.now(); frame = requestAnimationFrame(step); }
}
