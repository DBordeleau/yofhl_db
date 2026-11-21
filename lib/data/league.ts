import { sql, type SQL } from 'drizzle-orm';
import { clampPage, isPositiveInt4, MAX_ID_LENGTH, MAX_LEADERBOARD_PAGE } from './bounds';
import { cached, rows } from './db';
import { leagueTags } from './cache-tags';
import type { SeasonIdentity } from '../team-identity';
import { isPublished, seasonArchive } from '../seasons';
import { AWARD_CATALOGUE, getAwardDefinition, listedAwards, type AwardDefinition } from '../awards';
import { GM_OF_THE_YEAR } from '../award-vote/model';
import { publishedTeamAwardWinners } from '../award-vote/published-vote';

// Every query the site makes. Each is cached until the next import or admin edit (see ./db).
// Field names in PascalCase match what the existing table components already expect.

export const PAGE_SIZE = 25;

export interface BannerSeason {
    year: number;
    playoffStatus: 'complete' | 'cancelled';
    team: string | null;
    abbreviation: string | null;
    owner: string | null;
    logo: string | null;
    franchiseId: number | null;
}

export interface LeaderRow {
    ID: string;
    Player: string;
    Position: string;
    FPts: number;
    FPG: number;
    Year?: number;
    YOFHLTeam?: string;
    TeamID?: string | null;
    teamName?: string | null;
    teamLogo?: string | null;
    hasAward?: boolean;
    hasMultipleAwards?: boolean;
    Champion?: boolean;
    ChampionshipsWon?: number;
}

export interface LeaderboardPage {
    rows: LeaderRow[];
    page: number;
    pages: number;
    total: number;
}

export interface AwardType {
    name: string;
    label: string;
    description: string;
}

export interface PlayerSeason {
    Year: number;
    FPts: number;
    FPG: number;
    Position: string;
    YOFHLTeam: string; // abbreviation, "FA" when unrostered at season end
    TeamID: string | null; // franchise id, for /teams/[id]
    teamName: string | null;
    teamLogo: string | null;
    Champion: boolean;
}

export interface PlayerProfile {
    id: string;
    name: string;
    rank: number | null;
    totalFPts: number;
    fpg: number;
    seasons: number;
    positions: string[];
    team: { id: number; name: string; logoUrl: string | null; abbreviation: string } | null;
    playerStats: PlayerSeason[];
    awards: { Award: string; label: string; description: string; Year: number }[];
    championships: { season: number; team: string }[];
}

export interface ChampionRoster {
    year: number;
    team: string;
    abbreviation: string;
    owner: string | null;
    logo: string | null;
    rows: LeaderRow[];
}

export interface FranchiseCard {
    ID: number;
    Team: string;
    Abbreviation: string;
    Owner: string | null;
    defunct: boolean;
    Wins: number;
    Losses: number;
    Ties: number;
    FPF: number;
    championships: number[];
    finals: number[];
    LogoUrl: string | null;
}

export interface FranchiseDetail {
    id: number;
    name: string;
    abbreviation: string;
    logo: string | null;
    formerNames: string[];
    owner: string | null;
    firstSeason: number;
    foldedAfterSeason: number | null;
    wins: number;
    losses: number;
    ties: number;
    fptsFor: number;
    fptsAgainst: number;
    championships: number[];
    finals: number[];
    seasons: FranchiseSeason[];
    leaders: LeaderRow[];
}

export interface FranchiseSeason {
    year: number;
    name: string;
    owner: string | null;
    wins: number;
    losses: number;
    ties: number;
    fptsFor: number;
    fptsAgainst: number;
    /** 'pending' while the season is unpublished (GLOSSARY.md): its playoffs are not decided, so the rounds stored so far say nothing final */
    playoffStatus: 'complete' | 'cancelled' | 'pending';
    playoffRound: number | null;
    finalRound: number | null;
}

export interface AwardWinner {
    Year: number;
    Winner: string;
    PlayerID: string;
    Team: string | null;
    TeamID: number | null;
    Owner?: string | null;
    // Season context for share cards: the player's season, or the team's record for team honours.
    TeamLogo?: string | null;
    FPts?: number | null;
    FPG?: number | null;
    Record?: string | null;
}

// leaderboard queries return the filtered total on every row; drop it from the rows themselves
const withoutTotal = <T extends { total: number }>(row: T): Omit<T, 'total'> => {
    const copy: Partial<T> = { ...row };
    delete copy.total;
    return copy as Omit<T, 'total'>;
};

const toPosition = (position: string) => (position === 'all' ? null : position.toUpperCase());
const toSearch = (q: string) => (q.trim() ? `%${q.trim()}%` : null);

class NotFoundError extends Error {}

async function cachedOrNull<T>(load: () => Promise<T>): Promise<T | null> {
    try { return await load(); }
    catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
    }
}

export const getBannerSeasons = cached(
    () =>
        rows<BannerSeason>(sql`
            select s.year, s.playoff_status as "playoffStatus",
                   st.name as team, st.abbreviation, st.logo, o.name as owner, st.franchise_id as "franchiseId"
            from league.seasons s
            left join league.season_results r on r.season_year = s.year
            left join league.season_teams st on st.team_season_id = r.champion_team_season_id
            left join league.team_seasons t on t.id = st.team_season_id
            left join league.owners o on o.id = t.owner_id
            order by s.year`),
    'banner-seasons',
    [leagueTags.banners],
);

/** every season, sorted into published, latest and current (see lib/seasons.ts); no query of its own */
export const getSeasonArchive = async () => seasonArchive(await getBannerSeasons());

/** `items` less those of a season still being played: only a published season (GLOSSARY.md) counts */
export async function publishedOnly<T>(items: T[] | Promise<T[]>, yearOf: (item: T) => number): Promise<T[]> {
    const [list, archive] = await Promise.all([items, getSeasonArchive()]);
    return list.filter(item => isPublished(archive, yearOf(item)));
}

export const getAwardTypes = cached(
    () => rows<AwardType>(sql`select name, label, description from league.award_types order by sort_order`),
    'award-types',
);

/** the catalogue IDs of the team awards with a published award vote tally (never a rehearsal's) */
const getPublishedTeamAwards = cached(
    async () => (await rows<{ award: string }>(sql`select distinct w.award from ${publishedTeamAwardWinners} w`)).map(row => row.award),
    'published-team-awards',
    [leagueTags.awardVoteTallies],
);

/** the awards lists of awards show (lib/awards.ts listedAwards); `catalogue` is the award catalogue, in tests a released one */
export async function getListedAwards(catalogue: readonly AwardDefinition[] = AWARD_CATALOGUE): Promise<AwardDefinition[]> {
    return listedAwards(new Set(await getPublishedTeamAwards()), catalogue);
}

/** the award API's list: the archive's award types, then each listed team award an award vote decides */
export async function getListedAwardTypes(catalogue?: readonly AwardDefinition[]): Promise<AwardType[]> {
    const [types, listed] = await Promise.all([getAwardTypes(), getListedAwards(catalogue)]);
    return [...types, ...listed.filter(award => award.id === GM_OF_THE_YEAR)
        .map(award => ({ name: award.name, label: award.label, description: award.description }))];
}

/** the award API's winners of one award by name: an archive award type's, or a listed GM of the Year's; null for any other */
export async function getListedAwardWinners(name: string, catalogue?: readonly AwardDefinition[]): Promise<{ award: AwardType; winners: AwardWinner[] } | null> {
    const id = getAwardDefinition(name)?.id;
    const award = id === GM_OF_THE_YEAR ? (await getListedAwards(catalogue)).find(award => award.id === id) : undefined;
    if (!award) return getAwardWinners(name);
    return { award: { name: award.name, label: award.label, description: award.description }, winners: await getTeamAwardWinners(GM_OF_THE_YEAR) };
}

async function queryAllTimeLeaderboard(position: string, page: number, q: string): Promise<LeaderboardPage> {
    const pos = toPosition(position);
    const search = toSearch(q);
    const data = await rows<LeaderRow & { total: number }>(sql`
        select pc.player_id as "ID", pc.name as "Player", array_to_string(pc.positions, ', ') as "Position",
               pc.total_fpts::float8 as "FPts", pc.fpg::float8 as "FPG", pc.championships as "ChampionshipsWon",
               count(*) over ()::int as total
        from league.player_careers pc
        where (${pos}::text is null or ${pos}::text = any(pc.positions))
          and (${search}::text is null or pc.name ilike ${search}::text)
        order by pc.total_fpts desc, pc.player_id
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`);
    const total = data[0]?.total ?? 0;
    return { rows: data.map(withoutTotal), page, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

const getCachedAllTimeLeaderboard = cached(
    (position: string, page: number) => queryAllTimeLeaderboard(position, page, ''),
    'leaderboard-all-time',
    [leagueTags.careerLeaderboard],
);

export function getAllTimeLeaderboard(position: string, page: number, q: string): Promise<LeaderboardPage> {
    const pos = position.toLowerCase();
    const safePage = clampPage(page, MAX_LEADERBOARD_PAGE);
    if (!q.trim() && safePage <= 25) return getCachedAllTimeLeaderboard(pos, safePage);
    return queryAllTimeLeaderboard(pos, safePage, q);
}

async function querySingleSeasonLeaderboard(position: string, page: number, q: string, season: number | null): Promise<LeaderboardPage> {
    const pos = toPosition(position);
    const search = toSearch(q);
    const data = await rows<LeaderRow & { awards: number; total: number }>(sql`
        select ps.player_id as "ID", p.name as "Player", array_to_string(ps.positions, ', ') as "Position",
               ps.fpts::float8 as "FPts", ps.fpg::float8 as "FPG", ps.season_year as "Year",
               coalesce(t.abbreviation, 'FA') as "YOFHLTeam", t.franchise_id::text as "TeamID",
               t.name as "teamName", t.logo as "teamLogo",
               (select count(*)::int from league.awards a where a.player_id = ps.player_id and a.season_year = ps.season_year) as awards,
               exists (select 1 from league.championship_rosters c where c.player_id = ps.player_id and c.season_year = ps.season_year) as "Champion",
               count(*) over ()::int as total
        from league.player_seasons ps
        join league.players p on p.id = ps.player_id
        left join league.season_teams t on t.team_season_id = ps.team_season_id
        where ps.fpts > 0
          and (${season}::int is null or ps.season_year = ${season})
          and (${pos}::text is null or ${pos}::text = any(ps.positions))
          and (${search}::text is null or p.name ilike ${search}::text)
        order by ps.fpts desc, ps.player_id, ps.season_year
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`);
    const total = data[0]?.total ?? 0;
    return {
        rows: data.map(withoutTotal).map(({ awards, ...r }) => ({ ...r, hasAward: awards > 0, hasMultipleAwards: awards > 1 })),
        page,
        total,
        pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
}

const getCachedSingleSeasonLeaderboard = cached(
    (position: string, page: number, season: number | null = null) => querySingleSeasonLeaderboard(position, page, '', season),
    'leaderboard-single-season',
    (_position, _page, season = null) => [season === null ? leagueTags.seasonLeaderboard : leagueTags.season(season)],
);

export function getSingleSeasonLeaderboard(position: string, page: number, q: string, season: number | null = null): Promise<LeaderboardPage> {
    const pos = position.toLowerCase();
    const safePage = clampPage(page, MAX_LEADERBOARD_PAGE);
    if (season !== null && (!Number.isInteger(season) || season < 1900 || season > 2200)) {
        return Promise.resolve({ rows: [], page: safePage, total: 0, pages: 1 });
    }
    if (!q.trim() && safePage <= 25) return getCachedSingleSeasonLeaderboard(pos, safePage, season);
    return querySingleSeasonLeaderboard(pos, safePage, q, season);
}

const getCachedPlayer = cached(async (id: string): Promise<PlayerProfile> => {
    const [player] = await rows<{ id: string; name: string }>(sql`
        select id, name from league.players where id = ${id}`);
    if (!player) throw new NotFoundError();

    const [career, playerStats, awards, championships] = await Promise.all([
        rows<{ rank: number; total: number; fpg: number; seasons: number; positions: string[]; team_id: number | null; team_name: string | null; team_logo: string | null; team_abbreviation: string | null }>(sql`
            select pc.all_time_rank as rank, pc.total_fpts::float8 as total, pc.fpg::float8 as fpg, pc.seasons, pc.positions,
                   t.franchise_id as team_id, t.name as team_name, t.logo as team_logo, t.abbreviation as team_abbreviation
            from league.player_careers pc
            left join league.season_teams t on t.team_season_id = pc.latest_team_season_id
            where pc.player_id = ${id}`),
        rows<PlayerSeason>(sql`
            select ps.season_year as "Year", ps.fpts::float8 as "FPts", ps.fpg::float8 as "FPG",
                   array_to_string(ps.positions, ',') as "Position",
                   coalesce(t.abbreviation, 'FA') as "YOFHLTeam", t.franchise_id::text as "TeamID",
                   t.name as "teamName", t.logo as "teamLogo",
                   exists (select 1 from league.championship_rosters c where c.player_id = ps.player_id and c.season_year = ps.season_year) as "Champion"
            from league.player_seasons ps
            left join league.season_teams t on t.team_season_id = ps.team_season_id
            where ps.player_id = ${id}
            order by ps.season_year`),
        rows<PlayerProfile['awards'][number]>(sql`
            select at.name as "Award", at.label, at.description, a.season_year as "Year"
            from league.awards a join league.award_types at on at.id = a.award_type_id
            where a.player_id = ${id}
            order by a.season_year, at.sort_order`),
        // the ring's team is the champion, even if the player was dropped before season end
        rows<{ season: number; team: string }>(sql`
            select c.season_year as season, t.name as team
            from league.championship_rosters c
            join league.season_results r on r.season_year = c.season_year
            join league.season_teams t on t.team_season_id = r.champion_team_season_id
            where c.player_id = ${id}
            order by c.season_year`),
    ]);

    const c = career[0];
    const scoring = playerStats.filter((s) => s.FPts > 0);
    return {
        id: player.id,
        name: player.name,
        rank: c?.rank ?? null,
        totalFPts: c?.total ?? 0,
        fpg: c?.fpg ?? 0,
        seasons: c?.seasons ?? scoring.length,
        positions: c?.positions ?? [],
        team: c?.team_id
            ? { id: c.team_id, name: c.team_name!, logoUrl: c.team_logo, abbreviation: c.team_abbreviation! }
            : null,
        playerStats,
        awards,
        championships,
    };
}, 'player', [leagueTags.players]);

export async function getPlayer(id: string): Promise<PlayerProfile | null> {
    if (!id || id.length > MAX_ID_LENGTH) return null;
    return cachedOrNull(() => getCachedPlayer(id));
}

// most-viewed profiles are built ahead of time; everyone else is built on first visit
export const getTopPlayerIds = cached(
    (limit: number) => rows<{ id: string }>(sql`select player_id as id from league.player_careers order by all_time_rank limit ${limit}`),
    'top-player-ids',
);

// The archive's player IDs: a current Fantrax player with one of these has a player page.
export const getArchivedPlayerIds = cached(
    () => rows<{ id: string }>(sql`select player_id as id from league.player_careers`),
    'archived-player-ids-v2',
    [leagueTags.players],
);

const getCachedChampionRoster = cached(async (year: number): Promise<ChampionRoster> => {
    const [season] = await rows<Omit<ChampionRoster, 'rows'>>(sql`
        select s.year, st.name as team, st.abbreviation, st.logo, o.name as owner
        from league.seasons s
        join league.season_results r on r.season_year = s.year
        join league.season_teams st on st.team_season_id = r.champion_team_season_id
        join league.team_seasons t on t.id = st.team_season_id
        left join league.owners o on o.id = t.owner_id
        where s.year = ${year}`);
    if (!season) throw new NotFoundError();
    const roster = await rows<LeaderRow>(sql`
        select p.id as "ID", p.name as "Player", coalesce(array_to_string(ps.positions, ', '), '') as "Position",
               coalesce(ps.fpts, 0)::float8 as "FPts", coalesce(ps.fpg, 0)::float8 as "FPG"
        from league.championship_rosters c
        join league.players p on p.id = c.player_id
        left join league.player_seasons ps on ps.player_id = c.player_id and ps.season_year = c.season_year
        where c.season_year = ${year}
        order by ps.fpts desc nulls last, p.name`);
    return { ...season, rows: roster };
}, 'champion-roster', year => [leagueTags.season(year)]);

export async function getChampionRoster(year: number): Promise<ChampionRoster | null> {
    if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
    return cachedOrNull(() => getCachedChampionRoster(year));
}

export const getFranchiseCards = cached(
    () =>
        rows<FranchiseCard>(sql`
            select c.id as "ID", c.name as "Team", c.abbreviation as "Abbreviation", o.name as "Owner", c.defunct,
                   fr.wins as "Wins", fr.losses as "Losses", fr.ties as "Ties", fr.fpts_for::float8 as "FPF",
                   fr.championships, fr.finals, c.logo as "LogoUrl"
            from league.current_teams c
            join league.franchise_records fr on fr.franchise_id = c.id
            left join league.team_seasons t on t.id = c.latest_team_season_id
            left join league.owners o on o.id = t.owner_id
            order by fr.wins desc, c.id`),
    'franchise-cards',
    [leagueTags.franchiseCards],
);

const getFranchiseRows = cached(async (id: number): Promise<FranchiseDetail> => {
    const [franchise] = await rows<Omit<FranchiseDetail, 'leaders' | 'seasons'>>(sql`
        select c.id, c.name, c.abbreviation, c.logo,
               o.name as owner, f.first_season as "firstSeason", f.folded_after_season as "foldedAfterSeason",
               fr.wins, fr.losses, fr.ties, fr.fpts_for::float8 as "fptsFor", fr.fpts_against::float8 as "fptsAgainst",
               fr.championships, fr.finals,
               array(select distinct s.name from league.season_teams s where s.franchise_id = c.id and s.name <> c.name) as "formerNames"
        from league.current_teams c
        join league.franchises f on f.id = c.id
        join league.franchise_records fr on fr.franchise_id = c.id
        left join league.team_seasons t on t.id = c.latest_team_season_id
        left join league.owners o on o.id = t.owner_id
        where c.id = ${id}`);
    if (!franchise) throw new NotFoundError();
    const [leaders, seasons] = await Promise.all([rows<LeaderRow>(sql`
        with stints as (
            select ps.player_id, ps.season_year, ps.fpts, ps.fpg, ps.positions
            from league.player_seasons ps
            join league.team_seasons t on t.id = ps.team_season_id
            where t.franchise_id = ${id} and ps.fpts > 0
        )
        select s.player_id as "ID", p.name as "Player",
               (select string_agg(distinct pos, ', ') from stints s2, unnest(s2.positions) pos where s2.player_id = s.player_id) as "Position",
               sum(s.fpts)::float8 as "FPts", round(avg(s.fpg), 2)::float8 as "FPG",
               (select count(*)::int
                  from league.championship_rosters c
                  join league.season_results r on r.season_year = c.season_year
                  join league.team_seasons ct on ct.id = r.champion_team_season_id
                 where ct.franchise_id = ${id} and c.player_id = s.player_id) as "ChampionshipsWon"
        from stints s join league.players p on p.id = s.player_id
        group by s.player_id, p.name
        order by "FPts" desc, p.name`),
        rows<FranchiseSeason>(sql`
            select t.season_year as year, st.name, o.name as owner, t.wins, t.losses, t.ties,
                   t.fpts_for::float8 as "fptsFor", t.fpts_against::float8 as "fptsAgainst",
                   s.playoff_status as "playoffStatus",
                   (select max(m.round) from league.matchups m
                     where m.season_year = t.season_year and m.stage = 'playoff' and m.bracket = 'championship'
                       and (m.away_team_season_id = t.id or m.home_team_season_id = t.id)) as "playoffRound",
                   (select max(m.round) from league.matchups m
                     where m.season_year = t.season_year and m.stage = 'playoff' and m.bracket = 'championship') as "finalRound"
            from league.team_seasons t
            join league.season_teams st on st.team_season_id = t.id
            join league.seasons s on s.year = t.season_year
            left join league.owners o on o.id = t.owner_id
            where t.franchise_id = ${id}
            order by t.season_year desc`),
    ]);
    return { ...franchise, leaders, seasons };
}, 'franchise', id => [leagueTags.franchiseDetails, leagueTags.franchise(id)]);

/** A franchise with its seasons. A season still being played is 'pending': it has a record but no playoff result yet. */
export async function getFranchise(id: number): Promise<FranchiseDetail | null> {
    if (!isPositiveInt4(id)) return null;
    const [franchise, archive] = await Promise.all([cachedOrNull(() => getFranchiseRows(id)), getSeasonArchive()]);
    return franchise && { ...franchise, seasons: franchise.seasons.map(season =>
        isPublished(archive, season.year) ? season : { ...season, playoffStatus: 'pending' as const }) };
}

const getCachedAwardWinners = cached(async (name: string) => {
    const [award] = await rows<AwardType>(sql`select name, label, description from league.award_types where name = ${name}`);
    if (!award) throw new NotFoundError();
    const winners = await rows<AwardWinner>(sql`
        select a.season_year as "Year", p.name as "Winner", p.id as "PlayerID", t.name as "Team", t.franchise_id as "TeamID",
               t.logo as "TeamLogo", ps.fpts::float8 as "FPts", ps.fpg::float8 as "FPG"
        from league.awards a
        join league.award_types at on at.id = a.award_type_id
        join league.players p on p.id = a.player_id
        left join league.season_teams t on t.team_season_id = a.team_season_id
        left join league.player_seasons ps on ps.player_id = a.player_id and ps.season_year = a.season_year
        where at.name = ${name}
        order by a.season_year desc`);
    return { award, winners };
}, 'award-winners-v2', [leagueTags.awards]);

export async function getAwardWinners(name: string): Promise<{ award: AwardType; winners: AwardWinner[] } | null> {
    if (!name || name.length > 100) return null;
    return cachedOrNull(() => getCachedAwardWinners(name));
}

/** a team honour: one of the team awards in the catalogue (lib/awards.ts) */
export type TeamAward = 'jagr-cup' | 'prime-minister' | typeof GM_OF_THE_YEAR;

// Team honours use the same championship and scoring records as franchise trophy cases. GM of the Year's winners are
// the place-one team seasons of its published tallies (never a rehearsal's), co-winners each their own row; it is
// never in the player-keyed awards table.
/** each team award's winners, as a condition on team season `t`, and the cache tag its winners expire with */
const TEAM_AWARDS: Record<TeamAward, { criterion: SQL; tag: string }> = {
    'jagr-cup': { criterion: sql`exists (select 1 from league.season_results r where r.champion_team_season_id = t.id)`, tag: leagueTags.cups },
    'prime-minister': {
        criterion: sql`not exists (select 1 from league.team_seasons other
              where other.season_year = t.season_year and other.franchise_id <> t.franchise_id
                and other.fpts_for >= t.fpts_for)`,
        tag: leagueTags.pointsLeaders,
    },
    [GM_OF_THE_YEAR]: {
        criterion: sql`t.id in (select w.team_season_id from ${publishedTeamAwardWinners} w where w.award = ${GM_OF_THE_YEAR})`,
        tag: leagueTags.awardVoteTallies,
    },
};

const getTeamAwardRows = cached(async (award: TeamAward) => {
    const { criterion } = TEAM_AWARDS[award];
    return rows<AwardWinner>(sql`
        select t.season_year as "Year", st.name as "Winner", '' as "PlayerID",
               st.name as "Team", t.franchise_id as "TeamID", o.name as "Owner", st.logo as "TeamLogo",
               t.fpts_for::float8 as "FPts", null::float8 as "FPG",
               t.wins || '–' || t.losses || case when t.ties > 0 then '–' || t.ties else '' end as "Record"
        from league.team_seasons t
        join league.season_teams st on st.team_season_id = t.id
        left join league.owners o on o.id = t.owner_id
        where ${criterion}
        order by t.season_year desc, st.name`);
}, 'team-award-winners-v4', (award: TeamAward) => [TEAM_AWARDS[award].tag]);

/** A season still being played has a points leader but no Prime Minister's Trophy until it is published. */
export async function getTeamAwardWinners(award: TeamAward): Promise<AwardWinner[]> {
    return publishedOnly(getTeamAwardRows(award), winner => winner.Year);
}

export function searchPlayers(q: string) {
    const term = q.trim().slice(0, 60);
    return term.length < 3
        ? Promise.resolve([] as { ID: string; Player: string }[])
        : rows<{ ID: string; Player: string }>(sql`
            select player_id as "ID", name as "Player" from league.player_careers
            where name ilike ${`%${term}%`}
            order by all_time_rank limit 10`);
}

export interface StandingRow extends SeasonIdentity {
    teamSeasonId: number;
    owner: string | null;
    division: number;
    divisionRank: number;
    wins: number;
    losses: number;
    ties: number;
    fptsFor: number;
    fptsAgainst: number;
}

export interface BracketTeam extends SeasonIdentity {
    score: number;
}

export interface BracketGame {
    id: number;
    round: number;
    bracket: 'championship' | 'consolation';
    slot: number;
    away: BracketTeam;
    home: BracketTeam;
    winnerFranchiseId: number | null;
    scoreAdjusted: boolean;
    note: string | null;
}

export interface SeasonDetail {
    standings: StandingRow[];
    games: BracketGame[];
}

// standings and playoff bracket for one season
export const getSeasonDetail = cached(async (year: number): Promise<SeasonDetail> => {
    const [standings, games] = await Promise.all([
        rows<StandingRow>(sql`
            select t.id as "teamSeasonId", t.franchise_id as "franchiseId", st.name, st.abbreviation,
                   st.logo, o.name as owner,
                   t.division, t.division_rank as "divisionRank", t.wins, t.losses, t.ties,
                   t.fpts_for::float8 as "fptsFor", t.fpts_against::float8 as "fptsAgainst"
            from league.team_seasons t
            join league.season_teams st on st.team_season_id = t.id
            left join league.owners o on o.id = t.owner_id
            where t.season_year = ${year}
            order by t.division, t.division_rank, t.wins desc, t.fpts_for desc`),
        rows<{
            id: number; round: number; bracket: 'championship' | 'consolation'; slot: number;
            score_adjusted: boolean; note: string | null; winner: number | null;
            a_id: number; a_name: string; a_abbr: string; a_logo: string | null; a_score: number;
            h_id: number; h_name: string; h_abbr: string; h_logo: string | null; h_score: number;
        }>(sql`
            select m.id, m.round, m.bracket, m.slot, m.score_adjusted,
                   nullif(concat_ws(' · ', m.note, o.note), '') as note, w.franchise_id as winner,
                   a.franchise_id as a_id, a.name as a_name, a.abbreviation as a_abbr, a.logo as a_logo, m.away_score::float8 as a_score,
                   h.franchise_id as h_id, h.name as h_name, h.abbreviation as h_abbr, h.logo as h_logo, m.home_score::float8 as h_score
            from league.matchups m
            join league.season_teams a on a.team_season_id = m.away_team_season_id
            join league.season_teams h on h.team_season_id = m.home_team_season_id
            left join league.team_seasons w on w.id = m.winner_team_season_id
            left join league.matchup_overrides o
                   on o.season_year = m.season_year and o.round = m.round
                  and o.franchise_a = least(a.franchise_id, h.franchise_id) and o.franchise_b = greatest(a.franchise_id, h.franchise_id)
            where m.season_year = ${year} and m.stage = 'playoff'
            order by m.bracket, m.round, m.slot`),
    ]);
    return {
        standings,
        games: games.map((g) => ({
            id: g.id,
            round: g.round,
            bracket: g.bracket,
            slot: g.slot,
            away: { franchiseId: g.a_id, name: g.a_name, abbreviation: g.a_abbr, logo: g.a_logo, score: g.a_score },
            home: { franchiseId: g.h_id, name: g.h_name, abbreviation: g.h_abbr, logo: g.h_logo, score: g.h_score },
            winnerFranchiseId: g.winner,
            scoreAdjusted: g.score_adjusted,
            note: g.note,
        })),
    };
}, 'season-detail', year => [leagueTags.season(year)]);
