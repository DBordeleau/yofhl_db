// Cached public reads: an anonymous visit to Pick'em is served from the cache, which a save expires only when it
// changes which matchups an entry has picked, and settle when it records or freezes a week.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickemLeague, SEASON } from './testing/pickem-league';

const now = () => Date.now();
const ALL: [number, number][] = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]];

/** everything /pickem reads for an anonymous visitor */
const anonymousVisit = (act: Awaited<ReturnType<typeof pickemLeague>>['act']) => act(p => Promise.all([
    p.readWeek({ now: now(), asker: 'nobody' }),
    p.readWeek({ now: now(), week: 'last-locked', asker: 'nobody' }),
    p.readPickemLeaderboard({ now: now() }),
]));

test('a second anonymous visit reads nothing from the database', async t => {
    const { league, act, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [1, 2], picked: 1 })), { ok: true });
    await anonymousVisit(act);
    const before = league.queries();
    const [next, locked, standings] = await anonymousVisit(act);
    assert.equal(league.queries(), before);
    assert.ok(next.status === 'week' && next.week.whosIn);
    assert.ok(locked.status === 'week' && locked.week.breakdown);
    assert.equal(standings.status, 'leaderboard');
});

test('changing which side of a picked matchup an owner took leaves the cached who\'s-in list alone', async t => {
    const { league, act, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    for (const matchup of ALL) assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup, picked: matchup[0] })), { ok: true });
    await anonymousVisit(act);
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [1, 2], picked: 2 })), { ok: true });
    const before = league.queries();
    const [next] = await anonymousVisit(act);
    assert.equal(league.queries(), before);
    assert.ok(next.status === 'week' && next.week.whosIn);
    assert.deepEqual(next.week.whosIn.filter(entry => entry.in).map(entry => entry.franchise.id), [1]);
});

test('a save or clear that changes who is in shows on the next anonymous visit', async t => {
    const { act, signInAs } = await pickemLeague(t);
    const inNow = async () => {
        const [next] = await anonymousVisit(act);
        assert.ok(next.status === 'week' && next.week.whosIn);
        return next.week.whosIn.filter(entry => entry.in).map(entry => entry.franchise.id);
    };
    await signInAs('owner-3');
    for (const matchup of ALL.slice(0, 4)) assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup, picked: matchup[0] })), { ok: true });
    assert.deepEqual(await inNow(), []);
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [9, 10], picked: 10 })), { ok: true });
    assert.deepEqual(await inNow(), [3]);
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [3, 4], picked: null })), { ok: true });
    assert.deepEqual(await inNow(), []);
});

test('clearing the league cache, as the revalidate route does, clears Pick\'em\'s cached reads too', async t => {
    const { league, act, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [1, 2], picked: 1 })), { ok: true });
    await anonymousVisit(act);
    const { LEAGUE_TAG } = await import('@/lib/data/cache-tags');
    league.expire(LEAGUE_TAG);
    assert.equal([...league.cacheEntries().keys()].filter(key => key.includes('pickem')).length, 0);
});
