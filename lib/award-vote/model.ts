// The award vote's stored shapes and what its reads return. Pure types and constants, free of server imports, so
// db/schema.ts and client components can use them.

/** an award vote's state (GLOSSARY.md, "Award vote"); "locked" is not stored: it is open with the ballot lock past */
export type AwardVoteState = 'prepared' | 'open' | 'scored' | 'published';

/** the first season year with an award vote; the season before the latest may only be rehearsed */
export const FIRST_AWARD_VOTE_SEASON = 2027;

/** the individual voted awards, by their id in the award catalogue (lib/awards.ts) */
export const PLAYER_AWARD_IDS = ['wayne-gretzky', 'le-magnifique', 'bobby-orr', 'hasek', 'teemu-selanne', 'danny-briere'] as const;
export type PlayerAwardId = typeof PLAYER_AWARD_IDS[number];

/**
 * A named stretch of the season a candidate's stats cover. The regular-season awards show `regularSeason`; the
 * Danny Briere Award shows `playoffRounds` (every playoff round, the Final included) and `final` (the Final alone).
 */
export type StatSetName = 'regularSeason' | 'playoffRounds' | 'final';

/** a skater's totals over one stat set */
export interface SkaterLine {
    group: 'skater';
    points: number;
    /** null for no games in the stretch */
    perGame: number | null;
    gamesPlayed: number;
    goals: number;
    assists: number;
    shots: number;
    hits: number;
    blocks: number;
}

/**
 * A goalie's totals over one stat set. The categories after shutouts are kept only when the season's league scores
 * them (its Fantrax table has them), and are null where Fantrax shows no value.
 */
export interface GoalieLine {
    group: 'goalie';
    points: number;
    perGame: number | null;
    gamesPlayed: number;
    wins: number;
    shutouts: number;
    /** overtime and shootout losses (OL+ShL) */
    overtimeLosses?: number | null;
    goalsAgainst?: number | null;
    saves?: number | null;
    /** e.g. 0.915 */
    savePercentage?: number | null;
}

export type StatLine = SkaterLine | GoalieLine;

/** the season's date ranges stored with a prepare, each `YYYY-MM-DD` to `YYYY-MM-DD` inclusive (see season-dates.ts) */
export interface DateRange {
    startDate: string;
    endDate: string;
}

/**
 * How far a prepare has got (stored on the award vote): when it started, the steps done in order, and the season's
 * dates once read. A prepare is finished when the award vote's prepared time is set.
 */
export interface PrepareProgress {
    startedAt: string;
    done: string[];
    dates: import('./season-dates').SeasonDates | null;
    /**
     * The stat set read under way when its table has more pages than one call reads: its step, the pages read, and
     * the table's size when its first page was read.
     */
    pagesRead?: { step: string; read: number; pages: number; total: number };
    /** the NHL lookup of each young player looked up so far for the Teemu Trophy, by player ID */
    rookies?: Record<string, RookieLookup>;
    /**
     * Everyone on a finalist's roster outside the minors on any day of the Final, by player ID, each with the team
     * season of the finalist credited with them; absent until the Final's rosters are read.
     */
    finalRosters?: Record<string, number>;
}

/** a young player's NHL match and whether the Calder rule (calder.ts) admits them, or null when no NHL player matches */
export type RookieLookup = { nhlId: number; eligible: boolean } | null;

/** the admin's changes to the computed Calder-eligible rookie list, by player ID, kept across re-prepares */
export interface RookieAdjustments {
    added: string[];
    removed: string[];
}

/** the team season credited with a candidate, as it was named that season */
export interface CreditedTeam {
    teamSeasonId: number;
    franchiseId: number;
    name: string;
    abbreviation: string;
    logo: string | null;
}

/** a player candidate for one voted award, from the frozen snapshot */
export interface PlayerCandidate {
    playerId: string;
    name: string;
    positions: string[];
    nhlTeam: string | null;
    /** the franchise credited with the player for this award, or null when nobody rostered them */
    team: CreditedTeam | null;
    /** the player's stats in each of the award's stat sets */
    stats: Partial<Record<StatSetName, StatLine>>;
}

/** one voted award on the ballot: its candidates, best regular-season FPts first */
export interface BallotAward {
    award: PlayerAwardId;
    label: string;
    honor: string;
    /** the stat sets each candidate shows, the first being the one the list is ranked by */
    statSets: { name: StatSetName; label: string }[];
    /** how many candidates the list opens on, or null for all of them */
    shown: number | null;
    candidates: PlayerCandidate[];
}
