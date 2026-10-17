import type { SeasonDraftSelection } from '../history/model';
import { splitPositions } from '../league';

export type DraftView = 'board' | 'hindsight' | 'redraft';
export const MIN_REGRET_GAP = 100;
export interface RankedPick extends SeasonDraftSelection { value: number; rank: number; movement: number }

export function rankDraft(picks: SeasonDraftSelection[]): RankedPick[] {
    const ranked = picks.flatMap(pick => {
        if (!pick.playerId) return [];
        const value = pick.points;
        return value === null ? [] : [{ ...pick, value, rank: 0, movement: 0 }];
    }).sort((a, b) => b.value - a.value || a.overall - b.overall);
    ranked.forEach((pick, index) => {
        // Equal production shares a rank. Original draft order only breaks display ties.
        pick.rank = index > 0 && pick.value === ranked[index - 1].value ? ranked[index - 1].rank : index + 1;
        pick.movement = pick.overall - pick.rank;
    });
    return ranked;
}

// Logarithmic rank gain makes each place gained worth more near the top of the class.
export function topSteals(ranked: RankedPick[], limit = 10) {
    return ranked.filter(pick => pick.movement > 0)
        .sort((a, b) => Math.log(b.overall / b.rank) - Math.log(a.overall / a.rank) || b.value - a.value || a.overall - b.overall)
        .slice(0, limit);
}

export function redraftBoard(picks: SeasonDraftSelection[], ranked: RankedPick[]) {
    const eligibleSlots = new Set(ranked.map(pick => pick.overall));
    let next = 0;
    // Preserve empty/unranked slots and assign each ranked player exactly once, before team filtering.
    return [...picks].sort((a, b) => a.overall - b.overall).map(original => ({
        original,
        redrafted: eligibleSlots.has(original.overall) ? ranked[next++] : null,
    }));
}

export function laterAlternatives(pick: RankedPick, ranked: RankedPick[], samePosition: boolean) {
    const positions = splitPositions(pick.positions);
    return ranked.filter(other => other.overall > pick.overall && Math.round((other.value - pick.value) * 100) >= MIN_REGRET_GAP * 100
        && (!samePosition || splitPositions(other.positions).some(position => positions.includes(position))));
}

export function draftRegrets(ranked: RankedPick[], samePosition: boolean) {
    return ranked.flatMap(pick => {
        if (!pick.regretEligible) return [];
        const alternative = laterAlternatives(pick, ranked, samePosition)[0];
        return alternative ? [{ pick, alternative, gap: Math.round((alternative.value - pick.value) * 100) / 100 }] : [];
    }).sort((a, b) => b.gap - a.gap || a.pick.overall - b.pick.overall);
}
