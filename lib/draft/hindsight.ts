import type { SeasonDraftSelection } from '../history/model';
import { splitPositions } from '../league';

export type DraftView = 'board' | 'steals' | 'regrets' | 'redraft';
export type DraftWindow = 'season' | 'since';
export interface DraftProduction { playerId: string; year: number; points: number }
export interface DraftHindsightData { latestYear: number; production: DraftProduction[] }
export interface RankedPick extends SeasonDraftSelection { value: number; rank: number; movement: number }

export function rankDraft(picks: SeasonDraftSelection[], production: DraftProduction[], window: DraftWindow): RankedPick[] {
    const ranked = picks.flatMap(pick => {
        if (!pick.playerId) return [];
        const seasons = production.filter(p => p.playerId === pick.playerId && p.year >= pick.year);
        const value = window === 'season' ? pick.points : seasons.length ? seasons.reduce((sum, s) => sum + Math.round(s.points * 100), 0) / 100 : null;
        return value === null ? [] : [{ ...pick, value, rank: 0, movement: 0 }];
    }).sort((a, b) => b.value - a.value || a.overall - b.overall);
    ranked.forEach((pick, index) => {
        // Equal production shares a rank. Original draft order only breaks display ties.
        pick.rank = index > 0 && pick.value === ranked[index - 1].value ? ranked[index - 1].rank : index + 1;
        pick.movement = pick.overall - pick.rank;
    });
    return ranked;
}

export function laterAlternatives(pick: RankedPick, ranked: RankedPick[], samePosition: boolean) {
    const positions = splitPositions(pick.positions);
    return ranked.filter(other => other.overall > pick.overall && other.value > pick.value
        && (!samePosition || splitPositions(other.positions).some(position => positions.includes(position))));
}

export function draftRegrets(ranked: RankedPick[], samePosition: boolean) {
    return ranked.flatMap(pick => {
        const alternative = laterAlternatives(pick, ranked, samePosition)[0];
        return alternative ? [{ pick, alternative, gap: Math.round((alternative.value - pick.value) * 100) / 100 }] : [];
    }).sort((a, b) => b.gap - a.gap || a.pick.overall - b.pick.overall);
}
