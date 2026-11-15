// A season's award vote as the admin sees it before opening: whether the season may have one (or only a rehearsal),
// its state, whether preparing has finished, and once it has, the ballot exactly as owners will see it, read only
// from the frozen snapshot. Admin only: it returns rehearsals.
import { sql } from 'drizzle-orm';
import type { AwardVoteState, BallotAward, CreditedTeam, PlayerAwardId, PlayerCandidate, PrepareProgress } from './model';
import type { AwardVotePorts } from './ports';
import { awardVoteKind, type AwardVoteKind } from './rehearsal';
import { awardDefinition, PLAYER_AWARD_RULES, STAT_SETS } from './voted-awards';

export interface ReadPreviewInput {
    seasonYear: number;
}

export interface AwardVoteSummary {
    seasonYear: number;
    state: AwardVoteState;
    rehearsal: boolean;
    /** when the latest prepare started */
    prepareStartedAt: string;
    /** when the latest prepare finished, or null while it is unfinished */
    preparedAt: string | null;
}

export interface AwardVotePreview {
    /** whether the season may have a live award vote or only a rehearsal, or null for neither (and no panel) */
    kind: AwardVoteKind | null;
    /** null for a season never prepared */
    vote: AwardVoteSummary | null;
    /** the ballot's awards in order, or null until a prepare has finished */
    ballot: BallotAward[] | null;
}

type CandidateRow = Omit<PlayerCandidate, 'stats'> & { award: PlayerAwardId; stats: PlayerCandidate['stats'] };

export function createReadPreview({ db }: AwardVotePorts) {
    return async function readPreview({ seasonYear }: ReadPreviewInput): Promise<AwardVotePreview> {
        const [vote] = await db.rows<{ state: AwardVoteState; rehearsal: boolean; progress: PrepareProgress; preparedAt: number | null }>(sql`
            select state, rehearsal, prepare_progress as progress, (extract(epoch from prepared_at) * 1000)::float8 as "preparedAt"
            from league.award_votes where season_year = ${seasonYear}`);
        const kind = await awardVoteKind(db, seasonYear);
        if (!vote) return { kind, vote: null, ballot: null };
        const summary: AwardVoteSummary = {
            seasonYear, state: vote.state, rehearsal: vote.rehearsal, prepareStartedAt: vote.progress.startedAt,
            preparedAt: vote.preparedAt === null ? null : new Date(vote.preparedAt).toISOString(),
        };
        if (summary.preparedAt === null) return { kind, vote: summary, ballot: null };
        return { kind, vote: summary, ballot: await readBallot(seasonYear) };
    };

    /** each award's candidates from the snapshot, best first by FPts in the award's first stat set */
    async function readBallot(seasonYear: number): Promise<BallotAward[]> {
        const candidates = await db.rows<CandidateRow>(sql`
            select c.award, c.player_id as "playerId", p.name, p.positions, p.nhl_team as "nhlTeam",
                   case when t.team_season_id is null then null else jsonb_build_object(
                       'teamSeasonId', t.team_season_id, 'franchiseId', t.franchise_id, 'name', t.name, 'abbreviation', t.abbreviation, 'logo', t.logo
                   ) end as team,
                   coalesce((select jsonb_object_agg(s.stat_set, s.line) from league.award_vote_stats s
                             where s.season_year = c.season_year and s.player_id = c.player_id), '{}'::jsonb) as stats
            from league.award_vote_candidates c
            join league.award_vote_players p on p.season_year = c.season_year and p.player_id = c.player_id
            left join league.season_teams t on t.team_season_id = c.team_season_id
            where c.season_year = ${seasonYear}`);
        return PLAYER_AWARD_RULES.map(rule => {
            const definition = awardDefinition(rule.award);
            const [ranking] = rule.statSets;
            const points = (candidate: PlayerCandidate) => candidate.stats[ranking]?.points ?? -Infinity;
            return {
                award: rule.award, label: definition.label, honor: definition.honor, shown: rule.shown,
                statSets: rule.statSets.map(name => ({ name, label: STAT_SETS[name].label })),
                candidates: candidates.filter(candidate => candidate.award === rule.award)
                    .map(({ playerId, name, positions, nhlTeam, team, stats }): PlayerCandidate => ({
                        playerId, name, positions, nhlTeam, team: team as CreditedTeam | null,
                        stats: Object.fromEntries(rule.statSets.filter(name => stats[name]).map(name => [name, stats[name]])),
                    }))
                    .sort((a, b) => points(b) - points(a) || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId)),
            };
        });
    }
}
