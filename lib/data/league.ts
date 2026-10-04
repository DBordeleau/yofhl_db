import { sql } from 'drizzle-orm';
import { cached, rows } from './db';

// Every query the site makes. Each is cached until the next import or admin edit (see ./db).
// Field names in PascalCase match what the existing table components already expect.

export const PAGE_SIZE = 25;

export interface BannerSeason {
    year: number;
    label: string;
    playoffStatus: 'complete' | 'cancelled';
    team: string | null;
    abbreviation: string | null;
    owner: string | null;
    logo: string | null;
}

export interface LeaderRow {
    ID: string;
    Player: string;
    Position: string;
    FPts: number;
    FPG: number;
    Year?: number;
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
    label: string;
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
    leaders: LeaderRow[];
}

export interface AwardWinner {
    Year: number;
    Winner: string;
    PlayerID: string;
    Team: string | null;
    TeamID: number | null;
}

// leaderboard queries return the filtered total on every row; drop it from the rows themselves
const withoutTotal = <T extends { total: number }>(row: T): Omit<T, 'total'> => {
    const copy: Partial<T> = { ...row };
    delete copy.total;
    return copy as Omit<T, 'total'>;
};

const toPosition = (position: string) => (position === 'all' ? null : position.toUpperCase());
const toSearch = (q: string) => (q.trim() ? `%${q.trim()}%` : null);

export const getBannerSeasons = cached(
    () =>
        rows<BannerSeason>(sql`
            select s.year, s.label, s.playoff_status as "playoffStatus",
                   t.name as team, t.abbreviation, t.logo_url as logo, o.name as owner
            from league.seasons s
            left join league.season_results r on r.season_year = s.year
            left join league.team_seasons t on t.id = r.champion_team_season_id
            left join league.owners o on o.id = t.owner_id
            order by s.year`),
    'banner-seasons',
);

export const getAwardTypes = cached(
    () => rows<AwardType>(sql`select name, label, description from league.award_types order by sort_order`),
    'award-types',
);

export const getAllTimeLeaderboard = cached(async (position: string, page: number, q: string): Promise<LeaderboardPage> => {
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
}, 'leaderboard-all-time');

export const getSingleSeasonLeaderboard = cached(async (position: string, page: number, q: string): Promise<LeaderboardPage> => {
    const pos = toPosition(position);
    const search = toSearch(q);
    const data = await rows<LeaderRow & { awards: number; total: number }>(sql`
        select ps.player_id as "ID", p.name as "Player", array_to_string(ps.positions, ', ') as "Position",
               ps.fpts::float8 as "FPts", ps.fpg::float8 as "FPG", ps.season_year as "Year",
               (select count(*)::int from league.awards a where a.player_id = ps.player_id and a.season_year = ps.season_year) as awards,
               exists (select 1 from league.championship_rosters c where c.player_id = ps.player_id and c.season_year = ps.season_year) as "Champion",
               count(*) over ()::int as total
        from league.player_seasons ps
        join league.players p on p.id = ps.player_id
        where ps.fpts > 0
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
}, 'leaderboard-single-season');

export const getPlayer = cached(async (id: string): Promise<PlayerProfile | null> => {
    const [player] = await rows<{ id: string; name: string }>(sql`select id, name from league.players where id = ${id}`);
    if (!player) return null;

    const [career, playerStats, awards, championships] = await Promise.all([
        rows<{ rank: number; total: number; fpg: number; seasons: number; positions: string[]; team_id: number | null; team_name: string | null; team_logo: string | null; team_abbreviation: string | null }>(sql`
            select pc.all_time_rank as rank, pc.total_fpts::float8 as total, pc.fpg::float8 as fpg, pc.seasons, pc.positions,
                   t.franchise_id as team_id, t.name as team_name, t.logo_url as team_logo, t.abbreviation as team_abbreviation
            from league.player_careers pc
            left join league.team_seasons t on t.id = pc.latest_team_season_id
            where pc.player_id = ${id}`),
        rows<PlayerSeason>(sql`
            select ps.season_year as "Year", ps.fpts::float8 as "FPts", ps.fpg::float8 as "FPG",
                   array_to_string(ps.positions, ',') as "Position",
                   coalesce(t.abbreviation, 'FA') as "YOFHLTeam", t.franchise_id::text as "TeamID",
                   t.name as "teamName", t.logo_url as "teamLogo",
                   exists (select 1 from league.championship_rosters c where c.player_id = ps.player_id and c.season_year = ps.season_year) as "Champion"
            from league.player_seasons ps
            left join league.team_seasons t on t.id = ps.team_season_id
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
            join league.team_seasons t on t.id = r.champion_team_season_id
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
}, 'player');

// most-viewed profiles are built ahead of time; everyone else is built on first visit
export const getTopPlayerIds = cached(
    (limit: number) => rows<{ id: string }>(sql`select player_id as id from league.player_careers order by all_time_rank limit ${limit}`),
    'top-player-ids',
);

export const getChampionRoster = cached(async (year: number): Promise<ChampionRoster | null> => {
    const [season] = await rows<Omit<ChampionRoster, 'rows'>>(sql`
        select s.year, s.label, t.name as team, t.abbreviation, t.logo_url as logo, o.name as owner
        from league.seasons s
        join league.season_results r on r.season_year = s.year
        join league.team_seasons t on t.id = r.champion_team_season_id
        left join league.owners o on o.id = t.owner_id
        where s.year = ${year}`);
    if (!season) return null;
    const roster = await rows<LeaderRow>(sql`
        select p.id as "ID", p.name as "Player", coalesce(array_to_string(ps.positions, ', '), '') as "Position",
               coalesce(ps.fpts, 0)::float8 as "FPts", coalesce(ps.fpg, 0)::float8 as "FPG"
        from league.championship_rosters c
        join league.players p on p.id = c.player_id
        left join league.player_seasons ps on ps.player_id = c.player_id and ps.season_year = c.season_year
        where c.season_year = ${year}
        order by ps.fpts desc nulls last, p.name`);
    return { ...season, rows: roster };
}, 'champion-roster');

export const getFranchiseCards = cached(
    () =>
        rows<FranchiseCard>(sql`
            select f.id as "ID", t.name as "Team", t.abbreviation as "Abbreviation", o.name as "Owner",
                   f.folded_after_season is not null as defunct,
                   fr.wins as "Wins", fr.losses as "Losses", fr.ties as "Ties", fr.fpts_for::float8 as "FPF",
                   fr.championships, fr.finals, coalesce(t.logo_url, f.logo_url) as "LogoUrl"
            from league.franchises f
            join league.franchise_records fr on fr.franchise_id = f.id
            join lateral (
                select * from league.team_seasons ts where ts.franchise_id = f.id order by ts.season_year desc limit 1
            ) t on true
            left join league.owners o on o.id = t.owner_id
            order by fr.wins desc`),
    'franchise-cards',
);

export const getFranchise = cached(async (id: number): Promise<FranchiseDetail | null> => {
    const [franchise] = await rows<{ id: number; name: string; abbreviation: string; logo: string | null; names: string[] }>(sql`
        select f.id, t.name, t.abbreviation, coalesce(t.logo_url, f.logo_url) as logo,
               array(select distinct ts.name from league.team_seasons ts where ts.franchise_id = f.id and ts.name <> t.name) as names
        from league.franchises f
        join lateral (
            select * from league.team_seasons ts where ts.franchise_id = f.id order by ts.season_year desc limit 1
        ) t on true
        where f.id = ${id}`);
    if (!franchise) return null;
    const leaders = await rows<LeaderRow>(sql`
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
        order by "FPts" desc, p.name`);
    return { id: franchise.id, name: franchise.name, abbreviation: franchise.abbreviation, logo: franchise.logo, formerNames: franchise.names, leaders };
}, 'franchise');

export const getAwardWinners = cached(async (name: string) => {
    const [award] = await rows<AwardType>(sql`select name, label, description from league.award_types where name = ${name}`);
    if (!award) return null;
    const winners = await rows<AwardWinner>(sql`
        select a.season_year as "Year", p.name as "Winner", p.id as "PlayerID", t.name as "Team", t.franchise_id as "TeamID"
        from league.awards a
        join league.award_types at on at.id = a.award_type_id
        join league.players p on p.id = a.player_id
        left join league.team_seasons t on t.id = a.team_season_id
        where at.name = ${name}
        order by a.season_year desc`);
    return { award, winners };
}, 'award-winners');

export const searchPlayers = cached(
    (q: string) =>
        q.trim().length < 3
            ? Promise.resolve([] as { ID: string; Player: string }[])
            : rows<{ ID: string; Player: string }>(sql`
                select player_id as "ID", name as "Player" from league.player_careers
                where name ilike ${`%${q.trim()}%`}
                order by all_time_rank limit 10`),
    'player-search',
);

export interface StandingRow {
    teamSeasonId: number;
    franchiseId: number;
    name: string;
    abbreviation: string;
    logo: string | null;
    owner: string | null;
    division: number;
    divisionRank: number;
    wins: number;
    losses: number;
    ties: number;
    fptsFor: number;
    fptsAgainst: number;
}

export interface BracketTeam {
    franchiseId: number;
    name: string;
    abbreviation: string;
    logo: string | null;
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
            select t.id as "teamSeasonId", t.franchise_id as "franchiseId", t.name, t.abbreviation,
                   t.logo_url as logo, o.name as owner,
                   t.division, t.division_rank as "divisionRank", t.wins, t.losses, t.ties,
                   t.fpts_for::float8 as "fptsFor", t.fpts_against::float8 as "fptsAgainst"
            from league.team_seasons t
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
                   a.franchise_id as a_id, a.name as a_name, a.abbreviation as a_abbr, a.logo_url as a_logo, m.away_score::float8 as a_score,
                   h.franchise_id as h_id, h.name as h_name, h.abbreviation as h_abbr, h.logo_url as h_logo, m.home_score::float8 as h_score
            from league.matchups m
            join league.team_seasons a on a.id = m.away_team_season_id
            join league.team_seasons h on h.id = m.home_team_season_id
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
}, 'season-detail');
