import assert from 'node:assert/strict';
import test from 'node:test';
import { FREEZES_AT, MID_SEASON, SEASON, seasonSyncLeague, type StandingRow } from './testing/season-sync-league';

const STANDINGS = [
    // [Fantrax team, rank, W, L, T, points for, points against]
    [3, 1, 4, 0, 0, 1262.15, 929.9],
    [1, 2, 3, 1, 0, 1031.55, 985.6],
    [4, 3, 1, 2, 1, 973.4, 852.8],
    [2, 4, 0, 3, 1, 664.75, 1125.25],
] as const satisfies [number, number, number, number, number, number, number][];

test("after a run, each team season of the opened live season has Fantrax's record and points, and its identity is untouched", async t => {
    const { run, read, setStandings } = await seasonSyncLeague(t);
    const { getFranchise, getFranchiseCards, getSeasonDetail } = await import('@/lib/data/league');
    // pages already cached before the run
    assert.equal((await read(() => getFranchise(1)))!.wins, 10);
    await read(() => getFranchiseCards());
    await read(() => getSeasonDetail(SEASON));

    setStandings([...STANDINGS]);
    const { result } = await run(MID_SEASON);
    assert.equal(result.outcome, 'synced');

    const franchise = (await read(() => getFranchise(1)))!;
    assert.deepEqual(franchise.seasons.find(season => season.year === SEASON),
        { year: SEASON, name: 'Club 1', owner: 'Owner 1', wins: 3, losses: 1, ties: 0, fptsFor: 1031.55, fptsAgainst: 985.6,
            playoffStatus: 'pending', playoffRound: null, finalRound: null });
    assert.deepEqual([franchise.wins, franchise.losses, franchise.ties, franchise.fptsFor, franchise.fptsAgainst], [13, 6, 1, 2032.05, 1885.85],
        'the all-time record includes the season being played');
    assert.deepEqual((await read(() => getFranchiseCards())).find(card => card.ID === 3)!.Wins, 14);
    assert.deepEqual((await read(() => getSeasonDetail(SEASON))).standings.map(row =>
        [row.franchiseId, row.name, row.abbreviation, row.logo, row.owner, row.division, row.divisionRank, row.wins, row.losses, row.ties]), [
        [3, 'Club 3', 'C3', '/logos/c3.png', 'Owner 3', 1, 1, 4, 0, 0],
        [1, 'Club 1', 'C1', '/logos/c1.png', 'Owner 1', 1, 2, 3, 1, 0],
        [4, 'Club 4', 'C4', '/logos/c4.png', 'Owner 4', 1, 3, 1, 2, 1],
        [2, 'Club 2', 'C2', '/logos/c2.png', 'Owner 2', 1, 4, 0, 3, 1],
    ]);
});

test("a second run follows Fantrax's corrected numbers, and a run that changes nothing refreshes no view and expires no tag", async t => {
    const { league, run, read, setStandings } = await seasonSyncLeague(t);
    const { getFranchise } = await import('@/lib/data/league');
    setStandings([...STANDINGS]);
    await run(MID_SEASON);

    // a stat correction: franchise 1's week-4 opponent loses 2.5 points
    setStandings(STANDINGS.map(row => row[0] === 1 ? [1, 2, 3, 1, 0, 1031.55, 983.1] : [...row]));
    const corrected = await run(MID_SEASON + 3600_000);
    assert.equal(corrected.result.outcome === 'synced' && corrected.result.changed.teamSeasons, 1);
    assert.ok(corrected.revalidatedTags.includes('league:franchise-details'));
    assert.equal((await read(() => getFranchise(1)))!.seasons.find(season => season.year === SEASON)!.fptsAgainst, 983.1);

    league.failNextQuery('refresh materialized view', new Error('no refresh expected'));
    const quiet = await run(MID_SEASON + 7200_000);
    assert.deepEqual(quiet.result, { outcome: 'synced', seasonYear: SEASON, changed: { playerSeasons: 0, teamSeasons: 0, playoffGames: 0, championshipRoster: 0, regularSeasonGames: 0, weeks: 0 }, warnings: [] });
    assert.deepEqual(quiet.revalidatedTags, []);
});

test('a failing or invalid standings read writes nothing and records the error, and the next run catches up', async t => {
    const { fantrax, run, read, setStandings, failureLogs } = await seasonSyncLeague(t);
    const { getSeasonDetail } = await import('@/lib/data/league');
    const { getSeasonSyncStatus } = await import('@/lib/admin/data');
    const wins = async () => (await read(() => getSeasonDetail(SEASON))).standings.map(row => [row.franchiseId, row.wins]);
    setStandings([...STANDINGS]);
    await run(MID_SEASON);
    const before = await wins();

    const nextWeek = STANDINGS.map(([team, rank, w, l, t, pf, pa]): StandingRow => [team, rank, w + 1, l, t, pf + 100, pa]);
    setStandings(nextWeek);
    const failures: [string, () => void, RegExp][] = [
        ['Fantrax is down', () => fantrax.down.add('standings'), /503/],
        ['a team is missing', () => { fantrax.down.clear(); fantrax.standings.pop(); }, /team fx2 0 times/],
        ['an unmapped team', () => { fantrax.standings.push({ ...fantrax.standings[0], teamId: 'fx9' }); }, /team fx9/],
        ['another season', () => { fantrax.standings.pop(); fantrax.leagueInfo.seasonYear = 2028; }, /2028 season/],
    ];
    let hour = 1;
    for (const [what, arrange, error] of failures) {
        arrange();
        const failed = await run(MID_SEASON + hour++ * 3600_000);
        assert.equal(failed.result.outcome, 'failed', what);
        assert.deepEqual(failed.revalidatedTags, [], what);
        assert.deepEqual(await wins(), before, `${what}: yesterday's numbers stay`);
        const status = (await getSeasonSyncStatus(SEASON))!;
        assert.match(status.lastError!, error, what);
        assert.equal(status.lastSuccessAt, new Date(MID_SEASON).toISOString(), what);
        assert.equal(status.lastRunAt, new Date(MID_SEASON + (hour - 1) * 3600_000).toISOString(), what);
        assert.equal(status.changed.teamSeasons, 4, `${what}: the last success's changes`);
    }
    assert.deepEqual(failureLogs, failures.map(() => `The season sync of ${SEASON} failed:`), 'each failure is logged');

    fantrax.leagueInfo.seasonYear = SEASON;
    setStandings(nextWeek);
    const caughtUp = await run(MID_SEASON + 86400_000);
    assert.equal(caughtUp.result.outcome, 'synced');
    assert.deepEqual(await wins(), [[3, 5], [1, 4], [4, 2], [2, 1]]);
    const status = (await getSeasonSyncStatus(SEASON))!;
    assert.deepEqual([status.lastError, status.lastSuccessAt, status.changed.teamSeasons, status.warnings],
        [null, new Date(MID_SEASON + 86400_000).toISOString(), 4, []]);
});

test('with the live season not opened in the archive, a run writes nothing', async t => {
    const { run, read, setStandings } = await seasonSyncLeague(t, { opened: false });
    const { getSeasonSyncStatus } = await import('@/lib/admin/data');
    const { getFranchise } = await import('@/lib/data/league');
    setStandings([...STANDINGS]);
    const { result, revalidatedTags } = await run(MID_SEASON);
    assert.deepEqual(result, { outcome: 'not-opened', seasonYear: SEASON });
    assert.deepEqual(revalidatedTags, []);
    assert.equal(await getSeasonSyncStatus(), null);
    assert.deepEqual((await read(() => getFranchise(1)))!.seasons.map(season => season.year), [2026], 'no team season is written for it');
});

test("seven days after the season's last week ends, a run writes nothing and records the freeze, and later runs leave the season alone", async t => {
    const { fantrax, run, read, setStandings } = await seasonSyncLeague(t);
    const { getSeasonDetail } = await import('@/lib/data/league');
    const { getSeasonSyncStatus } = await import('@/lib/admin/data');
    const wins = async () => (await read(() => getSeasonDetail(SEASON))).standings.map(row => [row.franchiseId, row.wins]);
    setStandings([...STANDINGS]);
    // the last morning inside the Final's correction window still follows Fantrax
    assert.equal((await run(FREEZES_AT - 3600_000)).result.outcome, 'synced');
    const settled = await wins();

    setStandings(STANDINGS.map(([team, rank, w, l, t, pf, pa]): StandingRow => [team, rank, w + 1, l, t, pf, pa]));
    const frozen = await run(FREEZES_AT + 3600_000);
    assert.deepEqual(frozen.result, { outcome: 'frozen', seasonYear: SEASON, frozenAt: new Date(FREEZES_AT + 3600_000).toISOString() });
    assert.deepEqual(frozen.revalidatedTags, []);
    assert.deepEqual(await wins(), settled);
    assert.equal((await getSeasonSyncStatus(SEASON))!.frozenAt, new Date(FREEZES_AT + 3600_000).toISOString());

    // later runs read nothing from Fantrax and change nothing
    fantrax.down.add('leagueInfo').add('standings');
    const later = await run(FREEZES_AT + 86400_000);
    assert.deepEqual(later.result, frozen.result);
    assert.deepEqual(await wins(), settled);
    const status = (await getSeasonSyncStatus(SEASON))!;
    assert.deepEqual([status.lastError, status.lastRunAt], [null, new Date(FREEZES_AT + 3600_000).toISOString()]);
});
