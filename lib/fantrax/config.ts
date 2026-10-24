export const FANTRAX_LEAGUE_ID = 'rf5o9cu2mutybszr';
export const FANTRAX_LEAGUE_URL = `https://www.fantrax.com/fantasy/league/${FANTRAX_LEAGUE_ID}/home`;

export function fantraxMatchupUrl(period: number, awayId?: string, homeId?: string): string | null {
    if (!awayId || !homeId) return null;
    // Fantrax uses matrix params for the period, and its general schedule's away_home IDs for the matchup.
    const query = new URLSearchParams({ matchupId: `${awayId}_${homeId}`, mainView: 'MATCHUP', mobileView: 'MATCHUPS', mobileMatchupView: 'true' });
    return `https://www.fantrax.com/fantasy/league/${FANTRAX_LEAGUE_ID}/livescoring;period=${period};viewType=2?${query}`;
}

// Fantrax's league settings report 4 playoff teams, but the league sends 6.
export const PLAYOFF_TEAMS = 6;
// The top seeds skip the first round and go straight to the semifinals.
export const BYE_TEAMS = 2;
