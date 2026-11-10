// A league to exercise Pick'em through its operations: a disposable league for the database, the live season on
// its in-memory source, and the owner session on its in-memory ports. Tests arrange the live season by changing
// `live` (weeks, schedule, scores) and pass the current time to each operation.
import type { TestContext } from 'node:test';
import { createMemoryLiveSeason, type MemoryState, type SourceCore, type SourceWeek } from '@/lib/fantrax/memory-live-season';
import { createMemoryIdentity, createMemoryRequest, createMemoryStorage } from '@/lib/owner/memory-ports';
import { disposableLeague } from '@/lib/testing/disposable-league';
import type { PickemLaunch } from '../model';

export const DAY = 86400 * 1000;
export const SEASON = 2027;
const iso = (time: number) => new Date(time).toISOString();

// Ten active franchises, 1–10, each managed by owner-N; franchise 11 folded and is still managed by owner-11.
// owner-none signs in but manages nothing. Fantrax team fxN is franchise N. Each active franchise's latest team
// season (2026) names it "Franchise N" (F N), run by "Owner N".
export const FRANCHISES = Array.from({ length: 10 }, (_, index) => index + 1);
const SEED = `
    insert into league.seasons values (2026, '2025–26', 'complete');
    insert into league.franchises (id, display_name, first_season, folded_after_season) values
        ${FRANCHISES.map(id => `(${id}, 'Franchise ${id}', 2020, null)`).join(', ')}, (11, 'Folded Club', 2020, 2025);
    insert into league.owners (id, name) values ${FRANCHISES.map(id => `(${id}, 'Owner ${id}')`).join(', ')};
    insert into league.team_seasons (id, season_year, franchise_id, owner_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against, logo_url)
        values ${FRANCHISES.map(id => `(${id}, 2026, ${id}, ${id}, 'Franchise ${id}', 'Franchise ${id}', 'F${id}', 1, ${id}, 0, 0, 0, 0, 0, '/logos/f${id}.png')`).join(', ')};
    insert into league.team_management (franchise_id, owner_uid, owner_email, version) values
        ${[...FRANCHISES, 11].map(id => `(${id}, 'owner-${id}', 'owner${id}@example.test', 1)`).join(', ')};
`;

/** A regular week's default pairings: 1 v 2, 3 v 4, ... 9 v 10, as Fantrax team IDs. */
export const DEFAULT_PAIRS: [number, number][] = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]];
export const scheduleOf = (pairs: [number | null, number | null][]) =>
    pairs.map(([away, home]) => ({ away: away === null ? {} : { id: `fx${away}` }, home: home === null ? {} : { id: `fx${home}` } }));

/**
 * 26 weeks, the last three playoff rounds, placed around the real present so the database clock agrees with the
 * lock: week `nextWeek` starts tomorrow (so it locks tomorrow at noon), and each week before it a week earlier.
 */
export function weeksAroundNow(nextWeek = 6, count = 26): SourceWeek[] {
    const tomorrow = Date.now() + DAY;
    return Array.from({ length: count }, (_, index) => {
        const start = tomorrow + (index + 1 - nextWeek) * 7 * DAY;
        return { number: index + 1, startDate: iso(start), endDate: iso(start + 7 * DAY - 1000) };
    });
}

/** A week's scores, by Fantrax team: [away, home, away score, home score] per matchup */
export const scoresOf = (week: number, fetchedAt: string, scores: [number, number, number, number][]) => ({
    fetchedAt, week, matchups: scores.map(([away, home, awayScore, homeScore]) => ({
        away: { teamId: `fx${away}`, score: awayScore, gamesPlayed: 0 }, home: { teamId: `fx${home}`, score: homeScore, gamesPlayed: 0 },
    })),
});

/**
 * The live season's in-memory state: ten mapped teams, every regular week on the default pairings, each scored
 * nil-nil until a test gives it scores.
 */
export function liveSeasonState(weeks: SourceWeek[] = weeksAroundNow(), seasonYear = SEASON): MemoryState {
    const teams = FRANCHISES.map(id => ({ id: `fx${id}`, name: `Fantrax ${id}` }));
    const regularWeeks = weeks.slice(0, Math.max(weeks.length - 3, 0));
    const core: SourceCore = {
        fetchedAt: weeks[0]?.startDate ?? iso(Date.now()),
        seasonYear,
        teams,
        weeks,
        lineupPeriod: null,
        schedule: regularWeeks.map(week => ({ week: week.number, matchups: scheduleOf(DEFAULT_PAIRS) })),
        standings: teams.map((team, index) => ({ teamId: team.id, rank: index + 1, record: '0-0-0', points: 0 })),
        rosters: {},
        players: {},
        playoffs: {},
    };
    return {
        fantraxTeams: FRANCHISES.map(id => ({ seasonYear, fantraxLeagueId: `league${seasonYear % 100}`, fantraxTeamId: `fx${id}`, franchiseId: id })),
        franchises: FRANCHISES.map(id => ({ id, name: `Franchise ${id}`, abbreviation: `F${id}`, logo: `/logos/f${id}.png`, owner: `Owner ${id}` })),
        archivedPlayerIds: [],
        fantrax: {
            core,
            scores: Object.fromEntries(regularWeeks.map(week => [week.number,
                scoresOf(week.number, core.fetchedAt, DEFAULT_PAIRS.map(([away, home]) => [away, home, 0, 0]))])),
            leaders: { fetchedAt: core.fetchedAt, players: [] },
            rosterStats: { fetchedAt: core.fetchedAt, players: {} },
        },
        saved: null,
        manualFinalWeeks: {},
        down: new Set(),
    };
}

export async function pickemLeague(t: TestContext, options: { launch?: PickemLaunch | null; live?: MemoryState } = {}) {
    // The live season reports sections it cannot load; these tests read only its weeks and teams.
    t.mock.method(console, 'error', () => {});
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: SEED });
    // Modules that touch Next load after the league stands in for it.
    const { createOwnerSession } = await import('@/lib/owner/create-owner-session');
    const { createPickem } = await import('../create-pickem');
    const identity = createMemoryIdentity();
    const request = createMemoryRequest();
    const session = createOwnerSession({ identity: identity.port, storage: createMemoryStorage().port, request: request.port });
    const live = options.live ?? liveSeasonState();
    const launch = options.launch === undefined ? { seasonYear: SEASON, week: 1 } : options.launch;
    const pickem = createPickem({ liveSeason: createMemoryLiveSeason(live), ownerSession: session, launch });
    // Every operation runs as a server action would.
    const act = async <T>(fn: (p: typeof pickem) => Promise<T>) => (await league.runAsRoute('/pickem', () => fn(pickem))).result;
    const asOwner = async <T>(fn: (s: typeof session) => Promise<T>) => (await league.runAsRoute('/owner', () => fn(session))).result;
    const signInAs = (uid: string) => asOwner(s => s.signIn(identity.signIn(uid)));
    const signOut = () => asOwner(s => s.signOut());
    const weekOf = (number: number) => live.fantrax.core.weeks.find(week => week.number === number)!;
    /** the start of week `number` in the live season */
    const startOf = (number: number) => Date.parse(weekOf(number).startDate);
    /** Fantrax moves week `number` to have ended `endedDaysAgo` days ago, a week after it started, so it is a final week */
    const playWeek = (number: number, endedDaysAgo: number) => {
        const end = Date.now() - endedDaysAgo * DAY;
        Object.assign(weekOf(number), { startDate: iso(end - 7 * DAY + 1000), endDate: iso(end) });
    };
    /** Fantrax's scores for week `number` (a stat correction, once the week has been scored) */
    const setScores = (number: number, scores: [number, number, number, number][]) => {
        live.fantrax.scores[number] = scoresOf(number, iso(Date.now()), scores);
    };
    /** Fantrax moves on to season `seasonYear`, its weeks placed as `weeks`; the season before is no longer there */
    const moveToSeason = (seasonYear: number, weeks: SourceWeek[]) => { Object.assign(live, liveSeasonState(weeks, seasonYear)); };
    return { league, live, pickem, act, asOwner, signInAs, signOut, startOf, weekOf, playWeek, setScores, moveToSeason };
}
