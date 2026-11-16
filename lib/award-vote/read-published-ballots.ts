// The public read of a season's ballots, for its ballots page, once its award vote is published: every franchise that
// took part (voting-franchises.ts), under that season's identity (season_teams) and owner, with its submitted rankings:
// players named from the snapshot, and GM of the Year's team seasons under their identity that season. A void ballot shows with its reason; a franchise with no submitted ballot shows as not having voted. Drafts
// never show. Nothing before publishing, and never a rehearsal. Cached until the season's vote is published.
import { sql } from 'drizzle-orm';
import { leagueTags } from '@/lib/data/cache-tags';
import { cached } from '@/lib/data/db';
import { GM_OF_THE_YEAR, VOTED_AWARD_IDS, type BallotRankings, type CreditedTeam, type PlayerAwardId, type TeamAwardId, type VotedAwardId } from './model';
import { rankedPlayerName, seasonOwner, seasonTeamColumns } from './ballot-snapshot';
import type { AwardVotePorts } from './ports';
import { publishedVote } from './published-vote';
import { awardDefinition } from './voted-awards';
import { votingFranchise } from './voting-franchises';

export interface ReadPublishedBallotsInput {
    seasonYear: number;
}

/** a ranked player on a public ballot; null for a rank left empty */
export type PublicRankedPlayer = { playerId: string; name: string } | null;

/** a ranked team season on a public ballot, as it was that season; null for a rank left empty */
export type PublicRankedTeam = CreditedTeam | null;

/** one award a public ballot ranked */
export type PublicBallotRanking = { award: PlayerAwardId; players: PublicRankedPlayer[] } | { award: TeamAwardId; teams: PublicRankedTeam[] };

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
    rankings: PublicBallotRanking[];
}

/** an award on the season's ballots, and how deep it was ranked */
export interface PublicBallotAward {
    award: VotedAwardId;
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
        const [teams, players, rankedTeams] = await Promise.all([
            db.rows<BallotRow>(sql`
                select ${seasonTeamColumns}, o.name as owner, b.submitted as rankings, b.void_reason as "voidReason"
                from league.season_teams st
                ${seasonOwner}
                left join league.award_vote_ballots b
                       on b.season_year = st.season_year and b.franchise_id = st.franchise_id and b.submitted is not null
                where st.season_year = ${seasonYear} and ${votingFranchise(sql`st.franchise_id`, seasonYear)}
                order by st.name, st.franchise_id`),
            db.rows<{ id: string; name: string }>(sql`
                select r.id, ${rankedPlayerName(seasonYear, sql`r.id`)} as name
                from (select distinct jsonb_array_elements_text(ranks.value) as id
                      from league.award_vote_ballots b, jsonb_each(b.submitted) ranks
                      where b.season_year = ${seasonYear} and b.submitted is not null and ranks.key <> ${GM_OF_THE_YEAR}) r`),
            db.rows<CreditedTeam>(sql`
                select ${seasonTeamColumns}
                from league.season_teams st
                where st.team_season_id in (select jsonb_array_elements_text(b.submitted -> ${GM_OF_THE_YEAR})::int
                                            from league.award_vote_ballots b
                                            where b.season_year = ${seasonYear} and b.submitted is not null)`),
        ]);
        const names = new Map(players.map(player => [player.id, player.name]));
        const seasonTeams = new Map(rankedTeams.map(team => [String(team.teamSeasonId), team]));
        const awards = VOTED_AWARD_IDS.map((award): PublicBallotAward => ({
            award, label: awardDefinition(award).label,
            depth: Math.max(0, ...teams.map(team => team.rankings?.[award]?.length ?? 0)),
        })).filter(award => award.depth > 0);
        return {
            ok: true, seasonYear,
            counted: teams.filter(team => team.rankings && team.voidReason === null).length,
            awards,
            ballots: teams.map(({ rankings, owner, voidReason, ...team }): PublicBallot => ({
                team, owner, voted: rankings !== null, voidReason,
                rankings: awards.flatMap(({ award }): PublicBallotRanking[] => {
                    const ranked = rankings?.[award];
                    if (!ranked) return [];
                    if (award === GM_OF_THE_YEAR) return [{ award, teams: ranked.map(id => id === null ? null : seasonTeams.get(id) ?? null) }];
                    return [{ award, players: ranked.map(id => id === null ? null : { playerId: id, name: names.get(id) ?? id }) }];
                }),
            })),
        };
    }, 'award-vote-published-ballots', (seasonYear: number) => [leagueTags.awardVoteBallots(seasonYear)]);
    return async function readPublishedBallots({ seasonYear }: ReadPublishedBallotsInput): Promise<ReadPublishedBallotsResult> {
        return read(seasonYear);
    };
}
