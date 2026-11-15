// A league to exercise the award vote module through its operations: a disposable league for the database, the
// in-memory Fantrax and NHL lookup, and a fake clock. Tests arrange what Fantrax says through the helpers below
// (or `fantrax` directly), arrange the archive with the roster helpers, and read results through the module.
import type { TestContext } from 'node:test';
import { disposableLeague } from '@/lib/testing/disposable-league';
import { createMemoryAwardVoteFantrax, rangeKey, type MemoryAwardVoteFantraxState } from '../memory-fantrax';
import { createMemoryNhl, type MemoryNhlState } from '../memory-nhl';
import type { FantraxRosterPeriod, FantraxWeek, NhlPlayerRecord, RangedGoalie, RangedSkater } from '../ports';

export const SEASON = 2027;
export const LEAGUE_ID = 'league27';
export const FRANCHISES = [1, 2, 3, 4];
/** the Quarterfinals; the Semifinals are week 5 and the Final week 6 */
export const FIRST_PLAYOFF_WEEK = 4;

// The season's dates, written out (not derived from the weeks below) so the tests check the module's reading of them.
/** weeks 1–3: Monday October 12 to Sunday November 1, 2026 */
export const REGULAR_SEASON = { startDate: '2026-10-12', endDate: '2026-11-01' };
/** weeks 4–6 */
export const PLAYOFF_ROUNDS = { startDate: '2026-11-02', endDate: '2026-11-22' };
/** week 6 */
export const FINAL = { startDate: '2026-11-16', endDate: '2026-11-22' };

const EASTERN = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
/** the instant a clock in Eastern time reads `time` on `date` */
function eastern(date: string, time: string) {
    for (const offset of ['-04:00', '-05:00']) {
        const instant = Date.parse(`${date}T${time}:00${offset}`);
        if (EASTERN.format(instant).replace(',', '') === `${date} ${time}`) return instant;
    }
    throw new Error(`${date} ${time} is not a time in Eastern`);
}
const dayAfterOctober11 = (days: number) => new Date(Date.UTC(2026, 9, 12 + days)).toISOString().slice(0, 10);
/**
 * Each day's first lock, from Monday October 12, 2026 for six weeks: 7 p.m. Eastern, except Sundays at 10:30 p.m.,
 * which is already Monday in UTC (and November 1 is the day daylight time ends).
 */
const LOCKS = Array.from({ length: 42 }, (_, day) => eastern(dayAfterOctober11(day), day % 7 === 6 ? '22:30' : '19:00'));
const SEASON_END = eastern('2026-11-23', '11:59');
const iso = (instant: number) => new Date(instant).toISOString();

/** Fantrax's daily roster periods, numbered from 1: from one day's first lock to the next's */
export const ROSTER_PERIODS: FantraxRosterPeriod[] = LOCKS.map((start, index) =>
    ({ number: index + 1, startDate: iso(start), endDate: iso((LOCKS[index + 1] ?? SEASON_END + 1000) - 1000) }));
/** six seven-day weeks, each from its Monday's first lock */
export const WEEKS: FantraxWeek[] = Array.from({ length: 6 }, (_, index) =>
    ({ number: index + 1, startDate: iso(LOCKS[index * 7]), endDate: iso((LOCKS[index * 7 + 7] ?? SEASON_END + 1000) - 1000) }));

/** a skater in Fantrax's skater table: a centre for Edmonton called "Skater <id>", aged 25, unless `more` says otherwise */
export const skater = (id: string, points: number, more: Partial<RangedSkater> = {}): RangedSkater => ({
    id, name: `Skater ${id}`, positions: 'C', nhlTeam: 'EDM', age: 25, points, perGame: points === 0 ? null : points / 10,
    gamesPlayed: points === 0 ? 0 : 10, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, ...more,
});
/** a goalie in Fantrax's goalie table, called "Goalie <id>", for Toronto, aged 28, unless `more` says otherwise */
export const goalie = (id: string, points: number, more: Partial<RangedGoalie> = {}): RangedGoalie => ({
    id, name: `Goalie ${id}`, positions: 'G', nhlTeam: 'TOR', age: 28, points, perGame: points === 0 ? null : points / 10,
    gamesPlayed: points === 0 ? 0 : 10, wins: 0, goalsAgainst: 0, saves: 0, shutouts: 0, ...more,
});

// Franchises 1–4, owned by Owner 1–4. The 2025–26 season (2026) names franchise N "Old N" in team season N and is
// published: franchise 1 beat franchise 2. The 2026–27 season (2027) names franchise N "Club N" (CN,
// /logos/cN.png) in team season 10 + N; with `champion`, franchise 1 beat franchise 2 in its Final. Fantrax team fxN
// of league27 is franchise N in 2027.
const seed = (champion: boolean) => `
    insert into league.seasons values (2026, '2025–26', 'complete'), (${SEASON}, '2026–27', 'complete');
    insert into league.franchises (id, display_name, first_season) values ${FRANCHISES.map(id => `(${id}, 'Franchise ${id}', 2020)`).join(', ')};
    insert into league.owners (id, name) values ${FRANCHISES.map(id => `(${id}, 'Owner ${id}')`).join(', ')};
    insert into league.team_seasons (id, season_year, franchise_id, owner_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against, logo_url)
        values ${FRANCHISES.map(id => `(${id}, 2026, ${id}, ${id}, 'Old ${id}', 'Old ${id}', 'O${id}', 1, ${id}, 10, 5, 1, 1000, 900, '/logos/o${id}.png')`).join(', ')},
               ${FRANCHISES.map(id => `(${10 + id}, ${SEASON}, ${id}, ${id}, 'Club ${id}', 'Club ${id}', 'C${id}', 1, ${id}, 10, 5, 1, 1000, 900, '/logos/c${id}.png')`).join(', ')};
    insert into league.matchups (season_year, stage, round, bracket, slot, away_team_season_id, home_team_season_id, away_score, home_score, winner_team_season_id)
        values (2026, 'playoff', 3, 'championship', 1, 1, 2, 300, 250, 1)
        ${champion ? `, (${SEASON}, 'playoff', 3, 'championship', 1, 11, 12, 300, 250, 11)` : ''};
    insert into league.fantrax_teams (season_year, fantrax_league_id, fantrax_team_id, franchise_id)
        values ${FRANCHISES.map(id => `(${SEASON}, '${LEAGUE_ID}', 'fx${id}', ${id})`).join(', ')};
`;

export function fantraxState(): MemoryAwardVoteFantraxState {
    return {
        leagueId: LEAGUE_ID,
        leagueInfo: { seasonYear: SEASON, weeks: structuredClone(WEEKS), rosterPeriods: structuredClone(ROSTER_PERIODS), firstPlayoffWeek: FIRST_PLAYOFF_WEEK },
        // no one has played over any stretch until a test says so
        skaters: { [rangeKey(REGULAR_SEASON)]: [], [rangeKey(PLAYOFF_ROUNDS)]: [], [rangeKey(FINAL)]: [] },
        goalies: { [rangeKey(REGULAR_SEASON)]: [], [rangeKey(PLAYOFF_ROUNDS)]: [], [rangeKey(FINAL)]: [] },
        rosters: Object.fromEntries(ROSTER_PERIODS.map(period => [period.number, Object.fromEntries(FRANCHISES.map(id => [`fx${id}`, []]))])),
        down: new Set(),
        reads: [],
    };
}

/** after the 2027 Final */
export const AFTER_FINAL = Date.parse('2026-11-25T12:00:00Z');

export async function awardVoteLeague(t: TestContext, options: { champion?: boolean } = {}) {
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: seed(options.champion ?? true) });
    // Modules that touch Next load after the league stands in for it.
    const { rows, writeInOrder } = await import('@/lib/data/db');
    const { createAwardVote } = await import('../create-award-vote');
    const fantrax = fantraxState();
    const nhlState: MemoryNhlState = { players: {}, failing: new Set(), lookups: [] };
    /** the fake clock: tests set or advance `clock.time` */
    const clock = { time: AFTER_FINAL };
    const vote = createAwardVote({
        clock: { now: () => clock.time },
        fantrax: createMemoryAwardVoteFantrax(fantrax),
        nhl: createMemoryNhl(nhlState),
        db: { rows, writeInOrder },
    });
    /** an operation, run as the admin's server action runs it */
    const act = async <T>(fn: () => Promise<T>) => (await league.runAsRoute('/admin/seasons/[year]', fn)).result;
    /** Fantrax's regular-season skater and goalie tables now list these players (every NHL player, scored or not) */
    const setRegularSeason = (skaters: RangedSkater[], goalies: RangedGoalie[] = []) => {
        fantrax.skaters[rangeKey(REGULAR_SEASON)] = skaters;
        fantrax.goalies[rangeKey(REGULAR_SEASON)] = goalies;
    };
    /** prepare in as many calls as it takes, returning the last result and how many calls it took */
    const prepareFully = async (seasonYear = SEASON) => {
        for (let calls = 1; calls <= 20; calls++) {
            const result = await act(() => vote.prepare({ seasonYear }));
            if (!result.ok || result.done) return { result, calls };
        }
        throw new Error('Preparing never finished');
    };
    const players = (ids: string[]) => `insert into league.players (id, name) values ${ids.map(id => `('${id}', 'Archive ${id}')`).join(', ')} on conflict do nothing;`;
    /** the archive has `playerId` on franchise `franchise`'s 2027 roster at the end of the season, or a free agent with null */
    const endedSeasonWith = async (playerId: string, franchise: number | null) => {
        await league.client.exec(`${players([playerId])}
            insert into league.player_seasons (player_id, season_year, team_season_id, nhl_team, positions, fpts, fpg)
            values ('${playerId}', ${SEASON}, ${franchise === null ? 'null' : 10 + franchise}, 'EDM', '{C}', 10, 1);`);
    };
    let transactions = 0;
    /** the archive's 2027 transactions include franchise `from` dropping `playerId` on `on` (`YYYY-MM-DD`) */
    const dropped = async (playerId: string, from: number, on: string) => {
        const id = `t${++transactions}`;
        await league.client.exec(`${players([playerId])}
            insert into league.transaction_events (id, season_year, kind, occurred_at, occurred_on, source_file, source_time)
                values ('${id}', ${SEASON}, 'free_agent', '${on}T17:00:00Z', '${on}', 'transactions.csv', '12:00PM');
            insert into league.transaction_assets (id, event_id, player_id, label, asset_kind, action, from_franchise_id, to_franchise_id, from_name, to_name, source_row)
                values ('${id}-1', '${id}', '${playerId}', 'Archive ${playerId}', 'player', 'drop', ${from}, null, 'Club ${from}', null, ${transactions});`);
    };
    /** the archive's 2027 transactions include franchise `to` claiming `playerId` on `on` */
    const claimed = async (playerId: string, to: number, on: string) => {
        const id = `t${++transactions}`;
        await league.client.exec(`${players([playerId])}
            insert into league.transaction_events (id, season_year, kind, occurred_at, occurred_on, source_file, source_time)
                values ('${id}', ${SEASON}, 'free_agent', '${on}T17:00:00Z', '${on}', 'transactions.csv', '12:00PM');
            insert into league.transaction_assets (id, event_id, player_id, label, asset_kind, action, from_franchise_id, to_franchise_id, from_name, to_name, source_row)
                values ('${id}-1', '${id}', '${playerId}', 'Archive ${playerId}', 'player', 'claim', null, ${to}, null, 'Club ${to}', ${transactions});`);
    };
    /** the archive's 2027 transactions include franchise `from` trading `playerId` to franchise `to` on `on` */
    const traded = async (playerId: string, from: number, to: number, on: string) => {
        const id = `t${++transactions}`;
        await league.client.exec(`${players([playerId])}
            insert into league.transaction_events (id, season_year, kind, occurred_at, occurred_on, source_file, source_time)
                values ('${id}', ${SEASON}, 'trade', '${on}T17:00:00Z', '${on}', 'transactions.csv', '12:00PM');
            insert into league.transaction_assets (id, event_id, player_id, label, asset_kind, action, from_franchise_id, to_franchise_id, from_name, to_name, source_row)
                values ('${id}-1', '${id}', '${playerId}', 'Archive ${playerId}', 'player', 'trade', ${from}, ${to}, 'Club ${from}', 'Club ${to}', ${transactions});`);
    };
    return { league, vote, fantrax, nhl: nhlState, clock, act, setRegularSeason, prepareFully, endedSeasonWith, dropped, claimed, traded };
}

/**
 * the NHL's record of a player: born `birthDate` (a 22-year-old in 2026–27 unless given), with `[season, games]`
 * NHL regular-season games per season (e.g. `[20252026, 12]`)
 */
export const nhlRecord = (seasons: [number, number][] = [], birthDate = '2004-03-01', nhlId = 8480000): NhlPlayerRecord =>
    ({ nhlId, birthDate, seasons: seasons.map(([season, games]) => ({ season, games })) });
