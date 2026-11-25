import type { Metadata } from 'next';
import type { BannerSeason, FranchiseSeason } from './data/league';
import { seasonLabel } from './league';
import { pageMetadata } from './site-metadata';

// A description per public page, each one wording that can sit in a chat app for months: seasons, Jagr Cups, champions
// and owners, never a standing or a point total that moves week to week. Each page's wording is a function of its own
// so it can be read and edited here rather than hunted down in app/.

/** A season's page: who won its Jagr Cup, and what else the season left behind. */
export function seasonMetadata(season: Pick<BannerSeason, 'year' | 'team' | 'owner' | 'playoffStatus'>): Metadata {
    const label = seasonLabel(season.year);
    const cancelled = season.playoffStatus === 'cancelled';
    const champion = cancelled ? null : season.team;
    // A season with neither a cancellation nor a champion on record is mid-publication: it claims neither.
    const description = champion
        ? `The ${label} YOFHL season: ${champion}${season.owner ? ` (${season.owner})` : ''} won the Jagr Cup.`
            + ' Final standings, playoff bracket, leaders and draft class.'
        : cancelled
            ? `The ${label} YOFHL season, whose playoffs were cancelled. Final standings, leaders and draft class.`
            : `The ${label} YOFHL season: final standings, playoff bracket, leaders and draft class.`;
    return pageMetadata({ path: `/season/${season.year}`, name: `${label} Season`, description });
}

/** A season's award ballots: every franchise's votes for that season's awards. */
export function seasonBallotsMetadata(year: number): Metadata {
    const label = seasonLabel(year);
    return pageMetadata({ path: `/season/${year}/ballots`, name: `${label} Award Ballots`,
        description: `Every franchise's award ballot for the ${label} YOFHL season.` });
}

/** every franchise's page, and the fallback for a franchise the archive doesn't hold */
export const FRANCHISES_DESCRIPTION = "Every YOFHL franchise's all-time record, playoff runs and Jagr Cups.";

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
/** "Sens Fan's", "Dangle Berries'" */
const possessive = (name: string) => `${name}${/s$/i.test(name) ? "'" : "'s"}`;

/**
 * A franchise's page: how long it has been in the league and what it has won. A season being played is still pending,
 * so it isn't counted until it is published.
 */
export function franchiseMetadata(id: number, team: {
    name: string;
    seasons: Pick<FranchiseSeason, 'playoffStatus'>[];
    /** the years it won the Jagr Cup */
    championships: number[];
    foldedAfterSeason: number | null;
} | null): Metadata {
    // A franchise the archive doesn't hold is a 404: its link points at the franchises page instead.
    if (!team) return pageMetadata({ path: '/teams/stats', name: 'Franchises', description: FRANCHISES_DESCRIPTION });
    const played = team.seasons.filter(season => season.playoffStatus !== 'pending').length;
    const history = [
        `${plural(played, 'season')}${team.foldedAfterSeason === null ? '' : ' before folding'}`,
        team.championships.length ? plural(team.championships.length, 'Jagr Cup') : null,
    ].filter(Boolean).join(' and ');
    return pageMetadata({ path: `/teams/${id}`, name: team.name,
        description: `${possessive(team.name)} YOFHL history: ${history}, with every season, roster and record.` });
}

/** A leaderboard: whether it ranks careers or single seasons, which is what the two modes differ by. */
export function leaderboardMetadata(mode: 'all-time' | 'single-season', position: string): Metadata {
    const career = mode === 'all-time';
    return pageMetadata({
        path: `/stats/${mode}/${position}`,
        name: `${career ? 'All-time' : 'Single-season'} leaderboard`,
        description: career
            ? "The YOFHL's all-time fantasy point leaders: career totals for every player, by position."
            : "The YOFHL's best single seasons: every player season ranked by fantasy points, by position.",
    });
}

/**
 * One regular-season game in the record book: the two franchises and the week, which is what the page is evidence of.
 * The page is not indexed, so this is for the group chat rather than for search.
 */
export function matchupRecordMetadata(game: { id: number; awayName: string; homeName: string; year: number; round: number }): Metadata {
    return pageMetadata({
        path: `/records/game/${game.id}`,
        name: 'Matchup record',
        description: `${game.awayName} vs ${game.homeName}, ${seasonLabel(game.year)} Week ${game.round}: a YOFHL record matchup.`,
        robots: { index: false, follow: false },
    });
}
