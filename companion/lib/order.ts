import type { Draft, Position } from './model';

export const TARGETS = { LW: 3, C: 3, RW: 3, D: 5, G: 2 } as const;
// Fantrax daily active lineup; the other four roster spots are bench.
export const STARTERS = { LW: 2, C: 2, RW: 2, D: 4, G: 2 } as const;
export type PositionCounts = Record<Position, number>;
export interface DraftPlan { order: string[]; myTeam: string; keepers: Record<string, PositionCounts>; fantraxFetchedAt?: string }

export function parseOrder(text: string): string[] {
    return text.split(/\r?\n/).map(line => line.replace(/^\s*\d+[.)\t]\s*/, '').trim()).filter(Boolean);
}

export function validatePlan(input: unknown): DraftPlan {
    const fail = () => { throw new Error('Enter up to 500 picks, your team, and valid keeper counts (0–16 per position, 16 total).'); };
    if (!input || typeof input !== 'object') return fail();
    const plan = input as DraftPlan;
    if (!Array.isArray(plan.order) || !plan.order.length || plan.order.length > 500 ||
        !plan.order.every(team => typeof team === 'string' && team.trim() === team && team.length > 0 && team.length <= 80) ||
        typeof plan.myTeam !== 'string' || !plan.order.includes(plan.myTeam) ||
        !plan.keepers || typeof plan.keepers !== 'object' || Array.isArray(plan.keepers) ||
        (plan.fantraxFetchedAt !== undefined && (typeof plan.fantraxFetchedAt !== 'string' || !Number.isFinite(Date.parse(plan.fantraxFetchedAt))))) return fail();
    const teams = new Set(plan.order);
    if (new Set(plan.order.map(team => team.toLowerCase())).size !== teams.size) throw new Error('Use the same spelling and capitalization for each team.');
    for (const [team, counts] of Object.entries(plan.keepers)) {
        if (!teams.has(team) || !counts || typeof counts !== 'object' ||
            !Object.keys(TARGETS).every(p => Number.isInteger(counts[p as Position]) && counts[p as Position] >= 0 && counts[p as Position] <= 16) ||
            Object.keys(TARGETS).reduce((total, p) => total + counts[p as Position], 0) > 16) return fail();
    }
    return plan;
}

export function applyPlan(draft: Draft, input: unknown): Draft {
    const plan = validatePlan(input);
    const picks = draft.picks.map((pick, index) => {
        const slot = pick.slot ?? index, team = plan.order[slot];
        if (!team || pick.mine !== (team === plan.myTeam) || (pick.team && pick.team !== team)) {
            throw new Error(`Pick ${slot + 1} conflicts with a recorded pick. Keep its owner unchanged or undo that pick first.`);
        }
        return { ...pick, slot, team };
    });
    return { ...draft, plan, picks };
}

export function draftTurn(draft: Draft) {
    const filled = new Set(draft.picks.map(p => p.slot));
    const remaining = draft.plan?.order.map((team, slot) => ({ team, slot })).filter(p => !filled.has(p.slot)) ?? [];
    const mine = remaining.filter(p => p.team === draft.plan?.myTeam);
    const first = mine[0]?.slot ?? null, next = mine[1]?.slot ?? null;
    return {
        current: remaining[0] ?? null, first, next,
        before: first === null ? null : remaining.filter(p => p.slot < first).length,
        between: first === null || next === null ? null : remaining.filter(p => p.slot > first && p.slot < next).length,
        remaining,
    };
}
