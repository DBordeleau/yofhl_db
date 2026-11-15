// Each individual voted award the ballot carries: who its candidates are and which stat sets they show. Adding an
// award to the vote is adding its rule here (and a prepare step for any stat set it needs that isn't read yet).
// The order here is the ballot's.
import { getAwardDefinition } from '@/lib/awards';
import type { DateRange, PlayerAwardId, StatLine, StatSetName } from './model';
import type { SeasonDates } from './season-dates';

/** a snapshot player as the eligibility rules see them */
export interface SnapshotPlayer {
    playerId: string;
    name: string;
    positions: string[];
    nhlTeam: string | null;
    age: number | null;
    stats: Partial<Record<StatSetName, StatLine>>;
}

/** what the rules know beyond the player */
export interface EligibilityContext {
    seasonYear: number;
}

export interface PlayerAwardRule {
    award: PlayerAwardId;
    /** the stat sets each candidate shows; the first ranks the list */
    statSets: StatSetName[];
    /** how many candidates the list opens on, or null for all */
    shown: number | null;
    eligible(player: SnapshotPlayer, context: EligibilityContext): boolean;
}

/** each stat set: its heading and the days it totals */
export const STAT_SETS: Record<StatSetName, { label: string; range(dates: SeasonDates): DateRange }> = {
    regularSeason: { label: 'Regular season', range: dates => dates.regularSeason },
};

/** the ballot's default list length */
export const SHOWN_CANDIDATES = 50;

/** a player with fantasy points in the fantasy regular season (the snapshot stores only those) */
const scoredInRegularSeason = (player: SnapshotPlayer) => player.stats.regularSeason !== undefined && player.stats.regularSeason.points !== 0;

export const PLAYER_AWARD_RULES: readonly PlayerAwardRule[] = [
    { award: 'wayne-gretzky', statSets: ['regularSeason'], shown: SHOWN_CANDIDATES, eligible: scoredInRegularSeason },
    { award: 'le-magnifique', statSets: ['regularSeason'], shown: SHOWN_CANDIDATES, eligible: scoredInRegularSeason },
    { award: 'bobby-orr', statSets: ['regularSeason'], shown: SHOWN_CANDIDATES, eligible: player => scoredInRegularSeason(player) && player.positions.includes('D') },
    { award: 'hasek', statSets: ['regularSeason'], shown: SHOWN_CANDIDATES, eligible: player => scoredInRegularSeason(player) && player.positions.includes('G') },
];

/** an award's catalogue entry (lib/awards.ts), which every voted award has */
export function awardDefinition(award: PlayerAwardId) {
    const definition = getAwardDefinition(award);
    if (!definition) throw new Error(`The award catalogue has no ${award}`);
    return definition;
}
