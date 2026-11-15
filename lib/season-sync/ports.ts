// What the season sync reads from Fantrax. Production binds it to the Fantrax client in season-sync.ts; tests use
// the in-memory binding in memory-fantrax.ts. Every read checks its own response's shape and rejects a failed or
// malformed one; the season sync then checks the reads against the archive before it writes anything. The bracket
// comes from the live season module, which already has Fantrax's playoff weeks, pairings and final weeks.
import type { getLiveSeason, getWeekScores, WeekScores } from '@/lib/fantrax/live-season';
import type { PlayerCategories } from '@/lib/records/player-stats';

/** one Fantrax scoring period, its dates as ISO strings */
export interface FantraxWeek {
    number: number;
    startDate: string;
    endDate: string;
}

/** one Fantrax roster period (GLOSSARY.md): a day's lineup, from one day's first game to the next's, its dates as ISO strings */
export interface FantraxRosterPeriod {
    number: number;
    startDate: string;
    endDate: string;
}

export interface FantraxLeagueInfo {
    /** the season year (Fantrax's start year is converted by the read) */
    seasonYear: number;
    /** the season's weeks, in order */
    weeks: FantraxWeek[];
    /** the season's daily roster periods, in order */
    rosterPeriods: FantraxRosterPeriod[];
}

/** a player's slot on a fantasy roster for the day */
export type FantraxRosterSlot = 'ACTIVE' | 'RESERVE' | 'INJURED_RESERVE' | 'MINORS';

/** every Fantrax team's players on one daily roster period, keyed by Fantrax team ID, with each player's slot */
export type FantraxDayRosters = Record<string, { id: string; status: FantraxRosterSlot }[]>;

/** a player in Fantrax's player directory (every NHL player), by bare player ID */
export interface FantraxDirectoryPlayer {
    /** "First Last" */
    name: string;
    positions: string[];
    nhlTeam: string | null;
}

/** one row of Fantrax's website standings table, season to date */
export interface FantraxStanding {
    teamId: string;
    /** 1-based place in the table */
    rank: number;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
}

/** one player in Fantrax's website player stats table for the league's scoring, season to date */
export interface FantraxPlayer {
    /** bare Fantrax player ID */
    id: string;
    name: string;
    positions: string[];
    /** null when Fantrax lists no NHL team */
    nhlTeam: string | null;
    /** the Fantrax team the player is rostered on, or null for a free agent */
    teamId: string | null;
    points: number;
    /** null when Fantrax shows no FP/G */
    perGame: number | null;
}

/** one skater in Fantrax's website skater table (the record book's category export's read), season to date */
export interface FantraxSkater {
    /** bare Fantrax player ID */
    id: string;
    /** goals, assists, shots, hits and blocks, or null for a skater with no games played */
    categories: PlayerCategories | null;
}

export interface SeasonSyncFantrax {
    leagueInfo(leagueId: string): Promise<FantraxLeagueInfo>;
    standings(leagueId: string): Promise<FantraxStanding[]>;
    /** every player who scored (a non-zero total, negative included) or is rostered, for the season year given */
    players(leagueId: string, seasonYear: number): Promise<FantraxPlayer[]>;
    /** every NHL skater (goalies are not in it), with skater categories for those who have played, for the season year given */
    skaters(leagueId: string, seasonYear: number): Promise<FantraxSkater[]>;
    /** every team's roster on one past (or the current) daily roster period */
    dayRosters(leagueId: string, rosterPeriod: number): Promise<FantraxDayRosters>;
    /** every NHL player Fantrax knows, by bare player ID */
    playerDirectory(): Promise<Record<string, FantraxDirectoryPlayer>>;
    /** one week's games and scores, read from Fantrax now rather than the evening refresh's snapshot */
    weekScores(leagueId: string, week: number): Promise<WeekScores>;
}

export interface SeasonSyncPorts {
    fantrax: SeasonSyncFantrax;
    /** the live season module: the playoff weeks, their pairings, whether each is final, and their scores */
    liveSeason: { getLiveSeason: typeof getLiveSeason; getWeekScores: typeof getWeekScores };
}
