import { sql } from 'drizzle-orm';
import { expectedAwards } from '@/lib/awards';

// The season status query: what each season has so far, newest first. The admin season checklist runs it
// through the web app's driver and the season import runs it through the scripts' driver, so the import's
// printed summary and the checklist always agree. Kept free of Next imports so both sides can share it.

export interface SeasonStatus {
    year: number;
    label: string;
    playoffStatus: 'complete' | 'cancelled';
    teams: number;
    players: number;
    /** Playoff games only. */
    games: number;
    champion: string | null;
    roster: number;
    /** Distinct awards given, so co-winners count once. */
    awards: number;
    awardsExpected: number;
    overrides: number;
}

// The awards a season should have (lib/awards.ts expectedAwards), counted for a season with and without playoffs.
const EXPECTED_WITH_PLAYOFFS = expectedAwards(true).length;
const EXPECTED_WITHOUT_PLAYOFFS = expectedAwards(false).length;

export const SEASON_STATUS_QUERY = sql`
    select s.year, s.label, s.playoff_status as "playoffStatus",
           (select count(*)::int from league.team_seasons t where t.season_year = s.year) as teams,
           (select count(*)::int from league.player_seasons ps where ps.season_year = s.year) as players,
           (select count(*)::int from league.matchups m where m.season_year = s.year and m.stage = 'playoff') as games,
           (select t.name from league.team_seasons t where t.id = r.champion_team_season_id) as champion,
           (select count(*)::int from league.championship_rosters c where c.season_year = s.year) as roster,
           (select count(distinct a.award)::int from league.awards a where a.season_year = s.year) as awards,
           case when s.playoff_status = 'complete' then ${EXPECTED_WITH_PLAYOFFS}::int else ${EXPECTED_WITHOUT_PLAYOFFS}::int end as "awardsExpected",
           (select count(*)::int from league.matchup_overrides o where o.season_year = s.year) as overrides
    from league.seasons s
    left join league.season_results r on r.season_year = s.year
    order by s.year desc`;
