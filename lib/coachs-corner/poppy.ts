// The lapel poppy's shapes, the one definition the player's SVG and the share card's canvas both draw,
// so the two never drift apart. Coordinates are around the poppy's centre, before its lapel spot's
// translate and scale (cast's lapelFor) and its tilt.

export type PoppyShape =
    | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string; fillOpacity: number }
    | { kind: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string; strokeWidth?: number }
    /** an open stroke with round caps, in SVG path syntax */
    | { kind: 'path'; d: string; stroke: string; strokeWidth: number; strokeOpacity?: number };

/** degrees the poppy is turned on the lapel */
export const POPPY_TILT = -14;

const SHADOW = '#1a1012';
const BACK = '#b10e25';
const FRONT = '#e11a33';
const SHINE = '#ff8a93';

/** back to front */
export const POPPY: PoppyShape[] = [
    { kind: 'ellipse', cx: 5, cy: 8, rx: 40, ry: 38, fill: '#000', fillOpacity: 0.3 },
    ...[[-14, -14], [14, -14], [-14, 14], [14, 14]].map(([cx, cy]): PoppyShape => ({ kind: 'circle', cx, cy, r: 27, fill: SHADOW })),
    { kind: 'circle', cx: -14, cy: -14, r: 22, fill: BACK },
    { kind: 'circle', cx: 14, cy: -14, r: 22, fill: BACK },
    { kind: 'path', d: 'M0 -31V-12', stroke: SHADOW, strokeWidth: 4 },
    { kind: 'circle', cx: -14, cy: 14, r: 22, fill: FRONT, stroke: SHADOW, strokeWidth: 4 },
    { kind: 'circle', cx: 14, cy: 14, r: 22, fill: FRONT, stroke: SHADOW, strokeWidth: 4 },
    { kind: 'path', d: 'M-29 10q3-9 12-11', stroke: SHINE, strokeWidth: 4 },
    { kind: 'path', d: 'M2 8q4-8 12-9', stroke: SHINE, strokeWidth: 4 },
    { kind: 'path', d: 'M-27 -20q4-8 12-9', stroke: SHINE, strokeWidth: 4, strokeOpacity: 0.55 },
    { kind: 'circle', cx: 0, cy: 0, r: 11, fill: '#111' },
    { kind: 'circle', cx: -3, cy: -4, r: 3.5, fill: '#5c5c5c' },
];
