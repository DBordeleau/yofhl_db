// What the season sync reads from Fantrax. Production binds it to the Fantrax client in season-sync.ts; tests use
// the in-memory binding in memory-fantrax.ts. Every read checks its own response's shape and rejects a failed or
// malformed one; the season sync then checks the reads against the archive before it writes anything. The bracket
// comes from the live season module, which already has Fantrax's playoff weeks, pairings and final weeks.
import type { getLiveSeason, getWeekScores } from '@/lib/fantrax/live-season';

/** one Fantrax scoring period, its dates as ISO strings */
export interface FantraxWeek {
    number: number;
    startDate: string;
    endDate: string;
}

export interface FantraxLeagueInfo {
    /** the season year (Fantrax's start year is converted by the read) */
    seasonYear: number;
    /** the season's weeks, in order */
    weeks: FantraxWeek[];
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

export interface SeasonSyncFantrax {
    leagueInfo(leagueId: string): Promise<FantraxLeagueInfo>;
    standings(leagueId: string): Promise<FantraxStanding[]>;
    /** every player who scored (a non-zero total, negative included) or is rostered, for the season year given */
    players(leagueId: string, seasonYear: number): Promise<FantraxPlayer[]>;
}

export interface SeasonSyncPorts {
    fantrax: SeasonSyncFantrax;
    /** the live season module: the playoff weeks, their pairings, whether each is final, and their scores */
    liveSeason: { getLiveSeason: typeof getLiveSeason; getWeekScores: typeof getWeekScores };
}
