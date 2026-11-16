// What the award vote module needs from outside it. Production binds these in award-vote.ts; tests use the
// in-memory Fantrax (memory-fantrax.ts) and NHL lookup (memory-nhl.ts), a fake clock, and the app's own database
// handle pointed at a disposable league.
import type { rows, writeInOrder } from '@/lib/data/db';
import type { RangedGoalie, RangedPage, RangedPlayer, RangedSkater } from '@/lib/fantrax/ranged-stats';
// a type only: the owner session reads the award vote for its header nudge (read-ballot-nudge.ts), so importing its
// value here would be a cycle
import type { OwnerSession } from '@/lib/owner/create-owner-session';
import type { FantraxDayRosters, FantraxRosterPeriod, FantraxWeek } from '@/lib/season-sync/ports';

export type { FantraxDayRosters, FantraxRosterPeriod, FantraxWeek } from '@/lib/season-sync/ports';
// one player's totals over a date range in Fantrax's stats table, as the ranged-stats reader gives them
export type { RangedGoalie, RangedPage, RangedPlayer, RangedSkater } from '@/lib/fantrax/ranged-stats';

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
    /** one page (from 1) of every NHL skater's totals over the range, scored or not, fantasy points descending */
    skaters(range: AwardVoteRange, page: number): Promise<RangedPage<RangedSkater>>;
    /** one page (from 1) of every NHL goalie's totals over the range, scored or not, fantasy points descending */
    goalies(range: AwardVoteRange, page: number): Promise<RangedPage<RangedGoalie>>;
    /**
     * one page (from 1) of every NHL player's fantasy points over the range (a single day, for move value), without
     * games played or categories, fantasy points descending
     */
    points(range: AwardVoteRange, page: number): Promise<RangedPage<RangedPlayer>>;
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
    /** wait `ms` milliseconds */
    sleep(ms: number): Promise<void>;
}

/** the app's database handle (lib/data/db.ts) */
export interface AwardVoteDatabase {
    rows: typeof rows;
    writeInOrder: typeof writeInOrder;
}

/** who is signed in, and the owner preamble every ballot write starts with (lib/owner/create-owner-session.ts) */
export type AwardVoteOwnerSession = Pick<OwnerSession, 'currentOwnerTeam' | 'ownerPreamble'>;

export interface AwardVotePorts {
    clock: AwardVoteClock;
    fantrax: AwardVoteFantrax;
    nhl: AwardVoteNhl;
    db: AwardVoteDatabase;
    ownerSession: AwardVoteOwnerSession;
}
