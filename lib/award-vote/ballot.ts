// A ballot's rules, pure and browser-safe so the ballot page can show what is left before submitting: which awards
// a ballot ranks and how deep, reading rankings sent by the browser, and what keeps a ballot from being complete.
// The candidate lists come from the frozen snapshot (ballot-snapshot.ts).
import { PLAYER_AWARD_DEPTH, type BallotAward, type BallotRankings, type PlayerAwardId, type PlayerCandidate } from './model';

/** one award a ballot ranks: its candidates' player IDs and how many ranks it has */
export interface RankedAward {
    award: PlayerAwardId;
    /** five, or every candidate when the award has fewer */
    depth: number;
    candidates: readonly string[];
}

/** what keeps one award of a ballot from being complete: its empty ranks (from 1) and candidates ranked twice */
export interface BallotProblem {
    award: PlayerAwardId;
    emptyRanks: number[];
    repeated: string[];
}

/** how many ranks an award with `candidates` candidates has on a ballot */
export const ballotDepth = (candidates: number) => Math.min(PLAYER_AWARD_DEPTH, candidates);

/** the awards a ballot ranks, in ballot order: every award with a candidate */
export function rankedAwards(ballot: BallotAward[]): RankedAward[] {
    return ballot.filter(award => award.candidates.length > 0).map(award => ({
        award: award.award, depth: ballotDepth(award.candidates.length), candidates: award.candidates.map(candidate => candidate.playerId),
    }));
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
        return { ...award, depth: ballotDepth(candidates.length), list: keys.indexOf(key) };
    });
    return { awards, lists };
}

/** an award on the ballot an owner reads with its candidates, as the candidate list shows it */
export const withCandidates = (award: OwnerBallotAward, lists: PlayerCandidate[][]): BallotAward & { depth: number } =>
    ({ ...award, candidates: lists[award.list] });
