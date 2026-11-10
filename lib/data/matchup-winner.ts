// The winner of a matchup follows the score unless overridden; a tie has no winner.
// Kept free of Next imports so the season import (franchise ids) and the matchup curated edit
// (team-season ids) share it.
export interface MatchupSide<Id> { id: Id; score: number }

export const matchupWinner = <Id>(away: MatchupSide<Id>, home: MatchupSide<Id>, override?: Id | null): Id | null => {
    if (override !== undefined && override !== null) return override;
    if (away.score > home.score) return away.id;
    if (home.score > away.score) return home.id;
    return null;
};
