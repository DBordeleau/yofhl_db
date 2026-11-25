// A league to exercise the season sync through its run operation: a disposable league for the database, the
// in-memory binding of its Fantrax reads and the live season on its in-memory source. Tests arrange what Fantrax
// says by changing `fantrax` (and `live`, the live season's weeks, playoffs and scores), pass the current time to
// each run, and read the result through the site's own readers.
import type { TestContext } from 'node:test';
import type { WeekScores } from '@/lib/fantrax/live-season';
import { createMemoryLiveSeason, type MemoryState } from '@/lib/fantrax/memory-live-season';
import { SKATER_CATEGORIES, type PlayerCategories } from '@/lib/records/player-stats';
import { disposableLeague } from '@/lib/testing/disposable-league';
import { createMemoryFantrax, type MemoryFantraxState } from '../memory-fantrax';
import type { FantraxGoalie, FantraxPlayer, FantraxRosterPeriod, FantraxRosterSlot, FantraxSkater, FantraxWeek } from '../ports';
import type { SkaterCategoryTotals } from '../skater-categories';

export const SEASON = 2027;
export const LEAGUE_ID = 'league27';
export const FRANCHISES = [1, 2, 3, 4];
/** Fantrax's first playoff week: the Quarterfinals, then the Semifinals (23) and the two-week Final (24) */
export const FIRST_PLAYOFF_WEEK = 22;
const DAY = 86400 * 1000;
/** midnight in Eastern time (the league's time zone), `days` days after October 12, 2026 */
const easternMidnight = (days: number) => {
    const fiveUtc = Date.UTC(2026, 9, 12 + days, 5);
    const hour = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: '2-digit', hourCycle: 'h23' }).format(fiveUtc));
    return fiveUtc - hour * 3600 * 1000;
};

/** The season's 24 weeks: Monday to Sunday in Eastern time from October 12, then a two-week Final ending April 5, 2027. */
export const WEEKS: FantraxWeek[] = Array.from({ length: 24 }, (_, index) => {
    const start = easternMidnight(index * 7);
    const end = index === 23 ? Date.parse('2027-04-05T15:59:58Z') : easternMidnight(index * 7 + 7) - 1000;
    return { number: index + 1, startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString() };
});
/** Fantrax's daily roster periods, numbered from 1: midnight to midnight Eastern, from the first week's start to the Final's last day */
export const ROSTER_PERIODS: FantraxRosterPeriod[] = Array.from({ length: 176 }, (_, index) => {
    const start = easternMidnight(index);
    return { number: index + 1, startDate: new Date(start).toISOString(), endDate: new Date(easternMidnight(index + 1) - 1000).toISOString() };
}).filter(period => Date.parse(period.startDate) <= Date.parse(WEEKS.at(-1)!.endDate));
/** the roster periods of week `week`: those starting inside it */
export const daysOf = (week: number) => ROSTER_PERIODS.filter(period =>
    Date.parse(period.startDate) >= Date.parse(WEEKS[week - 1].startDate) && Date.parse(period.startDate) <= Date.parse(WEEKS[week - 1].endDate)).map(period => period.number);
/** a morning in week 5 */
export const MID_SEASON = Date.parse('2026-11-14T11:00:00Z');
/** the moment the last week's seven-day correction window closes */
export const FREEZES_AT = Date.parse('2027-04-05T15:59:58Z') + 7 * DAY;
/** the moment week `week` ends */
export const endOf = (week: number) => Date.parse(WEEKS[week - 1].endDate);

// Franchises 1–4 (1–N in a league of N teams), owned by Owner 1–4. In 2025–26 (published: franchise 1 beat
// franchise 2 in the Final) franchise N went 10-5-1 with 1000.5 points for and 900.25 against. The opened 2026–27
// season names franchise N "Club N" (CN, /logos/cN.png) in team season 10 + N, all zeros, as the season import
// opens it. Fantrax team fxN is franchise N.
// Players: v1 scored 100 (10 FP/G, 10 games played) for franchise 1 in 2025–26 and was franchise 1's first pick
// in the 2026–27 draft; v2 scored 120 (12 FP/G, 10 games played) for franchise 2.
const seed = (opened: boolean, franchises: number[]) => `
    insert into league.seasons values (2026, '2025–26', 'complete') ${opened ? `, (${SEASON}, '2026–27', 'complete')` : ''};
    insert into league.franchises (id, display_name, first_season) values ${franchises.map(id => `(${id}, 'Franchise ${id}', 2020)`).join(', ')};
    insert into league.owners (id, name) values ${franchises.map(id => `(${id}, 'Owner ${id}')`).join(', ')};
    insert into league.team_seasons (id, season_year, franchise_id, owner_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against, logo_url)
        values ${franchises.map(id => `(${id}, 2026, ${id}, ${id}, 'Old ${id}', 'Old ${id}', 'O${id}', 1, ${id}, 10, 5, 1, 1000.5, 900.25, '/logos/o${id}.png')`).join(', ')}
        ${opened ? `, ${franchises.map(id => `(${10 + id}, ${SEASON}, ${id}, ${id}, 'Club ${id}', 'Club ${id}', 'C${id}', 1, ${id}, 0, 0, 0, 0, 0, '/logos/c${id}.png')`).join(', ')}` : ''};
    insert into league.matchups (season_year, stage, round, bracket, slot, away_team_season_id, home_team_season_id, away_score, home_score, winner_team_season_id)
        values (2026, 'playoff', 3, 'championship', 1, 1, 2, 300, 250, 1);
    insert into league.fantrax_teams (season_year, fantrax_league_id, fantrax_team_id, franchise_id)
        values ${franchises.map(id => `(${SEASON}, '${LEAGUE_ID}', 'fx${id}', ${id})`).join(', ')};
    insert into league.players (id, name) values ('v1', 'Name v1'), ('v2', 'Name v2');
    insert into league.player_seasons (player_id, season_year, team_season_id, nhl_team, positions, fpts, fpg, games_played)
        values ('v1', 2026, 1, 'EDM', '{C}', 100, 10, 10), ('v2', 2026, 2, 'TOR', '{LW,RW}', 120, 12, 10);
    ${opened ? `insert into league.draft_picks (season_year, overall, round, pick, franchise_id, team_name, player_id, player_name, positions, drafted_on, source_time, source_file)
        values (${SEASON}, 1, 1, 1, 1, 'Club 1', 'v1', 'Name v1', 'C', '2026-10-01', '8:00', 'draft.csv');` : ''}
`;

/** a standings row: [Fantrax team number, rank, wins, losses, ties, points for, points against] */
export type StandingRow = [number, number, number, number, number, number, number];
const standingsOf = (rows: StandingRow[]) => rows.map(([team, rank, wins, losses, ties, pointsFor, pointsAgainst]) =>
    ({ teamId: `fx${team}`, rank, wins, losses, ties, pointsFor, pointsAgainst }));

/**
 * a player in Fantrax's player stats table: [player ID, FPts, FP/G, Fantrax team number or null for a free agent,
 * games played]. Games played defaults to 10 for a player with points and 0 for one without.
 */
export type PlayerRow = [string, number, number | null, number | null, number?];
/** each player as Fantrax lists them: named "Name <id>", a centre for Edmonton unless the test says otherwise */
const playersOf = (rows: PlayerRow[]): FantraxPlayer[] => rows.map(([id, points, perGame, team]) =>
    ({ id, name: `Name ${id}`, positions: ['C'], nhlTeam: 'EDM', teamId: team === null ? null : `fx${team}`, points, perGame }));
/** games played by player ID, as `rows` give them */
const gamesOf = (rows: PlayerRow[]) => new Map(rows.map(([id, points, , , games]) => [id, games ?? (points === 0 ? 0 : 10)]));

/** a skater's categories in Fantrax's skater table: [player ID, goals, assists, shots, hits, blocks], or [player ID, null] for one with no games played */
export type SkaterRow = [string, number, number, number, number, number] | [string, null];
const categoriesOf = (rows: SkaterRow[]) => new Map(rows.map(row => [row[0], row[1] === null
    ? null : { goals: row[1], assists: row[2], shots: row[3], hits: row[4], blocks: row[5] }]));

/** Fantrax's scores for `games` in week `week`: [away team, home team, away score, home score] each */
const weekScoresOf = (week: number, games: GameScore[], fetchedAt: string): WeekScores => ({
    fetchedAt, week, matchups: games.map(([away, home, awayScore, homeScore]) => ({
        away: { teamId: `fx${away}`, score: awayScore, gamesPlayed: 0 }, home: { teamId: `fx${home}`, score: homeScore, gamesPlayed: 0 },
    })),
});

/** Fantrax's state, every week scored 0–0 between teams paired in order (fx1 v fx2, fx3 v fx4, …) until a test scores it */
export function fantraxState(franchises = FRANCHISES): MemoryFantraxState {
    const pairs = franchises.flatMap((id, index): GameScore[] => index % 2 === 0 && franchises[index + 1] ? [[id, franchises[index + 1], 0, 0]] : []);
    return {
        leagueId: LEAGUE_ID,
        leagueInfo: { seasonYear: SEASON, weeks: structuredClone(WEEKS), rosterPeriods: structuredClone(ROSTER_PERIODS) },
        standings: standingsOf(franchises.map(id => [id, id, 0, 0, 0, 0, 0])),
        players: [],
        skaters: [],
        goalies: [],
        // every team's roster is empty every day until a test fills it
        rosters: Object.fromEntries(ROSTER_PERIODS.map(period => [period.number, Object.fromEntries(franchises.map(id => [`fx${id}`, []]))])),
        directory: {},
        scores: Object.fromEntries(WEEKS.map(week => [week.number, weekScoresOf(week.number, pairs, week.endDate)])),
        down: new Set(),
    };
}

/** a pairing of Fantrax team numbers, away then home; null is the bye opposite a top seed */
export type Pairing = [number | null, number | null];
/** a game's scores: [away team, home team, away score, home score] */
export type GameScore = [number, number, number, number];

/**
 * The live season as Fantrax has it: the same weeks, team fxN ranked N, and the playoffs from week 22, its
 * schedule giving the league's seeding for six teams until the Quarterfinals are seeded (byes for seeds 1 and 2,
 * 5 v 4 and 6 v 3).
 */
export function liveSeasonState(franchises = FRANCHISES): MemoryState {
    const teams = franchises.map(id => ({ id: `fx${id}`, name: `Fantrax ${id}` }));
    const fetchedAt = WEEKS[0].startDate;
    return {
        fantraxTeams: franchises.map(id => ({ seasonYear: SEASON, fantraxLeagueId: LEAGUE_ID, fantraxTeamId: `fx${id}`, franchiseId: id })),
        franchises: franchises.map(id => ({ id, name: `Club ${id}`, abbreviation: `C${id}`, logo: `/logos/c${id}.png`, owner: `Owner ${id}` })),
        archivedPlayerIds: [],
        fantrax: {
            core: {
                fetchedAt, seasonYear: SEASON, teams, weeks: structuredClone(WEEKS), lineupPeriod: null, schedule: [],
                standings: teams.map((team, index) => ({ teamId: team.id, rank: index + 1, record: '0-0-0', points: 0 })),
                rosters: {}, players: {},
                playoffs: {
                    lastRegularSeasonPeriod: FIRST_PLAYOFF_WEEK - 1, firstPlayoffPeriod: FIRST_PLAYOFF_WEEK, numPlayoffTeams: 6,
                    seeding: [{ away: null, home: 1 }, { away: 5, home: 4 }, { away: null, home: 2 }, { away: 6, home: 3 }],
                },
            },
            scores: {},
            leaders: { fetchedAt, players: [] },
            rosterStats: { fetchedAt, players: {} },
        },
        saved: null,
        manualFinalWeeks: {},
        down: new Set(),
    };
}

export async function seasonSyncLeague(t: TestContext, options: { opened?: boolean; teams?: number } = {}) {
    const franchises = Array.from({ length: options.teams ?? FRANCHISES.length }, (_, index) => index + 1);
    // The live season reports the sections it cannot load (scores for a week a test hasn't scored), which runs don't
    // read; a failed run's log is kept for the test to check. Anything else is logged as usual.
    const failureLogs: string[] = [];
    const log = console.error.bind(console);
    t.mock.method(console, 'error', (...args: unknown[]) => {
        const [message] = args;
        if (typeof message === 'string' && message.startsWith('Live season ')) return;
        if (typeof message === 'string' && message.startsWith('The season sync of ')) failureLogs.push(message);
        else log(...args);
    });
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: seed(options.opened ?? true, franchises) });
    // Modules that touch Next load after the league stands in for it.
    const { createSeasonSync } = await import('../create-season-sync');
    const fantrax = fantraxState(franchises);
    // Fantrax's skater and goalie tables list every player in its player stats table with their games played, a
    // goalie (positions G) in the goalie table and anyone else in the skater table, and the skater table also lists
    // every skater `setSkaters` names. A skater's categories are the ones `setSkaters` gives, none otherwise.
    let games = new Map<string, number>();
    let categories = new Map<string, PlayerCategories | null>();
    Object.defineProperties(fantrax, {
        skaters: { enumerable: true, get: (): FantraxSkater[] => {
            const listed = fantrax.players.filter(player => !player.positions.includes('G')).map(player => player.id);
            return [...new Set([...listed, ...categories.keys()])].map(id =>
                ({ id, gamesPlayed: games.get(id) ?? (categories.get(id) ? 10 : 0), categories: categories.get(id) ?? null }));
        } },
        goalies: { enumerable: true, get: (): FantraxGoalie[] => fantrax.players.filter(player => player.positions.includes('G'))
            .map(player => ({ id: player.id, gamesPlayed: games.get(player.id) ?? 0 })) },
    });
    const live = liveSeasonState(franchises);
    // The live season's clock is the run's: it serves a week's scores only once the week has started.
    let clock = Date.now();
    const liveSeason = createMemoryLiveSeason(live, { now: () => clock });
    const sync = createSeasonSync({ fantrax: createMemoryFantrax(fantrax), liveSeason });
    /** when the evening refresh last saved the live season, or null for the evening before each run */
    let refreshedAt: number | null = null;
    /** one run at `now`, as the cron route runs it, with the tags it expired */
    const run = (now: number) => {
        clock = now;
        // the live season and its scores as the evening refresh saved them, at 11 p.m. Eastern unless it stopped
        const fetchedAt = new Date(refreshedAt ?? now - 7 * 3600_000).toISOString();
        live.fantrax.core.fetchedAt = fetchedAt;
        for (const scores of Object.values(live.fantrax.scores)) scores.fetchedAt = fetchedAt;
        return league.runAsRoute('/api/cron/season-sync', () => sync.run({ now }));
    };
    /** the evening refresh fails from `time` on (its last snapshot is `time`'s), or works again with null */
    const refreshStopsAt = (time: number | null) => { refreshedAt = time; };
    /** a read through the site, as a page makes it */
    const read = async <T>(fn: () => Promise<T>) => (await league.runAsRoute('/', fn)).result;
    /** Fantrax's standings table now reads `rows` */
    const setStandings = (rows: StandingRow[]) => { fantrax.standings = standingsOf(rows); };
    /** Fantrax's player stats table now lists `rows` (every NHL player, scored or not), each also in Fantrax's player directory */
    const setPlayers = (rows: PlayerRow[]) => {
        fantrax.players = playersOf(rows);
        games = gamesOf(rows);
        for (const { id, name, positions, nhlTeam } of fantrax.players) fantrax.directory[id] ??= { name, positions, nhlTeam };
    };
    /** Fantrax's skater table now gives `rows`' skater categories */
    const setSkaters = (rows: SkaterRow[]) => { categories = categoriesOf(rows); };
    /**
     * Each player season's stored goals, assists, shots, hits and blocks in `year`, by player ID, or null where none
     * are stored. Read from the table, as the record book shows only the ranked ones.
     */
    const skaterCategories = async (year: number) => {
        const { rows } = await league.client.query<{ id: string } & SkaterCategoryTotals>(
            `select player_id as id, ${SKATER_CATEGORIES.join(', ')} from league.player_seasons where season_year = $1 order by player_id`, [year]);
        return Object.fromEntries(rows.map(({ id, ...totals }) => [id, Object.values(totals).every(value => value === null) ? null : totals]));
    };
    const core = live.fantrax.core;
    /**
     * Fantrax publishes week `week`'s pairings, in its schedule's order. Publishing the first playoff week's
     * pairings replaces its seeding, as Fantrax's schedule does once the round is seeded.
     */
    const setPairings = (week: number, pairings: Pairing[]) => {
        core.schedule = [...core.schedule.filter(round => round.week !== week), {
            week, matchups: pairings.map(([away, home]) => ({ away: away === null ? {} : { id: `fx${away}` }, home: home === null ? {} : { id: `fx${home}` } })),
        }];
        if (week === core.playoffs.firstPlayoffPeriod) delete core.playoffs.seeding;
    };
    /**
     * Fantrax's scores for week `week` (a stat correction, once the week has been scored), as the run reads them and
     * as the evening refresh saves them
     */
    const setScores = (week: number, games: GameScore[]) => {
        live.fantrax.scores[week] = weekScoresOf(week, games, core.fetchedAt);
        fantrax.scores[week] = weekScoresOf(week, games, core.fetchedAt);
    };
    /** team fx`team` has `players` (each with its slot) on its roster on each of `days`, roster period numbers, and no one else */
    const setRoster = (team: number, days: number[], players: [string, FantraxRosterSlot][]) => {
        for (const day of days) fantrax.rosters[day][`fx${team}`] = players.map(([id, status]) => ({ id, status }));
    };
    /** an admin marks week `week` final */
    const markFinal = (week: number) => { live.manualFinalWeeks[SEASON] = [...live.manualFinalWeeks[SEASON] ?? [], week]; };
    return { league, fantrax, live, sync, run, read, setStandings, setPlayers, setSkaters, skaterCategories, setPairings, setScores, markFinal, setRoster, refreshStopsAt, failureLogs };
}
