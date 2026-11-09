// The live season source port: everything the live season module reads or writes. The production adapter
// (fantrax-source.ts) is Fantrax plus the saved snapshot, manual final weeks and Next's caches; tests use the
// in-memory adapter (memory-source.ts). Shapes here are already checked and in season years; Fantrax's own
// response formats stay in the HTTP client (fantrax-client.ts).
import type { RosterStats, ScheduledMatchup } from './model';

export interface SourceWeek {
    number: number;
    /** ISO timestamps */
    startDate: string;
    endDate: string;
}

/** Fantrax's own playoff settings. The league's format is config; these are only checked against it. */
export interface FantraxPlayoffs {
    numPlayoffTeams?: number;
    lastRegularSeasonPeriod?: number;
    firstPlayoffPeriod?: number;
}

/** The core snapshot: if it can't be loaded, the whole live season is unavailable. */
export interface SourceCore {
    fetchedAt: string;
    seasonYear: number;
    teams: { id: string; name: string }[];
    /** sorted by number */
    weeks: SourceWeek[];
    /** the lineup period the rosters belong to; Fantrax keeps it on a separate calendar from the weeks */
    lineupPeriod: SourceWeek | null;
    /** published matchups only: unseeded playoff slots are left out */
    schedule: { week: number; matchups: ScheduledMatchup[] }[];
    standings: { teamId: string; rank: number | null; record: string | null; points: number | null }[];
    rosters: Record<string, { id: string; position: string; status: string }[]>;
    players: Record<string, { name: string; position: string; team?: string }>;
    playoffs: FantraxPlayoffs;
}

/** what a capture reports back: enough to check Fantrax's playoff settings against the league's */
export type CapturedSeason = Pick<SourceCore, 'fetchedAt' | 'seasonYear' | 'weeks' | 'playoffs'>;

export interface SourceScores {
    fetchedAt: string;
    week: number;
    matchups: {
        away: { teamId: string; score: number; gamesPlayed: number };
        home: { teamId: string; score: number; gamesPlayed: number };
    }[];
}

export interface SourceLeaders {
    fetchedAt: string;
    players: { id: string; name: string; position: string; points: number; perGame: number | null; teamId: string | null; team: string }[];
}

/** a row of league.fantrax_teams */
export interface FantraxTeamRow {
    seasonYear: number;
    fantraxLeagueId: string;
    fantraxTeamId: string;
    franchiseId: number;
}

/** a franchise's current identity, from league.current_teams */
export interface FranchiseIdentity {
    id: number;
    name: string;
    abbreviation: string;
    logo: string | null;
    owner: string | null;
}

export interface LiveSeasonSource {
    /** the latest season's rows of league.fantrax_teams */
    fantraxTeams(): Promise<FantraxTeamRow[]>;
    franchises(): Promise<FranchiseIdentity[]>;
    /** archive player IDs, as stored (some are wrapped in asterisks) */
    archivedPlayerIds(): Promise<string[]>;
    /** `fresh` skips the saved snapshot and the caches */
    core(options: { fresh: boolean }): Promise<SourceCore>;
    weekScores(week: SourceWeek, core: Pick<SourceCore, 'fetchedAt'>): Promise<SourceScores>;
    scoringLeaders(seasonYear: number): Promise<SourceLeaders>;
    rosterStats(seasonYear: number): Promise<RosterStats>;
    manualFinalWeeks(seasonYear: number): Promise<number[]>;
    setManualFinalWeek(seasonYear: number, week: number, final: boolean): Promise<void>;
    /** Capture every Fantrax request, save the snapshot and publish it. Publishes only if every request succeeds. */
    capture(): Promise<CapturedSeason>;
}
