// Results (GLOSSARY.md, "Pick'em record"): a locked week has none until it is a final week. A final week takes each
// pairing's result from the live season on read, so it follows stat corrections, until settle freezes it once the
// correction window has closed; from then on Pick'em's own record is the result (ADR 0005).
import { matchupWinner } from '@/lib/data/matchup-winner';
import type { LiveTeam } from '@/lib/fantrax/live-season';
import { pairOf, samePair } from './model';
import type { PickemPorts } from './ports';

/** a pairing's result: the winning franchise, or null for a tie */
export type Winner = number | null;

/** A Pick'em pick, scored: correct when its franchise won, wrong when the other did, neither on a tie */
export type PickOutcome = 'correct' | 'wrong' | 'neither';

export const outcomeOf = (picked: number, winner: Winner): PickOutcome =>
    winner === null ? 'neither' : winner === picked ? 'correct' : 'wrong';

/**
 * Each pairing's result as the live season scores week `week` now, by the matchup winner rule. A pairing Fantrax
 * has no score for (one it no longer has that week) has no winner, so its Pick'em picks count as neither.
 */
export async function liveWinners({ liveSeason }: Pick<PickemPorts, 'liveSeason'>, week: number,
    pairings: { away: number; home: number }[], teams: LiveTeam[]): Promise<Winner[]> {
    const scores = await liveSeason.getWeekScores(week);
    const franchiseOf = new Map(teams.map(team => [team.id, team.franchiseId]));
    const scored = (scores?.matchups ?? []).flatMap(({ away, home }) => {
        const awayId = franchiseOf.get(away.teamId), homeId = franchiseOf.get(home.teamId);
        return awayId == null || homeId == null ? [] : [{ away: { id: awayId, score: away.score }, home: { id: homeId, score: home.score } }];
    });
    return pairings.map(pairing => {
        const found = scored.find(item => samePair(pairOf(item.away.id, item.home.id), pairOf(pairing.away, pairing.home)));
        return found ? matchupWinner(found.away, found.home) : null;
    });
}
