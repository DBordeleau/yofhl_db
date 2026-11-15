import assert from 'node:assert/strict';
import test from 'node:test';
import { endOf, FREEZES_AT, MID_SEASON, SEASON, seasonSyncLeague, WEEKS } from './testing/season-sync-league';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
type League = Awaited<ReturnType<typeof seasonSyncLeague>>;

// The run's own rules are checked against the tables it writes; the last tests read through the record book and Compare.
/** the season's stored regular-season games: [week, away franchise, home franchise, away score, home score, winning franchise] */
async function games({ league }: League) {
    const { rows } = await league.client.query<{ week: number; away: number; home: number; awayScore: number; homeScore: number; winner: number | null }>(`
        select m.round as week, a.franchise_id as away, h.franchise_id as home, m.away_score::float8 as "awayScore",
               m.home_score::float8 as "homeScore", w.franchise_id as winner
        from league.matchups m
        join league.team_seasons a on a.id = m.away_team_season_id
        join league.team_seasons h on h.id = m.home_team_season_id
        left join league.team_seasons w on w.id = m.winner_team_season_id
        where m.season_year = ${SEASON} and m.stage = 'regular' order by m.round, m.slot`);
    return rows.map(row => [row.week, row.away, row.home, row.awayScore, row.homeScore, row.winner]);
}

/** the season's stored weeks: [week, start, end] */
async function weeks({ league }: League) {
    const { rows } = await league.client.query<{ week: number; start: number; end: number }>(`
        select week, (extract(epoch from starts_at) * 1000)::float8 as start, (extract(epoch from ends_at) * 1000)::float8 as "end"
        from league.weeks where season_year = ${SEASON} order by week`);
    return rows.map(row => [row.week, new Date(row.start).toISOString(), new Date(row.end).toISOString()]);
}

/** Fantrax's scores for weeks 1–4 */
function playFirstMonth(league: League) {
    league.setScores(1, [[1, 2, 101.5, 99.25], [3, 4, 80, 120.1]]);
    league.setScores(2, [[2, 3, 90, 95], [4, 1, 110, 100]]);
    league.setScores(3, [[1, 3, 77.7, 66.6], [2, 4, 88, 99]]);
    league.setScores(4, [[4, 3, 105, 104], [1, 2, 130.4, 140]]);
}

test("the first run stores every final regular-season week's games and every week of the season with its dates", async t => {
    const league = await seasonSyncLeague(t);
    const { getSeasonSyncStatus } = await import('@/lib/admin/data');
    playFirstMonth(league);

    // the morning of November 14: weeks 1–4 are over and week 5 is being played
    const { result, revalidatedTags } = await league.run(MID_SEASON);
    assert.equal(result.outcome, 'synced');
    assert.deepEqual(await games(league), [
        [1, 1, 2, 101.5, 99.25, 1], [1, 3, 4, 80, 120.1, 4],
        [2, 2, 3, 90, 95, 3], [2, 4, 1, 110, 100, 4],
        [3, 1, 3, 77.7, 66.6, 1], [3, 2, 4, 88, 99, 4],
        [4, 4, 3, 105, 104, 4], [4, 1, 2, 130.4, 140, 2],
    ]);
    assert.deepEqual(await weeks(league), WEEKS.map(week => [week.number, week.startDate, week.endDate]));
    for (const tag of ['league:records', 'league:rivalries']) assert.ok(revalidatedTags.includes(tag), tag);
    assert.equal((await getSeasonSyncStatus(SEASON))!.changed.regularSeasonGames, 8, "the Season sync panel's count");

    league.league.failNextQuery('refresh materialized view', new Error('no refresh expected'));
    const quiet = await league.run(MID_SEASON + HOUR);
    assert.deepEqual(quiet.result, { outcome: 'synced', seasonYear: SEASON,
        changed: { playerSeasons: 0, teamSeasons: 0, playoffGames: 0, championshipRoster: 0, skaterCategories: 0, regularSeasonGames: 0, weeks: 0 }, warnings: [] });
    assert.deepEqual(quiet.revalidatedTags, []);
});

/** the stored games' row ids, by week */
async function gameIds({ league }: League, week: number) {
    const { rows } = await league.client.query<{ id: number }>(`select id from league.matchups where season_year = ${SEASON} and stage = 'regular' and round = ${week} order by slot`);
    return rows.map(row => row.id);
}

test("a stat correction inside a week's correction window updates its stored game in place, and one after the window does not", async t => {
    const league = await seasonSyncLeague(t);
    playFirstMonth(league);
    await league.run(MID_SEASON);
    const [week1, week4] = [await gameIds(league, 1), await gameIds(league, 4)];

    // November 15: week 1's window closed on October 26; week 4's is open until November 16
    league.setScores(1, [[1, 2, 99.25, 101.5], [3, 4, 80, 120.1]]);
    league.setScores(4, [[4, 3, 105, 104], [1, 2, 140, 140]]);
    const { result, revalidatedTags } = await league.run(MID_SEASON + DAY);
    assert.equal(result.outcome === 'synced' && result.changed.regularSeasonGames, 1);
    assert.ok(revalidatedTags.includes('league:records'));
    assert.deepEqual((await games(league)).filter(([week]) => week === 1 || week === 4), [
        [1, 1, 2, 101.5, 99.25, 1], [1, 3, 4, 80, 120.1, 4],
        [4, 4, 3, 105, 104, 4], [4, 1, 2, 140, 140, null],
    ], 'a level score is a tie with no winner');
    assert.deepEqual([await gameIds(league, 1), await gameIds(league, 4)], [week1, week4], 'the same rows');

    // after week 4's window closes, Fantrax's later rescoring is never stored
    league.setScores(4, [[4, 3, 1, 2], [1, 2, 3, 4]]);
    const late = await league.run(endOf(4) + 7 * DAY + HOUR);
    assert.equal(late.result.outcome === 'synced' && late.result.changed.regularSeasonGames, 2, "only week 5's games, now final");
    assert.deepEqual((await games(league)).filter(([week]) => week === 4), [[4, 4, 3, 105, 104, 4], [4, 1, 2, 140, 140, null]]);
});

test('a week being played stores no game, and once an admin marks it final its games are stored', async t => {
    const league = await seasonSyncLeague(t);
    playFirstMonth(league);
    league.setScores(5, [[1, 4, 60, 50], [2, 3, 40, 45]]);
    await league.run(MID_SEASON);
    assert.deepEqual((await games(league)).filter(([week]) => week === 5), [], 'week 5 is being played');

    league.markFinal(5);
    const { result } = await league.run(MID_SEASON + HOUR);
    assert.equal(result.outcome === 'synced' && result.changed.regularSeasonGames, 2);
    assert.deepEqual((await games(league)).filter(([week]) => week === 5), [[5, 1, 4, 60, 50, 1], [5, 2, 3, 40, 45, 3]]);
});

test('a failed or invalid score read leaves every row as it was, standings and player seasons included, and records the error', async t => {
    const league = await seasonSyncLeague(t);
    const { fantrax, run, read, setStandings, setPlayers, failureLogs } = league;
    const { getPlayer, getSeasonDetail } = await import('@/lib/data/league');
    const { getSeasonSyncStatus } = await import('@/lib/admin/data');
    const standings = async () => (await read(() => getSeasonDetail(SEASON))).standings.map(row => [row.franchiseId, row.wins]);
    const points = async () => (await read(() => getPlayer('v1')))!.totalFPts;
    setStandings([[1, 1, 1, 0, 0, 100, 90], [2, 2, 0, 1, 0, 90, 100], [3, 3, 0, 0, 0, 0, 0], [4, 4, 0, 0, 0, 0, 0]]);
    setPlayers([['v1', 50, 5, 1]]);
    playFirstMonth(league);
    await run(MID_SEASON);
    const before = [await games(league), await weeks(league), await standings(), await points()];

    setStandings([[1, 1, 2, 0, 0, 200, 90], [2, 2, 0, 2, 0, 90, 200], [3, 3, 0, 0, 0, 0, 0], [4, 4, 0, 0, 0, 0, 0]]);
    setPlayers([['v1', 80, 8, 1]]);
    league.setScores(4, [[4, 3, 1, 2], [1, 2, 3, 4]]);
    fantrax.leagueInfo.weeks[23].endDate = new Date(endOf(24) + HOUR).toISOString();
    const failures: [string, () => void, RegExp][] = [
        ['Fantrax is down', () => fantrax.down.add('weekScores'), /weekScores returned 503/],
        ['an unmapped team', () => { fantrax.down.clear(); fantrax.scores[4].matchups[0].away.teamId = 'fx9'; }, /week 4 have team fx9/],
        ['a team playing twice', () => { fantrax.scores[4].matchups[0].away.teamId = 'fx1'; }, /week 4 have team fx1 twice/],
    ];
    let hour = 1;
    for (const [what, arrange, error] of failures) {
        arrange();
        const failed = await run(MID_SEASON + hour++ * HOUR);
        assert.equal(failed.result.outcome, 'failed', what);
        assert.deepEqual(failed.revalidatedTags, [], what);
        assert.deepEqual([await games(league), await weeks(league), await standings(), await points()], before, `${what}: every row stays`);
        const status = (await getSeasonSyncStatus(SEASON))!;
        assert.match(status.lastError!, error, what);
        assert.equal(status.changed.regularSeasonGames, 8, `${what}: the last success's changes`);
    }
    assert.equal(failureLogs.length, failures.length);
});

test("a stale evening snapshot doesn't fail a regular-season run, whose scores are read from Fantrax rather than the snapshot", async t => {
    const league = await seasonSyncLeague(t);
    playFirstMonth(league);
    // the evening refreshes stopped three days ago, and Fantrax has corrected week 4 since
    league.refreshStopsAt(MID_SEASON - 3 * DAY);
    league.fantrax.scores[4].matchups[0].home.score = 106;

    const { result } = await league.run(MID_SEASON);
    assert.equal(result.outcome, 'synced');
    assert.deepEqual((await games(league)).filter(([week]) => week === 4), [[4, 4, 3, 105, 106, 3], [4, 1, 2, 130.4, 140, 2]]);
});

test('a frozen season has its weeks and regular-season games left alone', async t => {
    const league = await seasonSyncLeague(t);
    playFirstMonth(league);
    await league.run(FREEZES_AT - HOUR);
    const settled = [await games(league), await weeks(league)];
    assert.equal(settled[0].length, 21 * 2, 'every regular-season week was stored before the freeze');

    league.fantrax.leagueInfo.weeks[2].endDate = new Date(endOf(3) + HOUR).toISOString();
    league.setScores(4, [[4, 3, 1, 2], [1, 2, 3, 4]]);
    assert.equal((await league.run(FREEZES_AT + HOUR)).result.outcome, 'frozen');
    assert.deepEqual([await games(league), await weeks(league)], settled);
});

/** franchise 2 wins weeks 1–4, scoring 410.25 against franchise 4 in week 3 */
function franchiseTwoWinsTheMonth(league: League) {
    league.setScores(1, [[1, 2, 99, 150.5], [3, 4, 80, 120]]);
    league.setScores(2, [[2, 3, 120, 100], [4, 1, 110, 100]]);
    league.setScores(3, [[4, 2, 90, 410.25], [1, 3, 77, 66]]);
    league.setScores(4, [[1, 2, 100, 101], [4, 3, 105, 104]]);
}

test("the record book's Weekly matchup records and winning streaks run through the stored games once a run stores them", async t => {
    const league = await seasonSyncLeague(t);
    const { getRecordBook } = await import('@/lib/records/data');
    const book = async () => {
        const { records } = await league.read(() => getRecordBook({ format: 'weekly' }));
        const list = (id: string) => records.find(record => record.id === id)!.entries;
        return { score: list('matchup-score')[0], margin: list('winning-margin')[0], streak: list('win-streak').find(entry => entry.id === '2')! };
    };
    // the checked-in history: 306 in 2019 is the Weekly high, and franchise 2 won its last seven games of 2025–26
    const before = await book();
    assert.deepEqual([before.score.value, before.score.detail.endsWith('2018–19 · P15')], [306, true]);
    assert.equal(before.streak.value, 7);

    franchiseTwoWinsTheMonth(league);
    await league.run(MID_SEASON);
    const after = await book();
    assert.deepEqual([after.score.id.endsWith(':2'), after.score.value, after.score.detail], [true, 410.25, '410.25–90 vs Club 4 · 2026–27 · P3']);
    assert.deepEqual([after.margin.value, after.margin.detail], [320.25, '410.25–90 vs Club 4 · 2026–27 · P3']);
    assert.deepEqual([after.streak.value, after.streak.detail], [11, '2025–26 P42 → 2026–27 P4']);
});
