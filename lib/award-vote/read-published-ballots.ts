// The public read of a season's ballots, for its ballots page, once its award vote is published: every franchise that
// took part (voting-franchises.ts), under that season's identity (season_teams) and owner, with its submitted rankings named from the
// snapshot. A void ballot shows with its reason; a franchise with no submitted ballot shows as not having voted. Drafts
// never show. Nothing before publishing, and never a rehearsal. Cached until the season's vote is published.
import { sql } from 'drizzle-orm';
import { leagueTags } from '@/lib/data/cache-tags';
import { cached } from '@/lib/data/db';
import type { BallotRankings, CreditedTeam, PlayerAwardId } from './model';
import type { AwardVotePorts } from './ports';
import { publishedVote } from './read-published-tallies';
import { awardDefinition, PLAYER_AWARD_RULES } from './voted-awards';
import { votingFranchise } from './voting-franchises';

export interface ReadPublishedBallotsInput {
    seasonYear: number;
}

/** a ranked player on a public ballot; null for a rank left empty */
export type PublicRankedPlayer = { playerId: string; name: string } | null;

/** one franchise's ballot on the ballots page */
export interface PublicBallot {
    /** the franchise as it was that season */
    team: CreditedTeam;
    /** that season's owner's name, or null when the archive has none */
    owner: string | null;
    /** whether the franchise submitted a ballot */
    voted: boolean;
    /** why the ballot is void, or null when it counts (or there is none) */
    voidReason: string | null;
    /** each award it ranked, in ballot order; empty when it didn't vote */
    rankings: { award: PlayerAwardId; players: PublicRankedPlayer[] }[];
}

/** an award on the season's ballots, and how deep it was ranked */
export interface PublicBallotAward {
    award: PlayerAwardId;
    label: string;
    depth: number;
}

export type ReadPublishedBallotsRejection =
    /** no award vote for the season, or not published yet */
    'not-published';

export type ReadPublishedBallotsResult = {
    ok: true;
    seasonYear: number;
    /** the ballots that counted: submitted and not void */
    counted: number;
    /** in ballot order */
    awards: PublicBallotAward[];
    /** ordered by the season's team names */
    ballots: PublicBallot[];
} | { ok: false; reason: ReadPublishedBallotsRejection };

type BallotRow = CreditedTeam & { owner: string | null; rankings: BallotRankings | null; voidReason: string | null };

export function createReadPublishedBallots({ db }: AwardVotePorts) {
    const read = cached(async (seasonYear: number): Promise<ReadPublishedBallotsResult> => {
        const [vote] = await db.rows<{ published: boolean }>(sql`
            select ${publishedVote} as published from league.award_votes v where v.season_year = ${seasonYear}`);
        if (!vote?.published) return { ok: false, reason: 'not-published' };
        const [teams, players] = await Promise.all([
            db.rows<BallotRow>(sql`
                select st.team_season_id as "teamSeasonId", st.franchise_id as "franchiseId", st.name, st.abbreviation, st.logo,
                       o.name as owner, b.submitted as rankings, b.void_reason as "voidReason"
                from league.season_teams st
                join league.team_seasons t on t.id = st.team_season_id
                left join league.owners o on o.id = t.owner_id
                left join league.award_vote_ballots b
                       on b.season_year = st.season_year and b.franchise_id = st.franchise_id and b.submitted is not null
                where st.season_year = ${seasonYear} and ${votingFranchise(sql`st.franchise_id`, seasonYear)}
                order by st.name, st.franchise_id`),
            // the snapshot names every candidate; the archive or the ID stand in without it
            db.rows<{ id: string; name: string }>(sql`
                select r.id, coalesce(s.name, p.name, r.id) as name
                from (select distinct jsonb_array_elements_text(ranks.value) as id
                      from league.award_vote_ballots b, jsonb_each(b.submitted) ranks
                      where b.season_year = ${seasonYear} and b.submitted is not null) r
                left join league.award_vote_players s on s.season_year = ${seasonYear} and s.player_id = r.id
                left join league.players p on p.id = r.id`),
        ]);
        const names = new Map(players.map(player => [player.id, player.name]));
        const awards = PLAYER_AWARD_RULES.map(({ award }): PublicBallotAward => ({
            award, label: awardDefinition(award).label,
            depth: Math.max(0, ...teams.map(team => team.rankings?.[award]?.length ?? 0)),
        })).filter(award => award.depth > 0);
        return {
            ok: true, seasonYear,
            counted: teams.filter(team => team.rankings && team.voidReason === null).length,
            awards,
            ballots: teams.map(({ rankings, owner, voidReason, ...team }): PublicBallot => ({
                team, owner, voted: rankings !== null, voidReason,
                rankings: awards.flatMap(({ award }) => {
                    const ranked = rankings?.[award];
                    return ranked ? [{ award, players: ranked.map(id => id === null ? null : { playerId: id, name: names.get(id) ?? id }) }] : [];
                }),
            })),
        };
    }, 'award-vote-published-ballots', (seasonYear: number) => [leagueTags.awardVoteBallots(seasonYear)]);
    return async function readPublishedBallots({ seasonYear }: ReadPublishedBallotsInput): Promise<ReadPublishedBallotsResult> {
        return read(seasonYear);
    };
}
