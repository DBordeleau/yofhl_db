// The award vote's stored shapes and what its reads return. Pure types and constants, free of server imports, so
// db/schema.ts and client components can use them.

/** an award vote's state (GLOSSARY.md, "Award vote"); "locked" is not stored: it is open with the ballot lock past */
export type AwardVoteState = 'prepared' | 'open' | 'scored' | 'published';

/** the first season year with an award vote; the season before the latest may only be rehearsed */
export const FIRST_AWARD_VOTE_SEASON = 2027;

/** the individual voted awards, by their id in the award catalogue (lib/awards.ts) */
export const PLAYER_AWARD_IDS = ['wayne-gretzky', 'le-magnifique', 'bobby-orr', 'hasek', 'teemu-selanne', 'danny-briere'] as const;
export type PlayerAwardId = typeof PLAYER_AWARD_IDS[number];

/** the voted award for a franchise's season (GLOSSARY.md, "GM of the Year"), by its id in the award catalogue */
export const GM_OF_THE_YEAR = 'gm-of-the-year';
export type TeamAwardId = typeof GM_OF_THE_YEAR;

/** every voted award, in ballot order: the individual awards, then GM of the Year */
export const VOTED_AWARD_IDS = [...PLAYER_AWARD_IDS, GM_OF_THE_YEAR] as const;
export type VotedAwardId = typeof VOTED_AWARD_IDS[number];

const PLAYER_AWARD_POINTS = [10, 7, 5, 3, 1] as const;
/**
 * The points each rank of a voted award is worth on a ballot, first place first (GLOSSARY.md, "Tally"): five deep for
 * 10, 7, 5, 3 and 1 for an individual award, three deep for 5, 3 and 1 for GM of the Year. An award's depth is how
 * many ranks it has. An award with fewer eligible candidates than that (the Teemu Trophy in a thin rookie year, the
 * Danny Briere Award's finalists) can't be filled that deep, so it ranks every candidate it has, worth the first
 * points, and a complete ballot means every rank it has filled.
 */
export const VOTED_AWARD_POINTS: Readonly<Record<VotedAwardId, readonly number[]>> = {
    'wayne-gretzky': PLAYER_AWARD_POINTS,
    'le-magnifique': PLAYER_AWARD_POINTS,
    'bobby-orr': PLAYER_AWARD_POINTS,
    hasek: PLAYER_AWARD_POINTS,
    'teemu-selanne': PLAYER_AWARD_POINTS,
    'danny-briere': PLAYER_AWARD_POINTS,
    [GM_OF_THE_YEAR]: [5, 3, 1],
};

/**
 * A ballot's rankings: for each voted award, its candidates from first place down: an individual award's player
 * IDs, GM of the Year's team season IDs as decimal strings (teamCandidateId). A draft may leave a rank empty (null)
 * or leave an award out; a submitted ballot fills every rank of every award on it.
 */
export type BallotRankings = Partial<Record<VotedAwardId, (string | null)[]>>;

/** a GM of the Year candidate as a ballot ranks it: its team season's ID as a decimal string */
export const teamCandidateId = (teamSeasonId: number) => String(teamSeasonId);

/** the longest reason the admin may give for voiding a ballot, in characters: room for a few sentences, published with it */
export const VOID_REASON_LENGTH = 500;

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
    /** the NHL lookup of each young player at the candidate floor looked up so far for the Teemu Trophy, by player ID */
    rookies?: Record<string, RookieLookup>;
    /**
     * Everyone on a finalist's roster outside the minors on any day of the Final, by player ID, each with the team
     * season of the finalist credited with them; absent until the Final's rosters are read.
     */
    finalRosters?: Record<string, number>;
}

/**
 * A young player's NHL lookup: their NHL match and whether the Calder rule (calder.ts) admits them; null when no NHL
 * player matches; or a lookup that failed (the NHL couldn't be reached, or answered unexpectedly) on each of its
 * attempts so far. Progress stored before failed lookups were kept apart has null for those too.
 */
export type RookieLookup = { nhlId: number; eligible: boolean } | null | FailedLookup;
export interface FailedLookup {
    failedAttempts: number;
}

/** whether a young player's NHL lookup failed */
export const lookupFailed = (lookup: RookieLookup | undefined): lookup is FailedLookup => !!lookup && 'failedAttempts' in lookup;

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

/**
 * How far a team season went in the championship bracket: won the Final, lost it, lost in the Semifinals, lost in a
 * round before them (the Quarterfinals, or earlier in a season with more rounds), or never reached the bracket.
 */
export type PlayoffFinish = 'champion' | 'finalist' | 'semifinalist' | 'quarterfinalist' | 'missed';

/** one team season's results, as GM of the Year's summary shows them */
export interface TeamSeasonLine {
    wins: number;
    losses: number;
    ties: number;
    fptsFor: number;
    playoffFinish: PlayoffFinish;
}

/** how a franchise's season went beside the season before, frozen when the award vote is prepared */
export interface TeamSummary {
    season: TeamSeasonLine;
    /** null when the franchise didn't play the season before */
    previous: TeamSeasonLine | null;
}

/** a GM of the Year candidate: a team season, under that season's identity and owner, from the frozen snapshot */
export interface TeamCandidate extends CreditedTeam {
    /** that season's owner's name, or null when the archive has none */
    owner: string | null;
    summary: TeamSummary;
}

/** GM of the Year on the ballot: every franchise taking part, by that season's team name */
export interface TeamBallotAward {
    award: TeamAwardId;
    label: string;
    honor: string;
    candidates: TeamCandidate[];
}
