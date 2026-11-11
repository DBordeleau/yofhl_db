import type { CSSProperties } from 'react';
import { fallbackColours, suggestedPalettes, type TeamColours } from '@/lib/team-branding';

// A club's side of a Pick'em strip: its primary colour mixed toward broadcast navy until white type reads on it
// (DESIGN.md, "The Club Colour Rule"). Light primaries take more navy, dark ones keep their own colour.

const NAVY = [16, 29, 50];
const BLACK = [5, 12, 24];

const channels = (hex: string) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
const mix = (a: number[], b: number[], share: number) => a.map((value, i) => Math.round(value * share + b[i] * (1 - share)));
const linear = (value: number) => { const c = value / 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]: number[]) => .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b);
const css = (rgb: number[]) => `rgb(${rgb.join(' ')})`;

/** The deepest club share that keeps white type at 5:1 or better, from 88% down */
function clubShare(primary: number[]) {
    for (let share = .88; share > .3; share -= .04) if (luminance(mix(primary, NAVY, share)) <= .16) return share;
    return .3;
}

export function clubColours(palettes: Record<number, TeamColours>, franchiseId: number): TeamColours {
    return palettes[franchiseId] ?? suggestedPalettes[franchiseId] ?? fallbackColours;
}

/** CSS variables for one side: --club (lit end) and --club-deep (shadowed end) */
export function clubTone(colours: TeamColours): CSSProperties {
    const primary = channels(colours.primary);
    const share = clubShare(primary);
    return {
        '--club': css(mix(primary, NAVY, share)),
        '--club-deep': css(mix(primary, BLACK, share * .55)),
    } as CSSProperties;
}
