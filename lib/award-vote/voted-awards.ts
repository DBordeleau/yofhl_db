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

/** the rookie award, the Teemu Trophy, whose candidates the rookie review covers */
export const ROOKIE_AWARD: PlayerAwardId = 'teemu-selanne';
/** the stat set a rookie must reach the candidate floor in to be a Teemu Trophy candidate, which also ranks the rookie review */
export const ROOKIE_STAT_SET: StatSetName = 'regularSeason';

/** the fantasy regular-season FPts a player needs to be a candidate for a regular-season award */
export const CANDIDATE_FPTS_FLOOR = 100;

/** a player with at least the floor's fantasy points in the fantasy regular season */
const reachedFloor = (player: SnapshotPlayer) => player.stats.regularSeason !== undefined && player.stats.regularSeason.points >= CANDIDATE_FPTS_FLOOR;

export const PLAYER_AWARD_RULES: readonly PlayerAwardRule[] = [
    { award: 'wayne-gretzky', statSets: ['regularSeason'], shown: SHOWN_CANDIDATES, eligible: reachedFloor },
    { award: 'le-magnifique', statSets: ['regularSeason'], shown: SHOWN_CANDIDATES, eligible: reachedFloor },
    { award: 'bobby-orr', statSets: ['regularSeason'], shown: SHOWN_CANDIDATES, eligible: player => reachedFloor(player) && player.positions.includes('D') },
    { award: 'hasek', statSets: ['regularSeason'], shown: SHOWN_CANDIDATES, eligible: player => reachedFloor(player) && player.positions.includes('G') },
    // every rookie at the floor, the admin's additions too, so a goalie with few games isn't hidden below the top 50
    { award: ROOKIE_AWARD, statSets: [ROOKIE_STAT_SET], shown: null, eligible: (player, { rookies }) => reachedFloor(player) && rookies.has(player.playerId) },
    // Everyone on a finalist's roster during the Final, credited to the finalist they played for: for a player on
    // both finalists' rosters during the Final, the one that had them last (the final rosters step, prepare-steps.ts).
    // No floor: it shows a few weeks of playoff stats.
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
