// Regular season: the live season's weeks, and its regular-season games (GLOSSARY.md, "Regular-season game").
//
// Every week of the season is written with its start and end from the league info. A regular-season week's games are
// written once the week is final (its end has passed, or an admin marked it final), from its scores read fresh from
// Fantrax: every final week not stored yet (so the first run backfills the season so far) and every one still inside
// its correction window. After the window closes a stored week is never read or rewritten again. A game is stored
// under its week number as its round, in Fantrax's order; a level score is a tie with no winner, and bracket
// corrections do not apply.
import { sql } from 'drizzle-orm';
import { rows } from '@/lib/data/db';
import { matchupWinner } from '@/lib/data/matchup-winner';
import { correctionWindowClosed, type LiveSeason, type WeekScores } from '@/lib/fantrax/live-season';
import type { CurrentSeason } from './current-season';
import type { FantraxLeagueInfo, FantraxWeek, SeasonSyncPorts } from './ports';
import type { SyncWrite } from './write';

/** a regular-season game as stored: its week, its place in Fantrax's list, both team seasons, both scores and the winning team season */
interface RegularSeasonGame {
    week: number;
    slot: number;
    away: number;
    home: number;
    awayScore: number;
    homeScore: number;
    /** null on a tie */
    winner: number | null;
}

/** the regular-season weeks whose games are read this run */
function weeksToRead(info: FantraxLeagueInfo, live: LiveSeason, stored: Set<number>, now: number): FantraxWeek[] {
    return info.weeks.filter(week => {
        const liveWeek = live.weeks.find(item => item.number === week.number);
        if (liveWeek?.stage !== 'regular') return false;
        const final = now > Date.parse(week.endDate) || liveWeek.manualFinal;
        return final && (!stored.has(week.number) || !correctionWindowClosed(week.endDate, now));
    });
}

/** a week's games from Fantrax's scores, or a rejection unless every team is mapped and plays once */
function gamesOf(season: CurrentSeason, week: number, scores: WeekScores): RegularSeasonGame[] {
    const seen = new Set<string>();
    return scores.matchups.map(({ away, home }, slot) => {
        const [awayTeam, homeTeam] = [away, home].map(side => {
            const team = season.team(side.teamId);
            if (!team) throw new Error(`Fantrax's scores for week ${week} have team ${side.teamId}, which the league configuration does not map for ${season.seasonYear}.`);
            if (seen.has(side.teamId)) throw new Error(`Fantrax's scores for week ${week} have team ${side.teamId} twice.`);
            seen.add(side.teamId);
            return season.teamSeasonId(team);
        });
        return {
            week, slot, away: awayTeam, home: homeTeam, awayScore: away.score, homeScore: home.score,
            winner: matchupWinner({ id: awayTeam, score: away.score }, { id: homeTeam, score: home.score }),
        };
    });
}

const storedWeeksQuery = (seasonYear: number) => sql`
    select distinct round as week from league.matchups where season_year = ${seasonYear} and stage = 'regular'`;

/** Every week and every regular-season game to bring up to date, checked, as their writes. */
export async function readRegularSeason(ports: SeasonSyncPorts, season: CurrentSeason, info: FantraxLeagueInfo, live: LiveSeason, now: number): Promise<SyncWrite[]> {
    const stored = new Set((await rows<{ week: number }>(storedWeeksQuery(season.seasonYear))).map(row => row.week));
    const read = weeksToRead(info, live, stored, now);
    const scores = await Promise.all(read.map(week => ports.fantrax.weekScores(season.leagueId, week.number)));
    const games = read.flatMap((week, index) => gamesOf(season, week.number, scores[index]));
    return [weeksWrite(season.seasonYear, info.weeks), ...games.length ? [gamesWrite(season.seasonYear, games)] : []];
}

/** writes each week's start and end where they differ or the week is new; one row returned per week changed */
const weeksWrite = (seasonYear: number, weeks: FantraxWeek[]): SyncWrite => ({
    count: 'weeks',
    change: 'regularSeason',
    statement: sql`
        insert into league.weeks as w (season_year, week, starts_at, ends_at)
        select ${seasonYear}, x.number, x."startDate", x."endDate"
        from jsonb_to_recordset(${JSON.stringify(weeks)}::jsonb) as x(number smallint, "startDate" timestamptz, "endDate" timestamptz)
        on conflict (season_year, week) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at
        where (w.starts_at, w.ends_at) is distinct from (excluded.starts_at, excluded.ends_at)
        returning w.week`,
});

/** inserts a game not yet stored and rewrites a stored one (by its week and two team seasons) only where a value differs */
const gamesWrite = (seasonYear: number, games: RegularSeasonGame[]): SyncWrite => ({
    count: 'regularSeasonGames',
    change: 'regularSeason',
    statement: sql`
        insert into league.matchups as m (season_year, stage, round, bracket, slot, away_team_season_id, home_team_season_id, away_score, home_score, winner_team_season_id)
        select ${seasonYear}, 'regular', g.week, 'championship', g.slot, g.away, g.home, round(g."awayScore", 2), round(g."homeScore", 2), g.winner
        from jsonb_to_recordset(${JSON.stringify(games)}::jsonb)
            as g(week smallint, slot smallint, away int, home int, "awayScore" numeric, "homeScore" numeric, winner int)
        on conflict (season_year, stage, round, away_team_season_id, home_team_season_id) do update
        set slot = excluded.slot, away_score = excluded.away_score, home_score = excluded.home_score, winner_team_season_id = excluded.winner_team_season_id
        where (m.slot, m.away_score, m.home_score, m.winner_team_season_id)
              is distinct from (excluded.slot, excluded.away_score, excluded.home_score, excluded.winner_team_season_id)
        returning m.id`,
});
