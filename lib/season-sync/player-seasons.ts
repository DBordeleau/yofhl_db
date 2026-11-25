// Player seasons: every relevant player's season straight from Fantrax's player stats table, kept under the
// season import's rule: the player had games played, scored (a non-zero total), is on a franchise's roster, or is
// on the season's championship roster or an award list. A player season that no longer qualifies is removed. Each
// kept player is a player row (bare ID and name) and a player season with the fantasy team from the Fantrax team
// mapping (none for a free agent), NHL team, positions, FPts, FP/G and games played (games-played.ts), and its
// skater categories (skater-categories.ts).
import { sql } from 'drizzle-orm';
import { SKATER_CATEGORIES, type PlayerStat } from '@/lib/records/player-stats';
import type { CurrentSeason } from './current-season';
import type { FantraxPlayer } from './ports';
import type { SkaterCategoryTotals } from './skater-categories';
import type { SyncWrite } from './write';

export interface PlayerSeasonRow {
    id: string;
    name: string;
    /** null for a free agent */
    teamSeasonId: number | null;
    nhlTeam: string | null;
    positions: string[];
    fpts: number;
    fpg: number;
    /** games played so far (GLOSSARY.md), 0 for none */
    gamesPlayed: number;
}

/**
 * The kept players' seasons from Fantrax's table, each with its games played from `games` (games-played.ts), or a
 * rejection when a player or fantasy team doesn't fit the current season or a scorer has no games played.
 */
export function playerSeasonRows(season: CurrentSeason, players: FantraxPlayer[], games: ReadonlyMap<string, number>): PlayerSeasonRow[] {
    const seen = new Set<string>();
    return players.flatMap(player => {
        if (!player.id || player.id.includes('*') || !player.name) throw new Error(`Fantrax's player table has an invalid player (${JSON.stringify(player.id)}).`);
        if (seen.has(player.id)) throw new Error(`Fantrax's player table has player ${player.id} more than once.`);
        seen.add(player.id);
        let teamSeasonId: number | null = null;
        if (player.teamId !== null) {
            const team = season.team(player.teamId);
            if (!team) throw new Error(`Fantrax's player table has ${player.name} on team ${player.teamId}, which the league configuration does not map for ${season.seasonYear}.`);
            teamSeasonId = season.teamSeasonId(team);
        }
        const gamesPlayed = games.get(player.id) ?? 0;
        // a scorer's games would go uncounted, so their career FP/G would be wrong
        if (player.points !== 0 && gamesPlayed === 0) {
            throw new Error(`Player ${player.id} scored but neither Fantrax's skater table nor its goalie table lists games played for them.`);
        }
        // A ring or award player Fantrax no longer lists is kept by the write, not here.
        if (player.points === 0 && teamSeasonId === null && gamesPlayed === 0) return [];
        return [{ id: player.id, name: player.name, teamSeasonId, nhlTeam: player.nhlTeam, positions: player.positions,
            fpts: player.points, fpg: player.perGame ?? 0, gamesPlayed }];
    });
}

/**
 * The writes that bring the season's players up to date, each changing a row only where a value differs. Every part
 * touches its own rows: new players, renamed players, kept player seasons, player seasons no longer kept, and ring or
 * award players Fantrax no longer lists (kept with no points, games played or roster spot, and the skater categories
 * they had).
 *
 * A kept player season's skater categories are written with the rest of it when anything else about it changed, and
 * on their own otherwise, so the two parts touch different rows; a third part only counts the player seasons whose
 * categories change, which is what expires the record book.
 *
 * `ringed` is the championship roster this run writes: every part of the run's statement sees the roster as it was
 * before the statement, so its players are kept as ring players here.
 */
export function playerSeasonsWrites(seasonYear: number, rows: (PlayerSeasonRow & SkaterCategoryTotals)[], ringed: string[] = []): SyncWrite[] {
    const payload = JSON.stringify(rows);
    /** the skater category columns, each spelled by `spell`, comma-separated */
    const categories = (spell: (column: PlayerStat) => string) => sql.raw(SKATER_CATEGORIES.map(spell).join(', '));
    const kept = sql`(select k.id from jsonb_to_recordset(${payload}::jsonb) as k(id text))`;
    const seasons = sql`jsonb_to_recordset(${payload}::jsonb) as s(id text, "teamSeasonId" int, "nhlTeam" text, positions text[], fpts numeric, fpg numeric,
        "gamesPlayed" int, ${categories(column => `${column} int`)})`;
    const categoriesChanged = sql`(${categories(column => `ps.${column}`)}) is distinct from (${categories(column => `s.${column}`)})`;
    // on the season's championship roster (or the one this run writes) or an award list
    const listed = sql`(
        exists (select 1 from league.championship_rosters c where c.season_year = ${seasonYear} and c.player_id = ps.player_id)
        or ps.player_id in (select jsonb_array_elements_text(${JSON.stringify(ringed)}::jsonb))
        or exists (select 1 from league.awards a where a.season_year = ${seasonYear} and a.player_id = ps.player_id))`;
    return [
        {
            // a new player always comes with a new player season, which is what counts
            count: null,
            change: 'stats',
            statement: sql`
                insert into league.players (id, name)
                select s.id, s.name from jsonb_to_recordset(${payload}::jsonb) as s(id text, name text)
                where not exists (select 1 from league.players p where p.id = s.id)
                on conflict (id) do nothing
                returning id`,
        },
        {
            // a renamed player changes how each of their seasons reads
            count: 'playerSeasons',
            change: 'stats',
            statement: sql`
                update league.players p set name = s.name
                from jsonb_to_recordset(${payload}::jsonb) as s(id text, name text)
                where p.id = s.id and p.name is distinct from s.name
                returning p.id`,
        },
        {
            count: 'playerSeasons',
            change: 'stats',
            statement: sql`
                insert into league.player_seasons as ps (player_id, season_year, team_season_id, nhl_team, positions, fpts, fpg, games_played, ${categories(column => column)})
                select s.id, ${seasonYear}, s."teamSeasonId", s."nhlTeam", s.positions, round(s.fpts, 2), round(s.fpg, 2), s."gamesPlayed", ${categories(column => `s.${column}`)}
                from ${seasons}
                on conflict (player_id, season_year) do update
                set team_season_id = excluded.team_season_id, nhl_team = excluded.nhl_team, positions = excluded.positions,
                    fpts = excluded.fpts, fpg = excluded.fpg, games_played = excluded.games_played,
                    ${categories(column => `${column} = excluded.${column}`)}
                where (ps.team_season_id, ps.nhl_team, ps.positions, ps.fpts, ps.fpg, ps.games_played)
                      is distinct from (excluded.team_season_id, excluded.nhl_team, excluded.positions, excluded.fpts, excluded.fpg, excluded.games_played)
                returning ps.player_id`,
        },
        {
            // the player seasons the part above leaves alone: only their skater categories changed
            count: null,
            change: 'skaterCategories',
            statement: sql`
                update league.player_seasons ps
                set ${categories(column => `${column} = s.${column}`)}
                from ${seasons}
                where ps.player_id = s.id and ps.season_year = ${seasonYear}
                  and (ps.team_season_id, ps.nhl_team, ps.positions, ps.fpts, ps.fpg, ps.games_played)
                      is not distinct from (s."teamSeasonId", s."nhlTeam", s.positions, round(s.fpts, 2), round(s.fpg, 2), s."gamesPlayed")
                  and ${categoriesChanged}
                returning ps.player_id`,
        },
        {
            // writes nothing: the kept player seasons, new ones included, whose skater categories the two parts above change
            count: 'skaterCategories',
            change: 'skaterCategories',
            statement: sql`
                select s.id from ${seasons}
                left join league.player_seasons ps on ps.player_id = s.id and ps.season_year = ${seasonYear}
                where ${categoriesChanged}`,
        },
        {
            count: 'playerSeasons',
            change: 'stats',
            statement: sql`
                delete from league.player_seasons ps
                where ps.season_year = ${seasonYear} and ps.player_id not in ${kept} and not ${listed}
                returning ps.player_id`,
        },
        {
            count: 'playerSeasons',
            change: 'stats',
            statement: sql`
                update league.player_seasons ps set team_season_id = null, fpts = 0, fpg = 0, games_played = 0
                where ps.season_year = ${seasonYear} and ps.player_id not in ${kept} and ${listed}
                  and (ps.team_season_id is not null or ps.fpts <> 0 or ps.fpg <> 0 or ps.games_played <> 0)
                returning ps.player_id`,
        },
    ];
}
