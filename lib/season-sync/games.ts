// The games the season sync stores in league.matchups, playoff and regular-season alike: each one's round (a
// regular-season game's week), slot, team seasons, scores rounded to two places, and winning team season.
import { sql } from 'drizzle-orm';

/** a game as the season sync stores it */
export interface SyncedGame {
    /** a regular-season game's week */
    round: number;
    slot: number;
    away: number;
    home: number;
    awayScore: number;
    homeScore: number;
    /** null when the game has no winner */
    winner: number | null;
}

/** the games as rows `g` */
export const gamesPayload = (games: SyncedGame[]) => sql`jsonb_to_recordset(${JSON.stringify(games)}::jsonb)
    as g(round smallint, slot smallint, away int, home int, "awayScore" numeric, "homeScore" numeric, winner int)`;

/** inserts the games (league.matchups as `m`) in the season's `stage`; each caller adds its own conflict handling and what it returns */
export const insertGames = (seasonYear: number, stage: 'playoff' | 'regular', games: SyncedGame[]) => sql`
    insert into league.matchups as m (season_year, stage, round, bracket, slot, away_team_season_id, home_team_season_id, away_score, home_score, winner_team_season_id)
    select ${seasonYear}, ${stage}, g.round, 'championship', g.slot, g.away, g.home, round(g."awayScore", 2), round(g."homeScore", 2), g.winner
    from ${gamesPayload(games)}`;
