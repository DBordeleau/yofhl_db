export const FANTRAX_LEAGUE_ID = 'rf5o9cu2mutybszr';
export const FANTRAX_LEAGUE_URL = `https://www.fantrax.com/fantasy/league/${FANTRAX_LEAGUE_ID}/home`;

export function fantraxMatchupUrl(period: number, awayId?: string, homeId?: string): string | null {
    if (!awayId || !homeId) return null;
    // Fantrax uses matrix params for the period, and its general schedule's away_home IDs for the matchup.
    const query = new URLSearchParams({ matchupId: `${awayId}_${homeId}`, mainView: 'MATCHUP', mobileView: 'MATCHUPS', mobileMatchupView: 'true' });
    return `https://www.fantrax.com/fantasy/league/${FANTRAX_LEAGUE_ID}/livescoring;period=${period};viewType=2?${query}`;
}

// The league's playoff format: the top 6 make it, the top 2 seeds get first-round byes, and the playoff rounds
// are the last three weeks of the season, one week each. Everything before them is the regular season.
// Fantrax's own playoff settings are ignored; refreshLiveSeason() only warns when they disagree with this.
export const PLAYOFF_FORMAT = {
    teams: 6,
    byes: 2,
    rounds: ['Quarterfinals', 'Semifinals', 'Final'],
} as const;
export const PLAYOFF_TEAMS = PLAYOFF_FORMAT.teams;
