import { sql } from 'drizzle-orm';
import { cached, rows } from './db';
import { getFranchiseCards } from './league';
import { visibleTransactionEvents } from '@/lib/history/visibility';
import type { RivalryGame, RivalrySeason, RivalryTrade } from '@/lib/rivalries/model';
import regularSeason from '@/lib/rivalries/regular-season-history.json';

export const getRivalryData = cached(async () => {
    const [teams, games, seasons, trades] = await Promise.all([
        getFranchiseCards(),
        rows<RivalryGame>(sql`
            select m.id, m.season_year as year, m.stage, m.round,
                   max(m.round) over (partition by m.season_year) as "finalRound",
                   a.franchise_id as away, h.franchise_id as home, a.name as "awayName", h.name as "homeName",
                   m.away_score::float8 as "awayScore", m.home_score::float8 as "homeScore", w.franchise_id as winner,
                   m.score_adjusted as adjusted, nullif(concat_ws(' · ', m.note, o.note), '') as note
            from league.matchups m
            join league.team_seasons a on a.id = m.away_team_season_id
            join league.team_seasons h on h.id = m.home_team_season_id
            left join league.team_seasons w on w.id = m.winner_team_season_id
            left join league.matchup_overrides o on o.season_year = m.season_year and o.round = m.round
                and o.franchise_a = least(a.franchise_id, h.franchise_id) and o.franchise_b = greatest(a.franchise_id, h.franchise_id)
            where m.stage = 'playoff' and m.bracket = 'championship' and m.season_year <> 2020
            order by m.season_year desc, m.round desc, m.id`),
        rows<RivalrySeason>(sql`select season_year as year, franchise_id as team, fpts_for::float8 as points, wins, losses, ties from league.team_seasons order by season_year desc`),
        rows<RivalryTrade>(sql`
            select e.id, to_char(e.occurred_on, 'YYYY-MM-DD') as date, e.season_year as year,
                   jsonb_agg(jsonb_build_object('id', a.id, 'from', a.from_franchise_id, 'to', a.to_franchise_id,
                       'label', a.label, 'playerId', a.player_id) order by a.source_row) as assets
            from league.transaction_events e join league.transaction_assets a on a.event_id = e.id
            where e.kind = 'trade' and ${visibleTransactionEvents}
            group by e.id order by e.occurred_on desc, e.id`),
    ]);
    // Local demo snapshot, verified against every team's archived record and points.
    const regularGames: RivalryGame[] = regularSeason.games.map(game => ({ ...game, stage: 'regular' }));
    return { teams, games: [...games, ...regularGames], seasons, trades };
}, 'rivalry-demo-v2');
