import type { CharacterId, Reaction } from './cast';
import type { ReactionFrame } from './timeline';

// Particle frames are pure functions of show time and fixed seeds: pausing or seeking never
// restarts them. Coordinates are in the 1254-unit host artwork; both heads sit near HEAD.

export type ParticleKind = 'daisy' | 'sparkle' | 'glint' | 'ray' | 'drop';
export interface Particle {
    id: number;
    kind: ParticleKind;
    x: number;
    y: number;
    /** radius in artwork units */
    size: number;
    rotation: number;
    scale: number;
    opacity: number;
    colour: string;
}

const HEAD = { x: 640, y: 335, rx: 350, ry: 335 };
const rad = (deg: number) => deg * Math.PI / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutBack = (u: number) => 1 + 2.4 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2);
/** deterministic 0–1 noise for particle n, channel c */
const hash = (n: number, c: number) => {
    const s = Math.sin(n * 127.1 + c * 311.7) * 43758.5453;
    return s - Math.floor(s);
};

// ---------- happy: a steady stream of daisies and sparkles rising off his shoulders ----------

const EMIT_EVERY = 120;
const LIFE_MIN = 1500, LIFE_SPAN = 600;
const BURST = 6;
const SPARKLE_COLOURS = ['#ffe07a', '#ffc4e1'];

function happyParticles({ elapsed, duration }: ReactionFrame): Particle[] {
    const out: Particle[] = [];
    const ending = clamp01((duration - elapsed) / 320);
    // stop seeding just before the beat ends so nothing is born only to be cut off
    const lastBirth = Math.max(0, duration - 420);
    const first = Math.max(0, Math.floor((elapsed - LIFE_MIN - LIFE_SPAN) / EMIT_EVERY));
    const last = Math.floor(Math.min(elapsed, lastBirth) / EMIT_EVERY);
    // a small opening burst, then one particle every EMIT_EVERY ms
    const ids = [...Array.from({ length: elapsed < LIFE_MIN + LIFE_SPAN ? BURST : 0 }, (_, i) => -1 - i)];
    for (let k = first; k <= last; k++) ids.push(k);
    for (const k of ids) {
        const burst = k < 0;
        const born = burst ? 0 : k * EMIT_EVERY;
        const life = LIFE_MIN + hash(k, 1) * LIFE_SPAN * (burst ? 0.5 : 1);
        const age = elapsed - born;
        if (age < 0 || age >= life) continue;
        const u = age / life;
        // Most leave the open side of the frame. The few on the monitor side stay low, between
        // the screen and the desk. Every one stays clear of the face and the speech plate above.
        const left = burst ? k % 3 !== 0 : hash(k, 2) < 0.66;
        // golden-ratio steps spread consecutive births evenly instead of letting them clump
        const spread = (((k * 0.618034 + hash(k, 3) * 0.12) % 1) + 1) % 1;
        const a = rad(left ? 148 + spread * 72 : 350 + spread * 32);
        const reach = 1 + hash(k, 4) * 0.12;
        const travel = (burst ? 170 : left ? 70 + hash(k, 5) * 140 : 55 + hash(k, 5) * 60) * (1 - Math.pow(1 - u, 2));
        const rise = (left ? 30 + hash(k, 6) * 45 : 8 + hash(k, 6) * 18) * u;
        const sway = Math.sin(age / 260 + k) * 9 * u;
        const roll = hash(k, 7);
        const kind: ParticleKind = roll < 0.38 ? 'daisy' : roll < 0.78 ? 'sparkle' : 'glint';
        const pop = u < 0.16 ? easeOutBack(u / 0.16) : 1;
        const twinkle = kind === 'sparkle' ? 1 + 0.16 * Math.sin(age / 85 + k) : 1;
        const fadeOut = u > 0.62 ? 1 - (u - 0.62) / 0.38 : 1;
        const spin = (left ? -1 : 1) * (kind === 'daisy' ? 50 : 14);
        out.push({
            id: k,
            kind,
            x: HEAD.x + Math.cos(a) * (HEAD.rx * reach + travel) + sway,
            y: HEAD.y + Math.sin(a) * (HEAD.ry * reach + travel * 0.4) - rise,
            size: kind === 'daisy' ? 36 + hash(k, 8) * 10 : kind === 'sparkle' ? 30 + hash(k, 8) * 16 : 11 + hash(k, 8) * 6,
            rotation: hash(k, 9) * 40 - 20 + spin * age / 1000,
            scale: Math.max(0, pop * twinkle),
            opacity: clamp01(fadeOut * ending),
            colour: kind === 'sparkle' ? SPARKLE_COLOURS[k & 1] : kind === 'daisy' ? '#fffaf0' : '#fff6d8',
        });
    }
    return out;
}

// ---------- shocked: emanata burst out from the head with a couple of sweat drops ----------

// the monitor-side rays are shorter and tilted away from the screen's edge
const RAYS = [
    { angle: 186, length: 96 }, { angle: 207, length: 126 }, { angle: 229, length: 96 },
    { angle: 300, length: 88 }, { angle: 321, length: 108 }, { angle: 350, length: 88 },
];
const DROPS = [
    { x: 340, y: 215, size: 46, delay: 90 },
    { x: 935, y: 295, size: 34, delay: 170 },
];

function shockedParticles({ elapsed, duration }: ReactionFrame): Particle[] {
    const ending = clamp01((duration - elapsed) / 200);
    const rays = RAYS.map((r, i): Particle => {
        const u = clamp01(elapsed / 140);
        // shoot out from the hairline, overshoot, then tremble while it settles
        const a = rad(r.angle);
        const settle = Math.max(0, 1 - elapsed / 520);
        const tremble = Math.sin(elapsed / 18 + i * 2.1) * 4 * settle;
        const out = 290 + 56 * easeOutBack(u) + r.length / 2;
        return {
            id: i, kind: 'ray',
            x: HEAD.x + Math.cos(a) * out - Math.sin(a) * tremble,
            y: HEAD.y + Math.sin(a) * out * 0.96 + Math.cos(a) * tremble,
            size: r.length, rotation: r.angle,
            scale: Math.max(0, easeOutBack(u)),
            opacity: clamp01(elapsed / 40) * ending,
            colour: '#f6f8ff',
        };
    });
    const drops = DROPS.map((d, i): Particle => {
        const u = clamp01((elapsed - d.delay) / 160);
        const slide = Math.pow(clamp01((elapsed - d.delay) / 900), 1.6) * 38;
        return {
            id: RAYS.length + i, kind: 'drop',
            x: d.x, y: d.y + slide,
            size: d.size, rotation: i ? 8 : -10,
            scale: Math.max(0, easeOutBack(u)),
            opacity: clamp01(u * 3) * ending,
            colour: '#8fdcff',
        };
    });
    return [...rays, ...drops];
}

/** Ron sits on the other side of the monitor, so his marks mirror Don's. */
const mirror = (p: Particle): Particle => ({ ...p, x: 2 * HEAD.x - p.x, rotation: p.kind === 'ray' ? 180 - p.rotation : -p.rotation });
const forHost = (particles: Particle[], who: CharacterId) => who === 'ron' ? particles.map(mirror) : particles;

export function reactionParticles(frame: ReactionFrame, who: CharacterId = 'don'): Particle[] {
    return forHost(frame.effect === 'happy' ? happyParticles(frame) : shockedParticles(frame), who);
}

/** The fixed marks shown instead when the viewer prefers reduced motion. */
export function reactionStill(effect: Reaction, who: CharacterId = 'don'): Particle[] {
    if (effect === 'shocked') return forHost(shockedParticles({ effect, elapsed: 900, duration: 10_000 }), who);
    const marks: [ParticleKind, number, number, number, string][] = [
        ['daisy', 270, 300, 40, '#fffaf0'], ['sparkle', 300, 470, 34, '#ffe07a'], ['glint', 330, 160, 12, '#fff6d8'],
        ['sparkle', 1000, 330, 30, '#ffc4e1'],
    ];
    return forHost(marks.map(([kind, x, y, size, colour], id) => ({ id, kind, x, y, size, rotation: id * 17, scale: 1, opacity: 0.85, colour })), who);
}
