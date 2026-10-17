import type { Player, Position } from './model';

// Players within 20 board points (~0.24 FP/G over 84 games) of a tier's best player are treated as interchangeable.
export const TIER_WIDTH = 20;
// Enough players per position to cover the draft once picks are spread across positions.
export const TIER_DEPTH = 45;
// shortcut: a strong break is a drop well above the position's typical adjacent gap; tune if it flags too often.
export const TIER_WINDOW = 30, TIER_MULTIPLE = 3, TIER_MINIMUM = 15;

export function median(values: number[]) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export const typicalGap = (values: number[]) => median(values.slice(1, TIER_WINDOW + 1).map((value, i) => values[i] - value));
export const isStrongBreak = (gap: number, typical: number) => gap >= Math.max(TIER_MINIMUM, typical * TIER_MULTIPLE);

// Split descending values into the fewest tiers that each span at most `width` points. Among equally few tiers,
// minimise total within-tier spread, which places boundaries in the largest gaps. Returns each tier's start index.
export function tierStarts(values: number[], width = TIER_WIDTH): number[] {
    const best: { count: number; spread: number; start: number }[] = [{ count: 0, spread: 0, start: 0 }];
    for (let end = 1; end <= values.length; end++) {
        best[end] = { count: Infinity, spread: Infinity, start: 0 };
        for (let start = end - 1; start >= 0 && values[start] - values[end - 1] <= width; start--) {
            const count = best[start].count + 1, spread = best[start].spread + values[start] - values[end - 1];
            if (count < best[end].count || (count === best[end].count && spread < best[end].spread)) best[end] = { count, spread, start };
        }
    }
    const starts: number[] = [];
    for (let end = values.length; end > 0; end = best[end].start) starts.unshift(best[end].start);
    return starts;
}

export interface TierMember { player: Player; points: number; takenBy: string | null }
export interface Tier {
    position: Position; number: number; members: TierMember[];
    top: number; bottom: number; left: number;
    // Gap from the previous tier's last player; strong when it is a real drop rather than a width split.
    gapAbove: number | null; strongBreak: boolean;
    // Expected tier players still available at our upcoming pick and the one after, from the draft simulations.
    expected: { atPick: number; atNext: number | null } | null;
}

// Members must be sorted by points, best first. Taken players stay in place so tiers do not shift during the draft.
export function buildTiers(position: Position, members: TierMember[]): Tier[] {
    const values = members.map(m => m.points), typical = typicalGap(values), starts = tierStarts(values);
    return starts.map((start, i) => {
        const group = members.slice(start, starts[i + 1] ?? members.length);
        const gapAbove = start ? values[start - 1] - values[start] : null;
        return { position, number: i + 1, members: group, top: group[0].points, bottom: group.at(-1)!.points,
            left: group.filter(m => !m.takenBy).length, gapAbove, strongBreak: gapAbove !== null && isStrongBreak(gapAbove, typical), expected: null };
    });
}
