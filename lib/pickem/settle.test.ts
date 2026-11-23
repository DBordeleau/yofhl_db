// Settle on its own clock: it runs on every scheduled Fantrax run, whether the capture published, changed nothing
// or was skipped for a frozen season, and stops on Pick'em's own record once the season's Pick'em is complete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryLiveSeason } from '@/lib/fantrax/memory-live-season';
import { fakeFantrax, SEED as FANTRAX_SEED } from '@/lib/fantrax/testing/fake-fantrax';
import { disposableLeague } from '@/lib/testing/disposable-league';
import type { PickemPorts } from './ports';
import { DAY, liveSeasonState, pickemLeague, SEASON, weeksAroundNow } from './testing/pickem-league';

const now = () => Date.now();
type League = Awaited<ReturnType<typeof pickemLeague>>;
// Week 6 is this season's only Pick'em week and its last regular-season week (7–9 are playoff rounds).
const launch = { seasonYear: SEASON, week: 6 };
const shortSeason = () => liveSeasonState(weeksAroundNow(6, 9));
/** 1 beats 2, 3 beats 4, 6 beats 5, 8 beats 7, 10 beats 9 */
const SCORES: [number, number, number, number][] = [[1, 2, 9, 1], [3, 4, 9, 1], [5, 6, 1, 9], [7, 8, 1, 9], [9, 10, 1, 9]];

/** settle at `time`, run as the cron route would, with the app queries it made and the tags it expired */
async function settleAt(league: League, time: number) {
    const before = league.league.queries();
    const { result, revalidatedTags } = await league.league.runAsRoute('/api/cron/fantrax', () => league.pickem.settle({ now: time }));
    return { ...result, queries: league.league.queries() - before, revalidatedTags };
}

test('a lock that passes on an evening with no new capture is recorded', async t => {
    // Week 6 started six days ago, so its lock has passed; weeks 7–9 are playoff rounds.
    const league = await pickemLeague(t, { launch, live: liveSeasonState(weeksAroundNow(7, 9)) });
    // An earlier evening's capture is the saved snapshot; nothing has changed on Fantrax since, and no capture runs.
    league.live.saved = structuredClone(league.live.fantrax);
    league.live.down = new Set(['core', 'scores', 'leaders', 'rosterStats']);

    const beforeLock = await settleAt(league, league.startOf(6) - DAY);
    assert.deepEqual(beforeLock.recorded, []);
    assert.deepEqual(beforeLock.revalidatedTags, [], 'a run that settles nothing expires nothing');
    const afterLock = await settleAt(league, now());
    assert.deepEqual(afterLock.recorded, [{ seasonYear: SEASON, week: 6 }]);
});

test('after the season freezes, a last regular-season week marked final late is frozen and the season\'s Pick\'em completed', async t => {
    const league = await pickemLeague(t, { launch, live: shortSeason() });
    // Week 6 is played and recorded while its correction window is open.
    league.playWeek(6, 30);
    league.setScores(6, SCORES);
    assert.deepEqual((await settleAt(league, now() - 26 * DAY)).recorded, [{ seasonYear: SEASON, week: 6 }]);
    // The playoffs are played out; the Final ended nine days ago, so its correction window has closed and the
    // season is frozen.
    league.playWeek(7, 23);
    league.playWeek(8, 16);
    league.playWeek(9, 9);
    // After the freeze the admin marks week 6 final, which captures first; then Fantrax has nothing more to give.
    await createMemoryLiveSeason(league.live).setWeekFinal(6, true);
    league.live.down = new Set(['core', 'scores', 'leaders', 'rosterStats']);

    const late = await settleAt(league, now());
    assert.deepEqual([late.frozen, late.completed], [[{ seasonYear: SEASON, week: 6 }], [SEASON]]);
    await settleAt(league, now() + DAY);
    assert.equal((await settleAt(league, now() + 2 * DAY)).queries, 0, 'then settle costs nothing');
});

test('once the season\'s Pick\'em is complete, settle makes no app query and expires nothing', async t => {
    const league = await pickemLeague(t, { launch, live: shortSeason() });
    league.playWeek(6, 8);
    league.setScores(6, SCORES);
    const completing = await settleAt(league, now());
    assert.deepEqual([completing.recorded, completing.frozen, completing.completed], [[{ seasonYear: SEASON, week: 6 }], [{ seasonYear: SEASON, week: 6 }], [SEASON]]);

    // The completing run expired the cached Pick'em seasons list; the next run reads it into the cache again.
    await settleAt(league, now());
    const quiet = await settleAt(league, now());
    assert.deepEqual([quiet.recorded, quiet.frozen, quiet.held, quiet.completed], [[], [], [], []]);
    assert.equal(quiet.queries, 0);
    assert.deepEqual(quiet.revalidatedTags, []);
});

test('in a season with no Pick\'em, settle makes no app query', async t => {
    const league = await pickemLeague(t, { launch: { seasonYear: SEASON + 1, week: 1 }, live: shortSeason() });
    league.playWeek(6, 8);
    const settled = await settleAt(league, now());
    assert.deepEqual([settled.recorded, settled.frozen, settled.held, settled.completed], [[], [], [], []]);
    assert.equal(settled.queries, 0);
    assert.deepEqual(settled.revalidatedTags, []);
});

test('once a frozen season\'s Pick\'em is complete, settle over the production live season costs nothing, however long its caches have stood', async t => {
    let network = 0;
    // The fake Fantrax's 2027 Final ended on November 4, so 2027 is a frozen season by the 20th.
    const frozen = Date.parse('2026-11-20T02:00:00Z');
    const league = await disposableLeague(t, { app: true, nextCache: true, fetch: fakeFantrax(() => true, () => network++), seed: `${FANTRAX_SEED}
        insert into league.pickem_weeks (season_year, week, lock) values (2027, 1, '2026-10-12T16:00:00Z');
        insert into league.pickem_completed_seasons (season_year) values (2027);` });
    t.mock.method(Date, 'now', () => frozen);
    t.mock.method(console, 'warn', () => {});
    const { getLiveSeason, getWeekScores, liveSeasonYear, refreshLiveSeason } = await import('@/lib/fantrax/live-season');
    const { createPickem } = await import('./create-pickem');
    const { settle } = createPickem({
        liveSeason: { getLiveSeason, getWeekScores, liveSeasonYear }, ownerSession: {} as PickemPorts['ownerSession'], launch: { seasonYear: 2027, week: 1 },
    });
    await league.runAsRoute('/api/admin/fantrax', refreshLiveSeason);
    await league.runAsRoute('/api/cron/fantrax', () => settle({ now: frozen }));

    // A day, then a week, passes: every cache entry on a timer runs out.
    league.expireByLifetime(86400);
    league.expireByLifetime(7 * 86400);
    const [queries, requests] = [league.queries(), network];
    const quiet = await league.runAsRoute('/api/cron/fantrax', () => settle({ now: frozen }));
    assert.deepEqual(quiet.result, { recorded: [], frozen: [], held: [], completed: [] });
    assert.equal(league.queries(), queries, 'no app query');
    assert.equal(network, requests, 'no Fantrax request');
    assert.deepEqual(quiet.revalidatedTags, []);
});
