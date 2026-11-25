// The NHL module's interface: who a player is in the NHL (their NHL identity) and their NHL record, parsed and
// keyed by season year. The HTTP adapter (create-nhl.ts) and the in-memory one (memory-nhl.ts) both implement it.
// Neither caches; callers decide how long to keep an answer and whether an NHL failure is forgiven.

/** the NHL's own ID for a player (`8475158`), as its player search and profiles name them (GLOSSARY.md) */
export type NhlIdentity = number;

/** a player to identify, with whatever the caller knows about them */
export interface IdentifyRequest {
    name: string;
    /** the player's Player ID: a verified identity for it wins over the NHL's player search */
    playerId?: string | null;
    /** Fantrax positions (`C`, `LW`, `D`, `G`...), when known, to narrow same-name players by position group */
    positions?: string[];
    /** the player's NHL team abbreviation, when known, to narrow same-name players by current or last team */
    nhlTeam?: string | null;
}

/**
 * One NHL regular-season line: the NHL's combined line for a season split between teams, or the team lines summed
 * when it gave none. Each stat is a number, or null when the NHL didn't give it.
 */
export interface NhlSeasonLine {
    games: number | null;
    goals: number | null;
    assists: number | null;
    points: number | null;
    wins: number | null;
    goalsAgainstAverage: number | null;
    savePercentage: number | null;
}

export interface NhlPlayer {
    nhlId: NhlIdentity;
    name: string;
    /** `YYYY-MM-DD`, or null when the NHL gave none */
    birthDate: string | null;
    /** the NHL's country code (`CAN`, `SWE`) */
    birthCountry: string | null;
    birthCity: string | null;
    /** an `https://` headshot URL */
    headshot: string | null;
    /** the NHL team abbreviation they're on now, or null when they're on none */
    team: string | null;
    /** the NHL's position code: `C`, `L`, `R`, `D` or `G` */
    position: string | null;
    /**
     * one regular-season line per season year in which they played in the NHL; null when the NHL gave no season
     * history at all, which is not the same as having no NHL seasons
     */
    seasons: Record<number, NhlSeasonLine> | null;
}

export interface Nhl {
    /** the player's NHL identity, or null when no NHL player, or more than one, matches */
    identify(player: IdentifyRequest): Promise<NhlIdentity | null>;
    /** the NHL's record of the player with this identity */
    player(nhlId: NhlIdentity): Promise<NhlPlayer>;
}

/** a person's age in whole years on `on` (`YYYY-MM-DD`), or null for a missing or malformed birth date */
export function ageOn(birthDate: string | null, on: string): number | null {
    if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
    const age = Number(on.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (on.slice(5, 10) < birthDate.slice(5, 10) ? 1 : 0);
    return age >= 0 && age < 100 ? age : null;
}
