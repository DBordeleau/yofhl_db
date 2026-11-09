// The live season's Fantrax league ID comes from league.yml (through league.fantrax_teams); links take it as given.
/** the league's Fantrax home, or Fantrax itself when the live season's league isn't known */
export function fantraxLeagueUrl(leagueId: string | null): string {
    return leagueId ? `https://www.fantrax.com/fantasy/league/${leagueId}/home` : 'https://www.fantrax.com/';
}

export function fantraxMatchupUrl(leagueId: string, week: number, awayId?: string, homeId?: string): string | null {
    if (!awayId || !homeId) return null;
    // Fantrax uses matrix params for the week, and its general schedule's away_home IDs for the matchup.
    const query = new URLSearchParams({ matchupId: `${awayId}_${homeId}`, mainView: 'MATCHUP', mobileView: 'MATCHUPS', mobileMatchupView: 'true' });
    return `https://www.fantrax.com/fantasy/league/${leagueId}/livescoring;period=${week};viewType=2?${query}`;
}

// The league's playoff format: the top 6 make it, the top 2 seeds get first-round byes, and the playoff rounds
// are the last three weeks of the season, one week each. Everything before them is the regular season.
// Fantrax's own playoff settings are ignored; refreshLiveSeason() only warns when they disagree with this.
export const PLAYOFF_FORMAT = {
    teams: 6,
    byes: 2,
    rounds: ['Quarterfinals', 'Semifinals', 'Final'],
} as const;
