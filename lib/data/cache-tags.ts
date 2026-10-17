// Full imports still invalidate every query. Interactive edits invalidate only their readers.
export const LEAGUE_TAG = 'league';
export const leagueTags = {
    branding: 'league:branding',
    banners: 'league:banners',
    players: 'league:players',
    careerLeaderboard: 'league:career-leaderboard',
    seasonLeaderboard: 'league:season-leaderboard',
    franchiseCards: 'league:franchise-cards',
    franchiseDetails: 'league:franchise-details',
    awards: 'league:awards',
    cups: 'league:cups',
    rivalries: 'league:rivalries',
    records: 'league:records',
    discovery: 'league:discovery',
    season: (year: number) => `league:season:${year}`,
    franchise: (id: number) => `league:franchise:${id}`,
};

export const teamIdentityTags = (id: number) => [leagueTags.franchise(id), leagueTags.franchiseCards, leagueTags.rivalries, leagueTags.records, leagueTags.discovery];

export type CuratedEdit = 'roster' | 'awards' | 'matchup';
export function curatedEditEffects(kind: CuratedEdit, year: number) {
    switch (kind) {
        case 'roster': return {
            views: ['player_careers'],
            tags: [leagueTags.season(year), leagueTags.seasonLeaderboard, leagueTags.careerLeaderboard, leagueTags.players, leagueTags.franchiseDetails, leagueTags.discovery],
        };
        case 'awards': return {
            views: ['player_careers'],
            tags: [leagueTags.season(year), leagueTags.seasonLeaderboard, leagueTags.players, leagueTags.awards, leagueTags.records],
        };
        case 'matchup': return {
            // franchise_records reads season_results, so keep this order.
            views: ['season_results', 'franchise_records'],
            tags: [leagueTags.season(year), leagueTags.banners, leagueTags.players, leagueTags.franchiseDetails,
                leagueTags.franchiseCards, leagueTags.cups, leagueTags.rivalries, leagueTags.records, leagueTags.discovery],
        };
    }
}
