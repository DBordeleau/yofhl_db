import type { MaterializedView } from './materialized-views';

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
    /** each season's points leader, the Prime Minister's Trophy winner once the season is published */
    pointsLeaders: 'league:points-leaders',
    /** draft classes' FPts and FP/G */
    draft: 'league:draft',
    season: (year: number) => `league:season:${year}`,
    franchise: (id: number) => `league:franchise:${id}`,
};

export const teamIdentityTags = (id: number) => [leagueTags.franchise(id), leagueTags.franchiseCards, leagueTags.rivalries, leagueTags.records, leagueTags.discovery];

// What a season sync run changed (lib/season-sync): each kind of change refreshes these views and expires these
// tags, once per run whatever else it changed. A run that changes nothing has no effects. A playoff game decides
// the champion, so it expires what a bracket correction does (the 'matchup' curated edit). Skater categories are
// read only by the record book.
export type SeasonSyncChange = 'stats' | 'playoffs' | 'roster' | 'categories';
export function seasonSyncEffects(changes: readonly SeasonSyncChange[], year: number): { views: MaterializedView[]; tags: string[] } {
    const effects = changes.map(change => {
        switch (change) {
            case 'stats': return {
                views: ['player_careers', 'franchise_records'] as MaterializedView[],
                tags: [leagueTags.season(year), leagueTags.players, leagueTags.careerLeaderboard, leagueTags.seasonLeaderboard,
                    leagueTags.franchiseCards, leagueTags.franchiseDetails, leagueTags.records, leagueTags.discovery, leagueTags.draft,
                    leagueTags.pointsLeaders, leagueTags.rivalries],
            };
            case 'playoffs': return curatedEditEffects('matchup', year);
            case 'roster': return curatedEditEffects('roster', year);
            case 'categories': return { views: [] as MaterializedView[], tags: [leagueTags.records] };
        }
    });
    return { views: [...new Set(effects.flatMap(effect => effect.views))], tags: [...new Set(effects.flatMap(effect => effect.tags))] };
}

export type CuratedEdit = 'roster' | 'awards' | 'matchup';
export function curatedEditEffects(kind: CuratedEdit, year: number): { views: MaterializedView[]; tags: string[] } {
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
            views: ['franchise_records', 'season_results'],
            tags: [leagueTags.season(year), leagueTags.banners, leagueTags.players, leagueTags.franchiseDetails,
                leagueTags.franchiseCards, leagueTags.cups, leagueTags.rivalries, leagueTags.records, leagueTags.discovery],
        };
    }
}
