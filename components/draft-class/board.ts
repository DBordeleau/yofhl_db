import type { SeasonDraftSelection } from '@/lib/history/model';

const ordinalRules = new Intl.PluralRules('en', { type: 'ordinal' });
const ordinalSuffixes: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' };
export const ordinal = (value: number) => `${value}${ordinalSuffixes[ordinalRules.select(value)]}`;

export const lastName = (player: string | null) => player ? player.slice(player.indexOf(' ') + 1) : '';
export const firstName = (player: string | null) => player && player.includes(' ') ? player.slice(0, player.indexOf(' ')) : '';

export function climbScale(finish: number, drafted: number, totalPicks: number) {
    const fullSpan = Math.max(1, totalPicks - 1);
    const gap = drafted - finish;
    // Give short climbs a third of the track, with context on either side where possible.
    const span = Math.min(fullSpan, Math.max(1, gap * 3));
    const start = Math.max(1, Math.min(totalPicks - span, finish - gap));
    return { start, span, zoomed: span < fullSpan };
}

// Rounds as rows, pick-in-round as columns; slots with no record stay null so the grid keeps its shape.
export function boardLayout(picks: SeasonDraftSelection[]) {
    const columns = Math.max(1, ...picks.map(pick => pick.pick));
    const rounds = [...new Set(picks.map(pick => pick.round))].sort((a, b) => a - b);
    const bySlot = new Map(picks.map(pick => [`${pick.round}-${pick.pick}`, pick]));
    return {
        columns,
        rows: rounds.map(round => ({
            round,
            cells: Array.from({ length: columns }, (_, index) => bySlot.get(`${round}-${index + 1}`) ?? null),
        })),
    };
}

// Four FPts shades. Breaks scale with the class's best season (so shortened seasons still spread out),
// rounded to the nearest 50 so the legend reads cleanly.
export function heatScale(picks: SeasonDraftSelection[]) {
    const top = Math.max(0, ...picks.map(pick => pick.points ?? 0));
    const breaks = [0.4, 0.6, 0.8].map(share => Math.max(50, Math.round((top * share) / 50) * 50));
    const level = (points: number | null) => points === null ? null : breaks.filter(value => points >= value).length;
    const labels = [`Under ${breaks[0]}`, `${breaks[0]}–${breaks[1] - 1}`, `${breaks[1]}–${breaks[2] - 1}`, `${breaks[2]}+`];
    return { level, labels };
}
