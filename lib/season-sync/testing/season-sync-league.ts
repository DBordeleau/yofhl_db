// A league to exercise the season sync through its run operation: a disposable league for the database and the
// in-memory binding of its Fantrax reads. Tests arrange what Fantrax says by changing `fantrax`, pass the current
// time to each run, and read the result through the site's own readers.
import type { TestContext } from 'node:test';
import { disposableLeague } from '@/lib/testing/disposable-league';
import { createMemoryFantrax, type MemoryFantraxState } from '../memory-fantrax';
import type { FantraxWeek } from '../ports';

export const SEASON = 2027;
export const LEAGUE_ID = 'league27';
export const FRANCHISES = [1, 2, 3, 4];
const DAY = 86400 * 1000;

/** The season's 24 weeks: weekly from October 12, then a two-week Final ending April 5, 2027. */
export const WEEKS: FantraxWeek[] = Array.from({ length: 24 }, (_, index) => {
    const start = Date.parse('2026-10-12T04:00:00Z') + index * 7 * DAY;
    const end = index === 23 ? Date.parse('2027-04-05T15:59:58Z') : start + 7 * DAY - 1000;
    return { number: index + 1, startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString() };
});
/** a morning in week 5 */
export const MID_SEASON = Date.parse('2026-11-14T11:00:00Z');
/** the moment the last week's seven-day correction window closes */
export const FREEZES_AT = Date.parse('2027-04-05T15:59:58Z') + 7 * DAY;

// Franchises 1–4, owned by Owner 1–4. In 2025–26 (published: franchise 1 beat franchise 2 in the Final) franchise
// N went 10-5-1 with 1000.5 points for and 900.25 against. The opened 2026–27 season names franchise N "Club N"
// (CN, /logos/cN.png), all zeros, as the season import opens it. Fantrax team fxN is franchise N.
const seed = (opened: boolean) => `
    insert into league.seasons values (2026, '2025–26', 'complete') ${opened ? `, (${SEASON}, '2026–27', 'complete')` : ''};
    insert into league.franchises (id, display_name, first_season) values ${FRANCHISES.map(id => `(${id}, 'Franchise ${id}', 2020)`).join(', ')};
    insert into league.owners (id, name) values ${FRANCHISES.map(id => `(${id}, 'Owner ${id}')`).join(', ')};
    insert into league.team_seasons (id, season_year, franchise_id, owner_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against, logo_url)
        values ${FRANCHISES.map(id => `(${id}, 2026, ${id}, ${id}, 'Old ${id}', 'Old ${id}', 'O${id}', 1, ${id}, 10, 5, 1, 1000.5, 900.25, '/logos/o${id}.png')`).join(', ')}
        ${opened ? `, ${FRANCHISES.map(id => `(${10 + id}, ${SEASON}, ${id}, ${id}, 'Club ${id}', 'Club ${id}', 'C${id}', 1, ${id}, 0, 0, 0, 0, 0, '/logos/c${id}.png')`).join(', ')}` : ''};
    insert into league.matchups (season_year, stage, round, bracket, slot, away_team_season_id, home_team_season_id, away_score, home_score, winner_team_season_id)
        values (2026, 'playoff', 3, 'championship', 1, 1, 2, 300, 250, 1);
    insert into league.fantrax_teams (season_year, fantrax_league_id, fantrax_team_id, franchise_id)
        values ${FRANCHISES.map(id => `(${SEASON}, '${LEAGUE_ID}', 'fx${id}', ${id})`).join(', ')};
`;

/** a standings row: [Fantrax team number, rank, wins, losses, ties, points for, points against] */
export type StandingRow = [number, number, number, number, number, number, number];
const standingsOf = (rows: StandingRow[]) => rows.map(([team, rank, wins, losses, ties, pointsFor, pointsAgainst]) =>
    ({ teamId: `fx${team}`, rank, wins, losses, ties, pointsFor, pointsAgainst }));

export function fantraxState(): MemoryFantraxState {
    return {
        leagueId: LEAGUE_ID,
        leagueInfo: { seasonYear: SEASON, weeks: structuredClone(WEEKS) },
        standings: standingsOf(FRANCHISES.map(id => [id, id, 0, 0, 0, 0, 0])),
        down: new Set(),
    };
}

export async function seasonSyncLeague(t: TestContext, options: { opened?: boolean } = {}) {
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: seed(options.opened ?? true) });
    // Modules that touch Next load after the league stands in for it.
    const { createSeasonSync } = await import('../create-season-sync');
    const fantrax = fantraxState();
    const sync = createSeasonSync({ fantrax: createMemoryFantrax(fantrax) });
    /** one run at `now`, as the cron route runs it, with the tags it expired */
    const run = (now: number) => league.runAsRoute('/api/cron/season-sync', () => sync.run({ now }));
    /** a read through the site, as a page makes it */
    const read = async <T>(fn: () => Promise<T>) => (await league.runAsRoute('/', fn)).result;
    /** Fantrax's standings table now reads `rows` */
    const setStandings = (rows: StandingRow[]) => { fantrax.standings = standingsOf(rows); };
    return { league, fantrax, sync, run, read, setStandings };
}
