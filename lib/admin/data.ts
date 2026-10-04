import { sql } from 'drizzle-orm';
import { rows } from '@/lib/data/db';

// Admin reads. Never cached: the panel must show exactly what's in the database.

export interface SeasonStatus {
    year: number;
    label: string;
    playoffStatus: 'complete' | 'cancelled';
    teams: number;
    players: number;
    games: number;
    champion: string | null;
    roster: number;
    awards: number;
    awardsExpected: number;
    overrides: number;
}

export interface AdminPlayer {
    id: string;
    name: string;
    positions: string;
    fpts: number;
    team: string; // fantasy team abbreviation at season end, "FA" when unrostered
}

export interface AdminAward {
    name: string;
    label: string;
    description: string;
    winner: AdminPlayer | null;
}

export interface AdminGame {
    id: number;
    round: number;
    bracket: 'championship' | 'consolation';
    slot: number;
    away: { franchiseId: number; name: string; score: number };
    home: { franchiseId: number; name: string; score: number };
    winnerFranchiseId: number | null;
    scoreNote: string | null; // from league.yml score fixes
    override: { winnerFranchiseId: number | null; bracket: 'championship' | 'consolation' | null; note: string | null } | null;
}

export interface SeasonAdmin {
    year: number;
    label: string;
    playoffStatus: 'complete' | 'cancelled';
    champion: { teamSeasonId: number; name: string; abbreviation: string } | null;
    roster: AdminPlayer[];
    suggestions: AdminPlayer[]; // champion's end-of-season roster not yet on the ring list
    awards: AdminAward[];
    games: AdminGame[];
}

const playerColumns = sql`
    p.id, p.name, coalesce(array_to_string(ps.positions, ', '), '') as positions,
    coalesce(ps.fpts, 0)::float8 as fpts, coalesce(t.abbreviation, 'FA') as team`;

// the Danny Briere Award (playoff MVP) can't be won in a season without playoffs
const playoffAward = 'Danny Briere Award';

export const getSeasonStatuses = () =>
    rows<SeasonStatus>(sql`
        select s.year, s.label, s.playoff_status as "playoffStatus",
               (select count(*)::int from league.team_seasons t where t.season_year = s.year) as teams,
               (select count(*)::int from league.player_seasons ps where ps.season_year = s.year) as players,
               (select count(*)::int from league.matchups m where m.season_year = s.year) as games,
               (select t.name from league.team_seasons t where t.id = r.champion_team_season_id) as champion,
               (select count(*)::int from league.championship_rosters c where c.season_year = s.year) as roster,
               (select count(distinct a.award_type_id)::int from league.awards a where a.season_year = s.year) as awards,
               (select count(*)::int from league.award_types at
                 where s.playoff_status = 'complete' or at.name <> ${playoffAward}) as "awardsExpected",
               (select count(*)::int from league.matchup_overrides o where o.season_year = s.year) as overrides
        from league.seasons s
        left join league.season_results r on r.season_year = s.year
        order by s.year desc`);

export const getSeasonAdmin = async (year: number): Promise<SeasonAdmin | null> => {
    const [season] = await rows<{ year: number; label: string; playoffStatus: 'complete' | 'cancelled'; champion_id: number | null; champion_name: string | null; champion_abbr: string | null }>(sql`
        select s.year, s.label, s.playoff_status as "playoffStatus",
               t.id as champion_id, t.name as champion_name, t.abbreviation as champion_abbr
        from league.seasons s
        left join league.season_results r on r.season_year = s.year
        left join league.team_seasons t on t.id = r.champion_team_season_id
        where s.year = ${year}`);
    if (!season) return null;

    const [roster, suggestions, awards, games] = await Promise.all([
        rows<AdminPlayer>(sql`
            select ${playerColumns}
            from league.championship_rosters c
            join league.players p on p.id = c.player_id
            left join league.player_seasons ps on ps.player_id = c.player_id and ps.season_year = c.season_year
            left join league.team_seasons t on t.id = ps.team_season_id
            where c.season_year = ${year}
            order by ps.fpts desc nulls last, p.name`),
        season.champion_id
            ? rows<AdminPlayer>(sql`
                select ${playerColumns}
                from league.player_seasons ps
                join league.players p on p.id = ps.player_id
                join league.team_seasons t on t.id = ps.team_season_id
                where ps.season_year = ${year} and ps.team_season_id = ${season.champion_id}
                  and not exists (select 1 from league.championship_rosters c where c.season_year = ${year} and c.player_id = ps.player_id)
                order by ps.fpts desc`)
            : Promise.resolve([] as AdminPlayer[]),
        rows<{ name: string; label: string; description: string; id: string | null; player_name: string | null; positions: string | null; fpts: number | null; team: string | null }>(sql`
            select at.name, at.label, at.description,
                   p.id, p.name as player_name, coalesce(array_to_string(ps.positions, ', '), '') as positions,
                   coalesce(ps.fpts, 0)::float8 as fpts, coalesce(t.abbreviation, 'FA') as team
            from league.award_types at
            left join league.awards a on a.award_type_id = at.id and a.season_year = ${year}
            left join league.players p on p.id = a.player_id
            left join league.player_seasons ps on ps.player_id = a.player_id and ps.season_year = ${year}
            left join league.team_seasons t on t.id = ps.team_season_id
            where ${season.playoffStatus} = 'complete' or at.name <> ${playoffAward}
            order by at.sort_order`),
        rows<{
            id: number; round: number; bracket: 'championship' | 'consolation'; slot: number; note: string | null; winner: number | null;
            a_id: number; a_name: string; a_score: number; h_id: number; h_name: string; h_score: number;
            o_winner: number | null; o_bracket: 'championship' | 'consolation' | null; o_note: string | null; has_override: boolean;
        }>(sql`
            select m.id, m.round, m.bracket, m.slot, m.note, w.franchise_id as winner,
                   a.franchise_id as a_id, a.name as a_name, m.away_score::float8 as a_score,
                   h.franchise_id as h_id, h.name as h_name, m.home_score::float8 as h_score,
                   o.winner_franchise_id as o_winner, o.bracket as o_bracket, o.note as o_note, o.season_year is not null as has_override
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
        year: season.year,
        label: season.label,
        playoffStatus: season.playoffStatus,
        champion: season.champion_id ? { teamSeasonId: season.champion_id, name: season.champion_name!, abbreviation: season.champion_abbr! } : null,
        roster,
        suggestions,
        awards: awards.map((a) => ({
            name: a.name,
            label: a.label,
            description: a.description,
            winner: a.id ? { id: a.id, name: a.player_name!, positions: a.positions ?? '', fpts: a.fpts ?? 0, team: a.team ?? 'FA' } : null,
        })),
        games: games.map((g) => ({
            id: g.id,
            round: g.round,
            bracket: g.bracket,
            slot: g.slot,
            away: { franchiseId: g.a_id, name: g.a_name, score: g.a_score },
            home: { franchiseId: g.h_id, name: g.h_name, score: g.h_score },
            winnerFranchiseId: g.winner,
            scoreNote: g.note,
            override: g.has_override ? { winnerFranchiseId: g.o_winner, bracket: g.o_bracket, note: g.o_note } : null,
        })),
    };
};

// any player with a stat line in the season, best first
export const searchSeasonPlayers = (year: number, q: string) =>
    q.trim().length < 2
        ? Promise.resolve([] as AdminPlayer[])
        : rows<AdminPlayer>(sql`
            select ${playerColumns}
            from league.player_seasons ps
            join league.players p on p.id = ps.player_id
            left join league.team_seasons t on t.id = ps.team_season_id
            where ps.season_year = ${year} and p.name ilike ${`%${q.trim()}%`}
            order by ps.fpts desc
            limit 12`);
