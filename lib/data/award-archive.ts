import { sql, type SQL } from 'drizzle-orm';
import { cached, rows } from './db';
import { leagueTags } from './cache-tags';
import { getGmOfTheYearWinners, publishedOnly, teamSeasonWinnerRows, type AwardWinner } from './league';
import { AWARD_CATALOGUE, expectedAwards, findAward, type AwardDecidedBy, type AwardDefinition } from '../awards';

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

/** a stored individual-award winner: the award's catalogue ID and the award page's row */
interface StoredWinner { award: string; winner: AwardWinner }

// Every stored individual-award winner, newest first, co-winners by name. The award table is joined only to find each
// row's catalogue award; a row the catalogue doesn't know is no award winner.
const getStoredWinners = cached(async (): Promise<StoredWinner[]> => {
    const stored = await rows<AwardWinner & { name: string }>(sql`
        select at.name, a.season_year as "Year", p.name as "Winner", p.id as "PlayerID", t.name as "Team", t.franchise_id as "TeamID",
               t.logo as "TeamLogo", ps.fpts::float8 as "FPts", ps.fpg::float8 as "FPG"
        from league.awards a
        join league.award_types at on at.id = a.award_type_id
        join league.players p on p.id = a.player_id
        left join league.season_teams t on t.team_season_id = a.team_season_id
        left join league.player_seasons ps on ps.player_id = a.player_id and ps.season_year = a.season_year
        order by a.season_year desc, p.name, p.id`);
    return stored.flatMap(({ name, ...winner }) => {
        const award = findAward(name);
        return award?.decidedBy === 'stored' ? [{ award: award.id, winner }] : [];
    });
}, 'award-archive-stored', [leagueTags.awards]);

/** the stored individual-award winners in published seasons, newest first */
const publishedStoredWinners = () => publishedOnly(getStoredWinners(), stored => stored.winner.Year);

/** each way an award is decided, and its winners in published seasons, newest first */
const SOURCES: Record<AwardDecidedBy, (award: AwardDefinition) => Promise<AwardWinner[]>> = {
    final: () => publishedOnly(getTeamSeasonWinners('final'), winner => winner.Year),
    points: () => publishedOnly(getTeamSeasonWinners('points'), winner => winner.Year),
    stored: async award => (await publishedStoredWinners()).filter(stored => stored.award === award.id).map(stored => stored.winner),
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

export interface PlayerHonors {
    /** the individual awards the player won in published seasons, oldest first, each season's in catalogue order */
    awards: { id: string; name: string; label: string; honor: string; year: number }[];
    /** the Jagr Cup rings: each season the player was on the champion's championship roster, under the champion's name, oldest first */
    championships: { season: number; team: string }[];
}

// the ring's team is the champion, even if the player was dropped before season end
const getChampionships = cached(
    (id: string) => rows<PlayerHonors['championships'][number]>(sql`
        select c.season_year as season, t.name as team
        from league.championship_rosters c
        join league.season_results r on r.season_year = c.season_year
        join league.season_teams t on t.team_season_id = r.champion_team_season_id
        where c.player_id = ${id}
        order by c.season_year`),
    'award-archive-championships',
    [leagueTags.players],
);

const catalogueOrder = (id: string) => AWARD_CATALOGUE.findIndex(award => award.id === id);

/** a player's individual awards and Jagr Cup rings, as the player page and trophy shelf show them */
export async function playerHonors(id: string): Promise<PlayerHonors> {
    const [stored, championships] = await Promise.all([publishedStoredWinners(), getChampionships(id)]);
    const awards = stored.filter(({ winner }) => winner.PlayerID === id)
        .sort((a, b) => a.winner.Year - b.winner.Year || catalogueOrder(a.award) - catalogueOrder(b.award))
        .map(({ award: awardId, winner }) => {
            const award = findAward(awardId)!;
            return { id: award.id, name: award.name, label: award.label, honor: award.honor, year: winner.Year };
        });
    return { awards, championships };
}

export interface SeasonAwards {
    /** the awards the season should have stored winners for, in catalogue order */
    expected: AwardDefinition[];
    /**
     * every stored winner of the season, published or not, in catalogue order then by name, co-winners each a row; the
     * player's season line and the team the award credits (a published award vote's may not be the end-of-season one)
     */
    winners: { award: string; player: { id: string; name: string; positions: string; fpts: number; team: string } }[];
}

/** a season's stored individual-award winners and the awards it is expected to have; null for an unknown season. Never cached, for the admin. */
export async function seasonAwards(year: number): Promise<SeasonAwards | null> {
    const [season] = await rows<{ playoffStatus: string }>(sql`select playoff_status as "playoffStatus" from league.seasons where year = ${year}`);
    if (!season) return null;
    const stored = await rows<{ name: string; id: string; player: string; positions: string; fpts: number; team: string }>(sql`
        select at.name, p.id, p.name as player, coalesce(array_to_string(ps.positions, ', '), '') as positions,
               coalesce(ps.fpts, 0)::float8 as fpts, coalesce(t.abbreviation, 'FA') as team
        from league.awards a
        join league.award_types at on at.id = a.award_type_id
        join league.players p on p.id = a.player_id
        left join league.player_seasons ps on ps.player_id = a.player_id and ps.season_year = a.season_year
        left join league.team_seasons t on t.id = coalesce(a.team_season_id, ps.team_season_id)
        where a.season_year = ${year}
        order by p.name, p.id`);
    const winners = stored.flatMap(({ name, player, ...row }) => {
        const award = findAward(name);
        return award?.decidedBy === 'stored' ? [{ award: award.id, player: { id: row.id, name: player, positions: row.positions, fpts: row.fpts, team: row.team } }] : [];
    }).sort((a, b) => catalogueOrder(a.award) - catalogueOrder(b.award));
    return { expected: expectedAwards(season.playoffStatus === 'complete'), winners };
}
