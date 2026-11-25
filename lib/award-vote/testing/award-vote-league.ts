// A league to exercise the award vote module through its operations: a disposable league for the database, the
// in-memory Fantrax, the NHL module's in-memory adapter (lib/nhl/memory-nhl.ts) and a fake clock. Tests arrange what
// Fantrax says through the helpers below (or `fantrax` directly), what the NHL knows through `nhl.knows`, arrange the
// archive with the roster helpers, and read results through the module.
import type { TestContext } from 'node:test';
import { createMemoryIdentity, createMemoryRequest, createMemoryStorage } from '@/lib/owner/memory-ports';
import { disposableLeague } from '@/lib/testing/disposable-league';
import { createMemoryAwardVoteFantrax, rangeKey, type MemoryAwardVoteFantraxState } from '../memory-fantrax';
import { createMemoryNhl, memoryNhlState, nhlPlayer, nhlSeason } from '@/lib/nhl/memory-nhl';
import type { BallotRankings, PlayerAwardId } from '../model';
import type { AwardTally, PlayerAwardTally } from '../read-tallies';
import type { FantraxRosterPeriod, FantraxWeek, RangedGoalie, RangedPlayer, RangedSkater } from '../ports';

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
/** the regular season's 21 days, October 12 to November 1, 2026 */
export const REGULAR_SEASON_DAYS = Array.from({ length: 21 }, (_, day) => new Date(Date.UTC(2026, 9, 12 + day)).toISOString().slice(0, 10));

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
/**
 * a goalie as the 2025–26 league's table gives them, with OL+ShL and SV% and no GA or SV (that league scored no GA or
 * SV), otherwise as `goalie`
 */
export const savePercentageGoalie = (id: string, points: number, more: Partial<RangedGoalie> = {}): RangedGoalie => {
    const line = goalie(id, points, { overtimeLosses: 0, savePercentage: points === 0 ? null : 0.9, ...more });
    delete line.goalsAgainst;
    delete line.saves;
    return line;
};

// Franchises 1–4, owned by Owner 1–4. The 2025–26 season (2026) names franchise N "Old N" in team season N and is
// published: franchise 1 beat franchise 2. The 2026–27 season (2027) names franchise N "Club N" (CN,
// /logos/cN.png) in team season 10 + N; with `champion`, franchise 1 beat franchise 2 in its Final. Fantrax team fxN
// of league27 is franchise N in 2027. The owner account owner-N manages franchise N on the site. The archive's award
// types are the six voted awards, by their catalogue names. With `transactions`, each season has imported
// transactions: franchise 4 traded franchise 3 a 2028 ninth-round pick on its first day (BASELINE_TRADE).
const seed = (champion: boolean, transactions: boolean) => `
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
    insert into league.team_management (franchise_id, owner_uid, owner_email, version)
        values ${FRANCHISES.map(id => `(${id}, 'owner-${id}', 'owner${id}@example.test', 1)`).join(', ')};
    ${transactions ? [2026, SEASON].map(year => `
        insert into league.transaction_events (id, season_year, kind, occurred_at, occurred_on, source_file, source_time)
            values ('baseline-${year}', ${year}, 'trade', '2026-10-12T17:00:00Z', '2026-10-12', 'trades.csv', '12:00PM');
        insert into league.transaction_assets (id, event_id, player_id, label, asset_kind, action, from_franchise_id, to_franchise_id, from_name, to_name, source_row)
            values ('baseline-${year}-1', 'baseline-${year}', null, '${BASELINE_TRADE}', 'pick', 'trade', 4, 3, 'Club 4', 'Club 3', 0);`).join('') : ''}
`;

/** the pick each season's seeded trade sent from franchise 4 to franchise 3 */
export const BASELINE_TRADE = '2028 Draft Pick, Round 9 (Club 4)';

const HOUR = 3600_000;
/**
 * A ballot lock `hours` from the real present: ballot writes check the lock against the database clock, which the
 * fake clock does not move
 */
export const lockInHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

export function fantraxState(): MemoryAwardVoteFantraxState {
    return {
        leagueId: LEAGUE_ID,
        leagueInfo: { seasonYear: SEASON, weeks: structuredClone(WEEKS), rosterPeriods: structuredClone(ROSTER_PERIODS), firstPlayoffWeek: FIRST_PLAYOFF_WEEK },
        // no one has played over any stretch until a test says so
        skaters: { [rangeKey(REGULAR_SEASON)]: [], [rangeKey(PLAYOFF_ROUNDS)]: [], [rangeKey(FINAL)]: [] },
        goalies: { [rangeKey(REGULAR_SEASON)]: [], [rangeKey(PLAYOFF_ROUNDS)]: [], [rangeKey(FINAL)]: [] },
        points: Object.fromEntries(REGULAR_SEASON_DAYS.map(day => [rangeKey({ startDate: day, endDate: day }), []])),
        rosters: Object.fromEntries(ROSTER_PERIODS.map(period => [period.number, Object.fromEntries(FRANCHISES.map(id => [`fx${id}`, []]))])),
        down: new Set(),
        reads: [],
    };
}

/** after the 2027 Final */
export const AFTER_FINAL = Date.parse('2026-11-25T12:00:00Z');

export async function awardVoteLeague(t: TestContext, options: { champion?: boolean; transactions?: boolean } = {}) {
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: seed(options.champion ?? true, options.transactions ?? true) });
    // Modules that touch Next load after the league stands in for it.
    const { rows, writeInOrder } = await import('@/lib/data/db');
    const { createAwardVote } = await import('../create-award-vote');
    const { createOwnerSession } = await import('@/lib/owner/create-owner-session');
    const fantrax = fantraxState();
    const nhlState = memoryNhlState();
    const nhl = {
        state: nhlState,
        /** Player IDs whose NHL lookup fails, as an NHL outage would */
        failing: nhlState.failing,
        /** the Player IDs looked up in the NHL, in order */
        get lookups() { return nhlState.identified.map(player => player.playerId!); },
        /**
         * the NHL knows Fantrax player `playerId`, through the league's verified identity: born `birthDate` (a
         * 22-year-old in 2026–27 unless given), with `[seasonYear, games]` NHL regular-season games per season (e.g.
         * `[2026, 12]` for 2025–26), under `nhlId` or the next one free from 8480000
         */
        knows(playerId: string, seasons: [number, number][] = [], birthDate = '2004-03-01', nhlId?: number) {
            let id = nhlId ?? 8480000;
            while (nhlId === undefined && nhlState.players[id]) id++;
            const games = Object.fromEntries(seasons.map(([seasonYear, played]) => [seasonYear, nhlSeason({ games: played })]));
            nhlState.players[id] = nhlPlayer({ nhlId: id, name: `NHL player ${playerId}`, birthDate, seasons: games });
            nhlState.verified[playerId] = id;
        },
    };
    /** the fake clock: tests set or advance `clock.time`, and the module's waits advance it */
    const clock = { time: AFTER_FINAL };
    const identity = createMemoryIdentity();
    const request = createMemoryRequest();
    const session = createOwnerSession({ identity: identity.port, storage: createMemoryStorage().port, request: request.port });
    const vote = createAwardVote({
        clock: { now: () => clock.time, sleep: async ms => { clock.time += ms; } },
        fantrax: createMemoryAwardVoteFantrax(fantrax),
        nhl: createMemoryNhl(nhlState),
        db: { rows, writeInOrder },
        ownerSession: session,
    });
    /** an operation, run as the admin's server action runs it */
    const act = async <T>(fn: () => Promise<T>) => (await league.runAsRoute('/admin/seasons/[year]', fn)).result;
    /** an operation, run as the ballot page's server actions run it, for whoever is signed in */
    const asOwner = async <T>(fn: () => Promise<T>) => (await league.runAsRoute('/owner/ballot', fn)).result;
    /** owner `uid` (owner-N manages franchise N) signs in on this browser; null signs out */
    const signInAs = (uid: string | null) => asOwner(() => uid === null ? session.signOut() : session.signIn(identity.signIn(uid)));
    /** what the header shows whoever is signed in */
    const headerAnswer = () => asOwner(() => session.headerAnswer());
    /** prepare fully and open voting with the ballot lock `hours` from now */
    const openVoting = async (hours = 24) => {
        await prepareFully();
        const opened = await act(() => vote.openVoting({ seasonYear: SEASON, ballotLock: lockInHours(hours) }));
        if (!opened.ok) throw new Error(`Opening failed: ${opened.reason}`);
    };
    /** the ballot lock passes: a second ago by the database clock */
    const ballotLockPasses = () => league.client.exec(`update league.award_votes set ballot_lock = clock_timestamp() - interval '1 second' where season_year = ${SEASON}`);
    /** Fantrax's regular-season skater and goalie tables now list these players (every NHL player, scored or not) */
    const setRegularSeason = (skaters: RangedSkater[], goalies: RangedGoalie[] = []) => {
        fantrax.skaters[rangeKey(REGULAR_SEASON)] = skaters;
        fantrax.goalies[rangeKey(REGULAR_SEASON)] = goalies;
    };
    /**
     * Fantrax's all-positions points table for regular-season day `day` (`YYYY-MM-DD`) now lists these players with
     * their fantasy points that day, as `[player ID, points]`, best first
     */
    const scoredOn = (day: string, scores: [string, number][]) => {
        fantrax.points[rangeKey({ startDate: day, endDate: day })] = scores
            .map(([id, points]): RangedPlayer => ({ id, name: `Player ${id}`, positions: 'C', nhlTeam: 'EDM', age: 25, points, perGame: points }))
            .sort((a, b) => b.points - a.points);
    };
    /** prepare in as many calls as it takes, returning the last result and how many calls it took */
    const prepareFully = async (seasonYear = SEASON) => {
        for (let calls = 1; calls <= 100; calls++) {
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
    /**
     * the archive's 2027 transactions include one trade on `on` of these assets, each a player (by ID) or a draft
     * pick (by its label, e.g. `2028 Draft Pick, Round 2 (Club 3)`) going from franchise `from` to franchise `to`
     */
    const trade = async (on: string, assets: (({ player: string } | { pick: string }) & { from: number; to: number })[]) => {
        const id = `t${++transactions}`;
        const ids = assets.flatMap(asset => 'player' in asset ? [asset.player] : []);
        await league.client.exec(`${ids.length ? players(ids) : ''}
            insert into league.transaction_events (id, season_year, kind, occurred_at, occurred_on, source_file, source_time)
                values ('${id}', ${SEASON}, 'trade', '${on}T17:00:00Z', '${on}', 'transactions.csv', '12:00PM');
            insert into league.transaction_assets (id, event_id, player_id, label, asset_kind, action, from_franchise_id, to_franchise_id, from_name, to_name, source_row)
                values ${assets.map((asset, index) => `('${id}-${index + 1}', '${id}', ${'player' in asset ? `'${asset.player}'` : 'null'},
                    '${'player' in asset ? `Archive ${asset.player}` : asset.pick}', '${'player' in asset ? 'player' : 'pick'}', 'trade',
                    ${asset.from}, ${asset.to}, 'Club ${asset.from}', 'Club ${asset.to}', ${transactions * 10 + index})`).join(', ')};`);
    };
    /** the archive's 2027 transactions include franchise `from` trading `playerId` to franchise `to` on `on` */
    const traded = (playerId: string, from: number, to: number, on: string) => trade(on, [{ player: playerId, from, to }]);
    /**
     * the archive's 2027 draft has franchise `franchise` taking `playerId` (null for an empty selection) with pick
     * `overall`, in rounds of four picks
     */
    const drafted = async (playerId: string | null, franchise: number, overall: number) => {
        await league.client.exec(`${playerId ? players([playerId]) : ''}
            insert into league.draft_picks (season_year, overall, round, pick, franchise_id, team_name, player_id, player_name, positions, drafted_on, source_time, source_file)
            values (${SEASON}, ${overall}, ${Math.ceil(overall / 4)}, ${(overall - 1) % 4 + 1}, ${franchise}, 'Club ${franchise}',
                ${playerId ? `'${playerId}'` : 'null'}, ${playerId ? `'Drafted ${playerId}'` : 'null'}, 'C', '2026-09-20', '7:00', 'draft.csv');`);
    };
    return {
        league, vote, fantrax, nhl, clock, request: request.state, act, asOwner, signInAs, headerAnswer, setRegularSeason, scoredOn, prepareFully,
        openVoting, ballotLockPasses, endedSeasonWith, dropped, claimed, trade, traded, drafted,
    };
}

export type AwardVoteLeague = Awaited<ReturnType<typeof awardVoteLeague>>;

/**
 * A league with voting open on a ballot of: skaters s1–s6, defensemen d1–d5, goalies g1–g5 and rookies r1–r2 for the
 * Wayne Gretzky Award and Le Magnifique; d1–d5 for the Bobby Orr Award; g1–g5 for the Hasek Trophy; r1–r2 for the
 * Teemu Trophy; and s1–s2, on champion franchise 1's roster through the Final, for the Danny Briere Award. The
 * archive has s1 on franchise 1's roster at the end of the season. With `open: false` it is only prepared. `arrange`
 * changes the archive or Fantrax before preparing.
 */
export async function votingLeague(t: TestContext, options: { open?: boolean; arrange?: (harness: AwardVoteLeague) => Promise<void> } = {}) {
    const harness = await awardVoteLeague(t);
    const { fantrax, nhl, setRegularSeason, endedSeasonWith, openVoting, prepareFully } = harness;
    const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
    setRegularSeason([
        ...ids('s', 6).map((id, index) => skater(id, 400 - index * 10)),
        ...ids('d', 5).map((id, index) => skater(id, 250 - index * 10, { positions: 'D' })),
        ...ids('r', 2).map((id, index) => skater(id, 150 - index * 10, { age: 21 })),
    ], ids('g', 5).map((id, index) => goalie(id, 300 - index * 10)));
    nhl.knows('r1');
    nhl.knows('r2', [], '2004-03-01', 8480001);
    fantrax.skaters[rangeKey(PLAYOFF_ROUNDS)] = [skater('s1', 40), skater('s2', 30)];
    fantrax.skaters[rangeKey(FINAL)] = [skater('s1', 15), skater('s2', 10)];
    for (const period of ROSTER_PERIODS.slice(-7)) fantrax.rosters[period.number].fx1.push({ id: 's1', status: 'ACTIVE' }, { id: 's2', status: 'ACTIVE' });
    await endedSeasonWith('s1', 1);
    await options.arrange?.(harness);
    if (options.open ?? true) await openVoting(); else await prepareFully();
    const { act, asOwner, signInAs, vote } = harness;
    const saveDraft = (rankings: unknown) => asOwner(() => vote.saveDraft({ seasonYear: SEASON, rankings }));
    const submit = (rankings: unknown) => asOwner(() => vote.submitBallot({ seasonYear: SEASON, rankings }));
    const read = () => asOwner(() => vote.readOwnerBallot({}));
    /** the signed-in owner's own ballot */
    const ownBallot = async () => {
        const view = await read();
        if (view.status !== 'ballot') throw new Error(`No ballot to read: ${view.status}`);
        return view.ballot;
    };
    const admin = () => act(() => vote.readPreview({ seasonYear: SEASON }));
    /** owner-N signs in and submits `rankings` for franchise N, which must be accepted */
    const submitFor = async (franchise: number, rankings: BallotRankings) => {
        await signInAs(`owner-${franchise}`);
        const submitted = await submit(rankings);
        if (!submitted.ok) throw new Error(`Submitting for franchise ${franchise} failed: ${submitted.reason}`);
    };
    /** the admin presses "Score ballots" */
    const score = () => act(() => vote.scoreBallots({ seasonYear: SEASON }));
    /** the admin reopens voting with the ballot lock `hours` from now */
    const reopen = (hours = 24) => act(() => vote.reopenVoting({ seasonYear: SEASON, ballotLock: lockInHours(hours) }));
    /** the admin's read of every award's tally */
    const tallies = () => act(() => vote.readTallies({ seasonYear: SEASON }));
    /** the admin's read of every submitted ballot's rankings */
    const ballots = () => act(() => vote.readBallots({ seasonYear: SEASON }));
    /** the admin presses "Publish"; with the cache tags it expired */
    const publish = async () => {
        const { result, revalidatedTags } = await harness.league.runAsRoute('/admin/seasons/[year]', () => vote.publish({ seasonYear: SEASON }));
        return { result, revalidatedTags };
    };
    return { ...harness, saveDraft, submit, read, ownBallot, admin, submitFor, score, reopen, tallies, ballots, publish };
}

/**
 * a complete ballot for franchise 1 in the voting league, which ranks franchise 1's s1, and franchises 2, 3 and 4
 * (team seasons 12–14) for GM of the Year
 */
export const COMPLETE: BallotRankings = {
    'wayne-gretzky': ['s1', 's2', 's3', 's4', 's5'],
    'le-magnifique': ['g1', 's1', 'd1', 's2', 's3'],
    'bobby-orr': ['d1', 'd2', 'd3', 'd4', 'd5'],
    hasek: ['g1', 'g2', 'g3', 'g4', 'g5'],
    'teemu-selanne': ['r1', 'r2'],
    'danny-briere': ['s2', 's1'],
    'gm-of-the-year': ['12', '13', '14'],
};

/** an individual award's tally among the admin's tallies */
export const playerTally = (tallies: AwardTally[], award: PlayerAwardId) =>
    tallies.find((tally): tally is PlayerAwardTally => tally.award === award);

/**
 * `rankings` (by default COMPLETE) as franchise `franchise`'s ballot: GM of the Year ranks the other franchises'
 * 2027 team seasons in franchise order
 */
export const completeFor = (franchise: number, rankings: BallotRankings = COMPLETE): BallotRankings =>
    ({ ...rankings, 'gm-of-the-year': FRANCHISES.filter(id => id !== franchise).map(id => String(10 + id)) });
