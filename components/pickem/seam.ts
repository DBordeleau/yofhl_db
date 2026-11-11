// The seam of an open week's strip: where the two clubs' slabs meet, as the away side's share of the strip (0 to 1).
// It rides a spring, so a hover leans it toward a club and a pick drives it across with a little overshoot. It is
// written to the strip as --split, which the two sides' flex-grow read; one animation frame loop serves every strip and
// stops once they all settle.
//
// A strip may also hold a share for its names to wrap at (holdSeam): written as --hold-away and --hold-home, the share
// each side's name is laid out for. A side giving way takes its new share at once; a side growing keeps its old one
// until the seam first reaches the new share, so a name reflows once per pick, never on every bounce of the spring.

const STIFFNESS = 300;
const DAMPING = 16;
const REST = .0004;

interface Spring { x: number; v: number; target: number; hold?: { target: number; away: number; home: number } }

const springs = new Map<HTMLElement, Spring>();
let frame = 0;
let last = 0;

const paint = (strip: HTMLElement, x: number) => strip.style.setProperty('--split', x.toFixed(4));
const paintHold = (strip: HTMLElement, hold: NonNullable<Spring['hold']>) => {
    strip.style.setProperty('--hold-away', hold.away.toFixed(4));
    strip.style.setProperty('--hold-home', (1 - hold.home).toFixed(4));
};
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** a growing side takes its held share once the seam has reached it */
function catchUp(strip: HTMLElement, spring: Spring, settled: boolean) {
    const hold = spring.hold;
    if (!hold || (hold.away === hold.target && hold.home === hold.target)) return;
    if (settled || spring.x >= hold.target - REST) hold.away = Math.max(hold.away, hold.target);
    if (settled || spring.x <= hold.target + REST) hold.home = Math.min(hold.home, hold.target);
    if (settled) { hold.away = hold.target; hold.home = hold.target; }
    paintHold(strip, hold);
}

function step(now: number) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    let moving = false;
    for (const [strip, spring] of springs) {
        spring.v += (STIFFNESS * (spring.target - spring.x) - DAMPING * spring.v) * dt;
        spring.x += spring.v * dt;
        const settled = !(Math.abs(spring.v) > REST || Math.abs(spring.target - spring.x) > REST);
        if (settled) { spring.x = spring.target; spring.v = 0; } else moving = true;
        paint(strip, spring.x);
        catchUp(strip, spring, settled);
    }
    frame = moving ? requestAnimationFrame(step) : 0;
}

/** Start following a strip's seam, resting at the middle; a strip already followed keeps where it is */
export function trackSeam(strip: HTMLElement) {
    if (!springs.has(strip)) springs.set(strip, { x: .5, v: 0, target: .5 });
    const spring = springs.get(strip)!;
    paint(strip, spring.x);
    if (spring.hold) paintHold(strip, spring.hold);
}

export function untrackSeam(strip: HTMLElement) {
    springs.delete(strip);
}

/** Send a strip's seam toward a share; with reduced motion it jumps there */
export function aimSeam(strip: HTMLElement, target: number) {
    const spring = springs.get(strip);
    if (!spring || spring.target === target) return;
    spring.target = target;
    if (reduced()) { spring.x = target; spring.v = 0; paint(strip, target); catchUp(strip, spring, true); return; }
    if (!frame) { last = performance.now(); frame = requestAnimationFrame(step); }
}

/** Puts a strip's seam straight at a share, its names laid out for it, with no spring: for a strip not yet on screen */
export function placeSeam(strip: HTMLElement, share: number) {
    const spring = springs.get(strip);
    if (!spring) return;
    Object.assign(spring, { x: share, v: 0, target: share, hold: { target: share, away: share, home: share } });
    paint(strip, share);
    paintHold(strip, spring.hold!);
}

/** The share a strip's names are laid out for: the seam's resting place for the pick, leaving hovers out */
export function holdSeam(strip: HTMLElement, share: number) {
    const spring = springs.get(strip);
    if (!spring) return;
    if (!spring.hold) { spring.hold = { target: share, away: share, home: share }; paintHold(strip, spring.hold); return; }
    const hold = spring.hold;
    if (hold.target === share) return;
    hold.target = share;
    // the side giving way takes its new share at once
    hold.away = Math.min(hold.away, share);
    hold.home = Math.max(hold.home, share);
    catchUp(strip, spring, reduced() || (spring.v === 0 && spring.x === spring.target && spring.x === share));
    paintHold(strip, hold);
}
