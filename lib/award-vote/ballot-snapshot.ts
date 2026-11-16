// The ballot's awards and their candidates, read only from a season's frozen snapshot: what the admin's preview and
// the owners' ballot both show. It checks nothing about who asks; its callers do.
import { sql, type SQL } from 'drizzle-orm';
import { GM_OF_THE_YEAR, type BallotAward, type CreditedTeam, type PlayerAwardId, type PlayerCandidate, type TeamBallotAward, type TeamCandidate } from './model';
import type { AwardVoteDatabase } from './ports';
import { awardDefinition, PLAYER_AWARD_RULES, STAT_SETS } from './voted-awards';

type CandidateRow = Omit<PlayerCandidate, 'stats'> & { award: PlayerAwardId; stats: PlayerCandidate['stats'] };

/** each award's candidates from the snapshot in ballot order, best first by FPts in the award's first stat set */
export async function readBallotAwards(db: AwardVoteDatabase, seasonYear: number): Promise<BallotAward[]> {
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

/**
 * the name a ranked player goes by in `seasonYear`'s tallies and ballots: the snapshot's, which is frozen once voting
 * opens, then the archive's, then their ID (`playerId` is an SQL expression)
 */
export function rankedPlayerName(seasonYear: number | SQL, playerId: SQL): SQL {
    const year = typeof seasonYear === 'number' ? sql`${seasonYear}::int` : seasonYear;
    return sql`coalesce((select s.name from league.award_vote_players s where s.season_year = ${year} and s.player_id = ${playerId}),
                        (select p.name from league.players p where p.id = ${playerId}), ${playerId})`;
}

/**
 * GM of the Year on the ballot, from the snapshot: every team season taking part, under that season's identity
 * (season_teams) and owner, by name; null for a snapshot without them (none prepared, or no franchise taking part)
 */
export async function readTeamBallotAward(db: AwardVoteDatabase, seasonYear: number): Promise<TeamBallotAward | null> {
    const candidates = await db.rows<TeamCandidate>(sql`
        select st.team_season_id as "teamSeasonId", st.franchise_id as "franchiseId", st.name, st.abbreviation, st.logo,
               o.name as owner, c.summary
        from league.award_vote_team_seasons c
        join league.season_teams st on st.team_season_id = c.team_season_id
        join league.team_seasons t on t.id = c.team_season_id
        left join league.owners o on o.id = t.owner_id
        where c.season_year = ${seasonYear}
        order by st.name, st.team_season_id`);
    if (!candidates.length) return null;
    const { label, honor } = awardDefinition(GM_OF_THE_YEAR);
    return { award: GM_OF_THE_YEAR, label, honor, candidates };
}
