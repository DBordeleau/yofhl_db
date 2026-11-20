import { sql, type SQL } from 'drizzle-orm';
import { cached } from './db';
import { leagueTags } from './cache-tags';
import { getAwardWinners, getGmOfTheYearWinners, publishedOnly, teamSeasonWinnerRows, type AwardWinner } from './league';
import { findAward, type AwardDecidedBy, type AwardDefinition } from '../awards';

// The award archive: who won each award (docs/adr/0009-awards-are-catalogue-ids.md). It is the one place that knows
// which source decides an award's winners; callers ask by award and never branch on its ID.

/** the team awards worked out from team seasons: each one's winners as a condition on team season `t`, and the cache tag they expire with */
const TEAM_SEASON_SOURCES = {
    // the season results' champion: the team season that won the Final
    final: { criterion: sql`exists (select 1 from league.season_results r where r.champion_team_season_id = t.id)`, tag: leagueTags.cups },
    // The Prime Minister's Trophy rule (GLOSSARY.md), its one copy: no other franchise in the season has as many or more
    // points. A season still being played has a points leader but no winner until it is published (see winners).
    points: {
        criterion: sql`not exists (select 1 from league.team_seasons other
            where other.season_year = t.season_year and other.franchise_id <> t.franchise_id and other.fpts_for >= t.fpts_for)`,
        tag: leagueTags.pointsLeaders,
    },
} satisfies Partial<Record<AwardDecidedBy, { criterion: SQL; tag: string }>>;
type TeamSeasonSource = keyof typeof TEAM_SEASON_SOURCES;

const getTeamSeasonWinners = cached(
    (source: TeamSeasonSource) => teamSeasonWinnerRows(TEAM_SEASON_SOURCES[source].criterion),
    'award-archive-team-seasons',
    (source: TeamSeasonSource) => [TEAM_SEASON_SOURCES[source].tag],
);

/** each way an award is decided, and its winners in published seasons, newest first */
const SOURCES: Record<AwardDecidedBy, (award: AwardDefinition) => Promise<AwardWinner[]>> = {
    final: () => publishedOnly(getTeamSeasonWinners('final'), winner => winner.Year),
    points: () => publishedOnly(getTeamSeasonWinners('points'), winner => winner.Year),
    stored: async award => (await getAwardWinners(award.name))?.winners ?? [],
    teamVote: () => getGmOfTheYearWinners(),
};

/**
 * An award's winners in published seasons, newest first, in the award page's row shape: a team award's carry the team
 * season (name, franchise, owner, logo, points and record), an individual award's the player. Null for an award the
 * catalogue doesn't know, found by ID, name or label (findAward).
 */
export function winners(award: AwardDefinition): Promise<AwardWinner[]>;
export function winners(award: string): Promise<AwardWinner[] | null>;
export async function winners(award: AwardDefinition | string): Promise<AwardWinner[] | null> {
    const definition = typeof award === 'string' ? findAward(award) : award;
    return definition ? SOURCES[definition.decidedBy](definition) : null;
}
