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

// The league's playoff format: three rounds, named by their distance from the Final. Which weeks they are, how
// many teams make it and who has a bye come from Fantrax's playoff settings and schedule (the live season's
// `playoffs`), which report whether Fantrax's schedule fits these three rounds.
export const PLAYOFF_FORMAT = {
    rounds: ['Quarterfinals', 'Semifinals', 'Final'],
} as const;
