// A ballot's rules, pure and browser-safe so the ballot page can show what is left before submitting: which awards
// a ballot ranks and how deep, reading rankings sent by the browser, and what keeps a ballot from being complete.
// The candidate lists come from the frozen snapshot (ballot-snapshot.ts).
import {
    GM_OF_THE_YEAR, teamCandidateId, VOTED_AWARD_POINTS,
    type BallotAward, type BallotRankings, type PlayerCandidate, type TeamBallotAward, type VotedAwardId,
} from './model';

/** one award a ballot ranks: its candidates (as BallotRankings has them) and how many ranks it has */
export interface RankedAward {
    award: VotedAwardId;
    /** the award's depth, or every candidate when it has fewer */
    depth: number;
    candidates: readonly string[];
}

/** what keeps one award of a ballot from being complete: its empty ranks (from 1) and candidates ranked twice */
export interface BallotProblem {
    award: VotedAwardId;
    emptyRanks: number[];
    repeated: string[];
}

/**
 * how many ranks `award` has on a ballot with `candidates` candidates: its depth (VOTED_AWARD_POINTS), or every
 * candidate when it has fewer, since it can't be filled that deep
 */
export const ballotDepth = (award: VotedAwardId, candidates: number) => Math.min(VOTED_AWARD_POINTS[award].length, candidates);

/** GM of the Year as one franchise's owner ranks it: every candidate but its own team season, and how deep */
export interface OwnerTeamAward extends TeamBallotAward {
    depth: number;
}

/**
 * GM of the Year as franchise `franchiseId`'s ballot has it, without the franchise's own team season (all of them
 * with no franchise); null when it has no candidate left
 */
export function ownerTeamAward(award: TeamBallotAward | null, franchiseId: number | null): OwnerTeamAward | null {
    const candidates = award?.candidates.filter(candidate => candidate.franchiseId !== franchiseId) ?? [];
    return award && candidates.length ? { ...award, candidates, depth: ballotDepth(GM_OF_THE_YEAR, candidates.length) } : null;
}

/** the awards a ballot ranks, in ballot order: every individual award with a candidate, then GM of the Year if it has one */
export function rankedAwards(ballot: BallotAward[], teamAward: OwnerTeamAward | null): RankedAward[] {
    return [
        ...ballot.filter(award => award.candidates.length > 0).map(award => ({
            award: award.award, depth: ballotDepth(award.award, award.candidates.length), candidates: award.candidates.map(candidate => candidate.playerId),
        })),
        ...teamAward ? [{
            award: teamAward.award, depth: teamAward.depth, candidates: teamAward.candidates.map(candidate => teamCandidateId(candidate.teamSeasonId)),
        }] : [],
    ];
}

/** whether rankings sent by the browser rank team season `teamSeasonId` for GM of the Year */
export function ranksTeamSeason(value: unknown, teamSeasonId: number): boolean {
    const ranks = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[GM_OF_THE_YEAR] : undefined;
    return Array.isArray(ranks) && ranks.includes(teamCandidateId(teamSeasonId));
}

/**
 * `value` as rankings of `awards`, each award's ranks filled out to its depth with empty ones, or null when it isn't
 * rankings of them: an award not on the ballot, more ranks than the award has, or a rank that isn't empty or one of
 * the award's candidates
 */
export function readRankings(value: unknown, awards: readonly RankedAward[]): BallotRankings | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const rankings: BallotRankings = {};
    for (const [key, ranks] of Object.entries(value)) {
        const award = awards.find(item => item.award === key);
        if (!award || !Array.isArray(ranks) || ranks.length > award.depth) return null;
        if (!ranks.every(rank => rank === null || (typeof rank === 'string' && award.candidates.includes(rank)))) return null;
        rankings[award.award] = Array.from({ length: award.depth }, (_, index) => ranks[index] ?? null);
    }
    return rankings;
}

/** what keeps `rankings` from being a complete ballot, by award in ballot order; none for a complete ballot */
export function ballotProblems(rankings: BallotRankings, awards: readonly RankedAward[]): BallotProblem[] {
    return awards.flatMap(({ award, depth }) => {
        const ranks = rankings[award] ?? [];
        const emptyRanks = Array.from({ length: depth }, (_, index) => index + 1).filter(rank => !ranks[rank - 1]);
        const filled = ranks.filter((rank): rank is string => !!rank);
        const repeated = [...new Set(filled.filter((rank, index) => filled.indexOf(rank) !== index))];
        return emptyRanks.length || repeated.length ? [{ award, emptyRanks, repeated }] : [];
    });
}

/** one award on the ballot an owner reads, its candidates being the list at `list` */
export interface OwnerBallotAward extends Omit<BallotAward, 'candidates'> {
    depth: number;
    /** the index of its candidates in the ballot's lists */
    list: number;
}

/**
 * The ballot's awards with candidates, each candidate list kept once: awards with the same candidates (the Wayne
 * Gretzky Award and Le Magnifique) share it.
 */
export function shareCandidateLists(ballot: BallotAward[]): { awards: OwnerBallotAward[]; lists: PlayerCandidate[][] } {
    const lists: PlayerCandidate[][] = [];
    const keys: string[] = [];
    const awards = ballot.filter(award => award.candidates.length > 0).map(({ candidates, ...award }) => {
        const key = JSON.stringify(candidates);
        if (!keys.includes(key)) {
            keys.push(key);
            lists.push(candidates);
        }
        return { ...award, depth: ballotDepth(award.award, candidates.length), list: keys.indexOf(key) };
    });
    return { awards, lists };
}

/** an award on the ballot an owner reads with its candidates, as the candidate list shows it */
export const withCandidates = (award: OwnerBallotAward, lists: PlayerCandidate[][]): BallotAward & { depth: number } =>
    ({ ...award, candidates: lists[award.list] });
