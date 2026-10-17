import { playerAge } from '../keepers/player-details';
import { splitPositions } from '../league';

export interface DraftDevelopmentFacts {
    draftedOn: string;
    birthDate: string;
    nhlId: number;
    priorNhlGames: number | null;
}
interface DraftIdentity { year: number; playerId: string | null; draftedOn: string; positions: string }

// Called on the server; only the resulting boolean is sent to the draft UI.
export function draftRegretEligible(pick: DraftIdentity, facts?: DraftDevelopmentFacts | null): boolean {
    if (!pick.playerId || !facts || facts.draftedOn !== pick.draftedOn) return false;
    const age = playerAge(facts.birthDate, pick.draftedOn);
    if (age === null || age <= 22) return false;
    const goalie = splitPositions(pick.positions).includes('G');
    if (age > (goalie ? 25 : 24)) return true;
    return facts.priorNhlGames !== null && facts.priorNhlGames >= (goalie ? 50 : 82);
}
