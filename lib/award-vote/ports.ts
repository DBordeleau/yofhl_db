// What the award vote module needs from outside it. Production binds these in award-vote.ts; tests use the
// in-memory Fantrax (memory-fantrax.ts) and NHL lookup (memory-nhl.ts), a fake clock, and the app's own database
// handle pointed at a disposable league.
import type { rows, writeInOrder } from '@/lib/data/db';
import type { FantraxDayRosters, FantraxRosterPeriod, FantraxWeek } from '@/lib/season-sync/ports';

export type { FantraxDayRosters, FantraxRosterPeriod, FantraxWeek } from '@/lib/season-sync/ports';

/** one player's totals over a date range in Fantrax's stats table (Fantrax's status column, current ownership, is left out) */
export interface RangedPlayer {
    /** bare player ID */
    id: string;
    name: string;
    /** Fantrax's positions, e.g. `C,RW` */
    positions: string;
    nhlTeam: string | null;
    /** age now, by Fantrax's age column */
    age: number | null;
    points: number;
    /** null for no games in the range */
    perGame: number | null;
}

export interface RangedSkater extends RangedPlayer {
    gamesPlayed: number;
    goals: number;
    assists: number;
    shots: number;
    hits: number;
    blocks: number;
}

export interface RangedGoalie extends RangedPlayer {
    gamesPlayed: number;
    wins: number;
    goalsAgainst: number;
    saves: number;
    shutouts: number;
}

/** a season's Fantrax league info: its weeks, daily roster periods and first playoff week */
export interface AwardVoteLeagueInfo {
    /** the season year (Fantrax's start year is converted by the read) */
    seasonYear: number;
    /** Fantrax's scoring periods, in order */
    weeks: FantraxWeek[];
    /** the season's daily roster periods, in order */
    rosterPeriods: FantraxRosterPeriod[];
    /** Fantrax's first playoff week: the Quarterfinals */
    firstPlayoffWeek: number;
}

/** days of one season to total, `YYYY-MM-DD` inclusive, read against that season's league */
export interface AwardVoteRange {
    leagueId: string;
    seasonYear: number;
    startDate: string;
    endDate: string;
}

export interface AwardVoteFantrax {
    leagueInfo(leagueId: string): Promise<AwardVoteLeagueInfo>;
    /** every NHL skater's totals over the range, scored or not, fantasy points descending */
    skaters(range: AwardVoteRange): Promise<RangedSkater[]>;
    /** every NHL goalie's totals over the range, scored or not, fantasy points descending */
    goalies(range: AwardVoteRange): Promise<RangedGoalie[]>;
    /** every team's roster on one past daily roster period, by Fantrax team ID */
    dayRosters(leagueId: string, rosterPeriod: number): Promise<FantraxDayRosters>;
}

/** a player as Fantrax names them, to find on the NHL's side */
export interface NhlLookupPlayer {
    id: string;
    name: string;
    positions: string[];
    nhlTeam: string | null;
}

/** an NHL player's birth date and NHL regular-season games in each season (e.g. 20252026) */
export interface NhlPlayerRecord {
    nhlId: number;
    birthDate: string;
    seasons: { season: number; games: number }[];
}

export interface AwardVoteNhl {
    /** the NHL's record of a Fantrax player, or null when no NHL player matches */
    lookup(player: NhlLookupPlayer): Promise<NhlPlayerRecord | null>;
}

export interface AwardVoteClock {
    now(): number;
}

/** the app's database handle (lib/data/db.ts) */
export interface AwardVoteDatabase {
    rows: typeof rows;
    writeInOrder: typeof writeInOrder;
}

export interface AwardVotePorts {
    clock: AwardVoteClock;
    fantrax: AwardVoteFantrax;
    nhl: AwardVoteNhl;
    db: AwardVoteDatabase;
}
