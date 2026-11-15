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
    /** the Calder-eligible rookies by player ID, with the admin's changes */
    rookies: ReadonlySet<string>;
    /** the Final's rosters: each player on a finalist's roster outside the minors, with that finalist's team season */
    finalRosters: Record<string, number>;
}

export interface PlayerAwardRule {
    award: PlayerAwardId;
    /** the stat sets each candidate shows; the first ranks the list */
    statSets: StatSetName[];
    /** how many candidates the list opens on, or null for all */
    shown: number | null;
    eligible(player: SnapshotPlayer, context: EligibilityContext): boolean;
    /**
     * The team season credited with a candidate, for an award that credits someone other than the last franchise to
     * roster them that season (the default, when this is absent).
     */
    credit?(player: SnapshotPlayer, context: EligibilityContext): number | null;
}

/** each stat set: its heading and the days it totals */
export const STAT_SETS: Record<StatSetName, { label: string; range(dates: SeasonDates): DateRange }> = {
    regularSeason: { label: 'Regular season', range: dates => dates.regularSeason },
    playoffRounds: { label: 'Playoffs', range: dates => dates.playoffRounds },
    final: { label: 'Final', range: dates => dates.final },
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
    // every rookie, so a goalie with few games isn't hidden below the top 50
    { award: 'teemu-selanne', statSets: ['regularSeason'], shown: null, eligible: (player, { rookies }) => scoredInRegularSeason(player) && rookies.has(player.playerId) },
    // Everyone on a finalist's roster during the Final, credited to the finalist they played for.
    {
        award: 'danny-briere', statSets: ['playoffRounds', 'final'], shown: SHOWN_CANDIDATES,
        eligible: (player, { finalRosters }) => player.playerId in finalRosters,
        credit: (player, { finalRosters }) => finalRosters[player.playerId] ?? null,
    },
];

/** an award's catalogue entry (lib/awards.ts), which every voted award has */
export function awardDefinition(award: PlayerAwardId) {
    const definition = getAwardDefinition(award);
    if (!definition) throw new Error(`The award catalogue has no ${award}`);
    return definition;
}
