// The Teemu Trophy's rookie review, as the admin sees it once a prepare has finished: the rookies the NHL lookup and
// the Calder rule found, the young players the NHL had no match for, the young players whose NHL lookup failed, and
// the young players the rule ruled out (with any player the admin added who was never looked up), each with the
// admin's change and whether they are on the ballot. Only players at the candidate floor are looked up. Best
// regular-season FPts first.
import { sql } from 'drizzle-orm';
import { lookupFailed, type AwardVoteState, type PrepareProgress, type RookieAdjustments, type RookieLookup } from './model';
import type { AwardVotePorts } from './ports';
import { ROOKIE_AWARD, ROOKIE_STAT_SET } from './voted-awards';

export interface ReadRookieReviewInput {
    seasonYear: number;
}

export interface RookieReviewPlayer {
    playerId: string;
    name: string;
    positions: string[];
    nhlTeam: string | null;
    /** age now, by Fantrax's age column */
    age: number | null;
    /** the NHL player they were matched to, or null for no match (or never looked up, or a failed lookup) */
    nhlId: number | null;
    /** the admin's change: added to the rookies, removed from them, or none */
    adjustment: 'added' | 'removed' | null;
    /** whether they are a Teemu Trophy candidate */
    candidate: boolean;
}

export interface RookieReview {
    /** whether the admin can still add or remove players: only while the vote is prepared, before opening */
    adjustable: boolean;
    /** the Calder-eligible rookies by their NHL record */
    rookies: RookieReviewPlayer[];
    /** the young players no NHL player matched */
    unmatched: RookieReviewPlayer[];
    /** the young players whose NHL lookup failed on every attempt: the NHL couldn't be reached for them */
    failed: RookieReviewPlayer[];
    /** the young players whose NHL record rules them out, and any player the admin added who was not looked up */
    ineligible: RookieReviewPlayer[];
}

type PlayerRow = Omit<RookieReviewPlayer, 'nhlId' | 'adjustment'>;

export function createReadRookieReview({ db }: AwardVotePorts) {
    return async function readRookieReview({ seasonYear }: ReadRookieReviewInput): Promise<RookieReview | null> {
        const [vote] = await db.rows<{ state: AwardVoteState; progress: PrepareProgress; adjustments: RookieAdjustments; finished: boolean }>(sql`
            select state, prepare_progress as progress, rookie_adjustments as adjustments, prepared_at is not null as finished
            from league.award_votes where season_year = ${seasonYear}`);
        if (!vote?.finished) return null;
        const lookups: Record<string, RookieLookup> = vote.progress.rookies ?? {};
        const { added, removed } = vote.adjustments;
        const reviewed = [...new Set([...Object.keys(lookups), ...added, ...removed])];
        const players = await db.rows<PlayerRow>(sql`
            select p.player_id as "playerId", p.name, p.positions, p.nhl_team as "nhlTeam", p.age,
                   exists (select 1 from league.award_vote_candidates c
                           where c.season_year = p.season_year and c.player_id = p.player_id and c.award = ${ROOKIE_AWARD}) as candidate
            from league.award_vote_players p
            left join league.award_vote_stats s on s.season_year = p.season_year and s.player_id = p.player_id and s.stat_set = ${ROOKIE_STAT_SET}
            where p.season_year = ${seasonYear} and p.player_id in (select jsonb_array_elements_text(${JSON.stringify(reviewed)}::jsonb))
            order by (s.line ->> 'points')::numeric desc nulls last, p.name, p.player_id`);
        const review: RookieReview = { adjustable: vote.state === 'prepared', rookies: [], unmatched: [], failed: [], ineligible: [] };
        for (const player of players) {
            const lookup = lookups[player.playerId];
            const adjustment = added.includes(player.playerId) ? 'added' : removed.includes(player.playerId) ? 'removed' : null;
            const matched = lookup && !lookupFailed(lookup) ? lookup : null;
            const entry: RookieReviewPlayer = { ...player, nhlId: matched?.nhlId ?? null, adjustment };
            (matched?.eligible ? review.rookies : lookup === null ? review.unmatched : lookupFailed(lookup) ? review.failed : review.ineligible).push(entry);
        }
        return review;
    };
}
