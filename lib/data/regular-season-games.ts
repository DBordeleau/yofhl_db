// The regular-season games and weeks the season sync stores (GLOSSARY.md, "Regular-season game"), for the seasons
// after the checked-in history. The record book and Compare read the history files for 2026 and earlier, then these.
import { sql } from 'drizzle-orm';
import { HISTORY_THROUGH, type PeriodInfo } from '@/lib/records/model';
import type { RivalryGame } from '@/lib/rivalries/model';
import { rows } from './db';

/** every stored regular-season game after the history, oldest first; its id is its positive `matchups` row id */
export const storedRegularSeasonGames = () => rows<RivalryGame>(sql`
    select m.id, m.season_year as year, m.stage, m.round, max(m.round) over (partition by m.season_year) as "finalRound",
           a.franchise_id as away, h.franchise_id as home, a.name as "awayName", h.name as "homeName",
           m.away_score::float8 as "awayScore", m.home_score::float8 as "homeScore", w.franchise_id as winner,
           m.score_adjusted as adjusted, m.note
    from league.matchups m
    join league.season_teams a on a.team_season_id = m.away_team_season_id
    join league.season_teams h on h.team_season_id = m.home_team_season_id
    left join league.team_seasons w on w.id = m.winner_team_season_id
    where m.stage = 'regular' and m.season_year > ${HISTORY_THROUGH}
    order by m.season_year, m.round, m.slot`);

// A week's days are calendar days in Eastern time, from its start's to the day after its last second's: Fantrax's
// Monday-to-Monday week is seven, as the checked-in history counts it, whose end is the next week's start date.
const endDay = sql`((ends_at + interval '1 second') at time zone 'America/Toronto')::date`;
const startDay = sql`(starts_at at time zone 'America/Toronto')::date`;

/** every stored week after the history, as the record book reads weeks: its days, its start and its end (the next week's start) as Eastern dates */
export const storedWeeks = () => rows<PeriodInfo>(sql`
    select season_year as year, week as period, ${endDay} - ${startDay} as days, season_year as era,
           to_char(${startDay}, 'YYYY-MM-DD') as start, to_char(${endDay}, 'YYYY-MM-DD') as "end"
    from league.weeks where season_year > ${HISTORY_THROUGH}
    order by season_year, week`);
