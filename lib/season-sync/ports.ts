// What the season sync reads from Fantrax. Production binds it to the Fantrax client in season-sync.ts; tests use
// the in-memory binding in memory-fantrax.ts. Every read checks its own response's shape and rejects a failed or
// malformed one; the season sync then checks the reads against the archive before it writes anything.

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

export interface SeasonSyncFantrax {
    leagueInfo(leagueId: string): Promise<FantraxLeagueInfo>;
    standings(leagueId: string): Promise<FantraxStanding[]>;
}

export interface SeasonSyncPorts {
    fantrax: SeasonSyncFantrax;
}
