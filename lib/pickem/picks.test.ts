// Making Pick'em picks: saving, changing and clearing them before the lock, and who sees them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { liveSeasonState, pickemLeague, scheduleOf, SEASON } from './testing/pickem-league';

const now = () => Date.now();

test('a signed-in owner sees the next week to lock and saves a Pick\'em pick on it', async t => {
    const { act, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    const read = await act(p => p.readWeek({ now: now(), asker: 'session' }));
    assert.equal(read.status, 'week');
    const { week } = read;
    assert.equal(week.seasonYear, SEASON);
    assert.equal(week.week, 6);
    assert.deepEqual(week.matchups.map(matchup => [matchup.away.id, matchup.home.id]), [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]);
    assert.deepEqual(week.matchups[0].away, { id: 1, name: 'Franchise 1', abbreviation: 'F1', logo: '/logos/f1.png' });
    assert.deepEqual(week.yours, { status: 'entry', franchiseId: 1, picks: [] });

    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [3, 4], picked: 4 })), { ok: true });
    const after = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 6, asker: 'session' }));
    assert.ok(after.status === 'week');
    assert.deepEqual(after.week.yours, { status: 'entry', franchiseId: 1, picks: [{ matchup: [3, 4], picked: 4 }] });
});

/** the asker's own Pick'em picks on a week */
const picksOf = async (act: Awaited<ReturnType<typeof pickemLeague>>['act'], week: number, time = now()) => {
    const read = await act(p => p.readWeek({ now: time, seasonYear: SEASON, week, asker: 'session' }));
    assert.ok(read.status === 'week' && read.week.yours?.status === 'entry', 'an entry reads its week');
    return read.week.yours.picks;
};

test('a Pick\'em pick changes to the other franchise and clears, each on its own', async t => {
    const { act, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    const save = (matchup: [number, number], picked: number | null) => act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup, picked }));
    assert.deepEqual(await save([3, 4], 4), { ok: true });
    assert.deepEqual(await save([6, 5], 5), { ok: true }, 'the matchup can be named in either order');
    assert.deepEqual(await save([3, 4], 3), { ok: true });
    assert.deepEqual(await picksOf(act, 6), [{ matchup: [3, 4], picked: 3 }, { matchup: [5, 6], picked: 5 }]);
    assert.deepEqual(await save([4, 3], null), { ok: true });
    assert.deepEqual(await picksOf(act, 6), [{ matchup: [5, 6], picked: 5 }]);
    assert.deepEqual(await save([3, 4], null), { ok: true }, 'clearing an unpicked matchup is fine');
});

test('an owner picks their own matchup, for or against their own franchise, and a week several weeks out', async t => {
    const { act, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [1, 2], picked: 2 })), { ok: true });
    assert.deepEqual(await picksOf(act, 6), [{ matchup: [1, 2], picked: 2 }]);
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [1, 2], picked: 1 })), { ok: true });
    assert.deepEqual(await picksOf(act, 6), [{ matchup: [1, 2], picked: 1 }]);
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 20, matchup: [9, 10], picked: 9 })), { ok: true });
    assert.deepEqual(await picksOf(act, 20), [{ matchup: [9, 10], picked: 9 }]);
    assert.deepEqual(await picksOf(act, 6), [{ matchup: [1, 2], picked: 1 }], 'each week keeps its own picks');
});

test('a save is refused for a signed-out caller and for an owner with no claimed team', async t => {
    const { act, signInAs, signOut } = await pickemLeague(t);
    const save = () => act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [1, 2], picked: 1 }));
    assert.deepEqual(await save(), { ok: false, reason: 'session-expired' });
    await signInAs('owner-none');
    assert.deepEqual(await save(), { ok: false, reason: 'no-team' });
    await signInAs('owner-11');
    assert.deepEqual(await save(), { ok: false, reason: 'no-team' }, 'a folded franchise has no entry');
    await signOut();
    assert.deepEqual(await save(), { ok: false, reason: 'session-expired' });
});

test('a save is refused for a matchup that does not meet that week and a franchise not in the matchup', async t => {
    const { act, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    const save = (matchup: [number, number], picked: number | null) => act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup, picked }));
    assert.deepEqual(await save([1, 3], 1), { ok: false, reason: 'no-such-matchup' });
    assert.deepEqual(await save([1, 3], null), { ok: false, reason: 'no-such-matchup' });
    assert.deepEqual(await save([1, 1], 1), { ok: false, reason: 'no-such-matchup' });
    assert.deepEqual(await save([1, 2], 3), { ok: false, reason: 'not-in-matchup' });
    assert.deepEqual(await picksOf(act, 6), []);
});

test('a franchise with a bye has no matchup', async t => {
    const state = liveSeasonState();
    state.fantrax.core.schedule.find(round => round.week === 6)!.matchups = scheduleOf([[1, 2], [3, 4], [5, 6], [7, 8], [9, null], [null, 10]]);
    const { act, signInAs } = await pickemLeague(t, { live: state });
    await signInAs('owner-1');
    const read = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 6, asker: 'nobody' }));
    assert.ok(read.status === 'week');
    assert.deepEqual(read.week.matchups.map(matchup => [matchup.away.id, matchup.home.id]), [[1, 2], [3, 4], [5, 6], [7, 8]]);
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [9, 10], picked: 9 })), { ok: false, reason: 'no-such-matchup' });
});

test('a playoff round, a week before the contest starts and a week of another season are not open for picks', async t => {
    const { act, signInAs } = await pickemLeague(t, { launch: { seasonYear: SEASON, week: 8 } });
    await signInAs('owner-1');
    const save = (seasonYear: number, week: number) => act(p => p.savePickemPick({ now: now(), seasonYear, week, matchup: [1, 2], picked: 1 }));
    assert.deepEqual(await save(SEASON, 24), { ok: false, reason: 'not-open' }, 'the Quarterfinals');
    assert.deepEqual(await save(SEASON, 7), { ok: false, reason: 'not-open' }, 'before the start week');
    assert.deepEqual(await save(SEASON, 99), { ok: false, reason: 'not-open' });
    assert.deepEqual(await save(SEASON + 1, 8), { ok: false, reason: 'not-open' });
    assert.deepEqual(await save(SEASON, 8), { ok: true });
    for (const week of [7, 24]) {
        assert.deepEqual(await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week, asker: 'session' })), { status: 'no-week' });
    }
    const next = await act(p => p.readWeek({ now: now(), asker: 'nobody' }));
    assert.equal(next.status === 'week' && next.week.week, 8, 'the next week to lock is the start week');
});

test('with Pick\'em switched off there is no week and a save is refused', async t => {
    const { act, signInAs } = await pickemLeague(t, { launch: null });
    await signInAs('owner-1');
    assert.deepEqual(await act(p => p.readWeek({ now: now(), asker: 'session' })), { status: 'no-week' });
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [1, 2], picked: 1 })), { ok: false, reason: 'not-open' });
});

test('a save at or after the lock is refused by the gate', async t => {
    const { act, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    const read = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 6, asker: 'nobody' }));
    assert.ok(read.status === 'week' && read.week.phase === 'open');
    // Week 6 genuinely locks tomorrow, so only the time passed in can refuse these.
    const lock = Date.parse(read.week.lock);
    assert.ok(lock > Date.now());
    assert.deepEqual(await act(p => p.savePickemPick({ now: lock - 1000, seasonYear: SEASON, week: 6, matchup: [1, 2], picked: 1 })), { ok: true });
    for (const at of [lock, lock + 60_000]) {
        assert.deepEqual(await act(p => p.savePickemPick({ now: at, seasonYear: SEASON, week: 6, matchup: [1, 2], picked: 2 })), { ok: false, reason: 'locked' });
        assert.deepEqual(await act(p => p.savePickemPick({ now: at, seasonYear: SEASON, week: 6, matchup: [3, 4], picked: 3 })), { ok: false, reason: 'locked' });
        assert.deepEqual(await act(p => p.savePickemPick({ now: at, seasonYear: SEASON, week: 6, matchup: [1, 2], picked: null })), { ok: false, reason: 'locked' });
    }
    const locked = await act(p => p.readWeek({ now: lock, seasonYear: SEASON, week: 6, asker: 'session' }));
    assert.ok(locked.status === 'week');
    assert.equal(locked.week.phase, 'locked');
    assert.deepEqual(locked.week.yours, { status: 'entry', franchiseId: 1, picks: [{ matchup: [1, 2], picked: 1 }] });
});

test('a save that reaches the database after the lock is refused by the statement itself', async t => {
    const { act, live, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [1, 2], picked: 1 })), { ok: true });
    // Fantrax moves week 6 to have started yesterday, so its lock has genuinely passed; the time passed in is
    // still before it, as for a request in flight at noon.
    const week6 = live.fantrax.core.weeks.find(week => week.number === 6)!;
    week6.startDate = new Date(Date.now() - 86400 * 1000).toISOString();
    const read = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 6, asker: 'nobody' }));
    assert.ok(read.status === 'week');
    const lock = Date.parse(read.week.lock);
    assert.ok(lock < Date.now());
    const inFlight = lock - 1000;
    assert.deepEqual(await act(p => p.savePickemPick({ now: inFlight, seasonYear: SEASON, week: 6, matchup: [1, 2], picked: 2 })), { ok: false, reason: 'locked' });
    assert.deepEqual(await act(p => p.savePickemPick({ now: inFlight, seasonYear: SEASON, week: 6, matchup: [3, 4], picked: 3 })), { ok: false, reason: 'locked' });
    assert.deepEqual(await act(p => p.savePickemPick({ now: inFlight, seasonYear: SEASON, week: 6, matchup: [1, 2], picked: null })), { ok: false, reason: 'locked' });
    assert.deepEqual(await picksOf(act, 6, inFlight), [{ matchup: [1, 2], picked: 1 }]);
});

test('reading a week returns the asker\'s own Pick\'em picks and never another entry\'s', async t => {
    const { act, signInAs, signOut } = await pickemLeague(t);
    await signInAs('owner-1');
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [1, 2], picked: 1 })), { ok: true });
    await signInAs('owner-3');
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [1, 2], picked: 2 })), { ok: true });
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [7, 8], picked: 8 })), { ok: true });

    const week = async (asker: 'nobody' | 'session') => {
        const read = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 6, asker }));
        assert.ok(read.status === 'week');
        return read.week;
    };
    assert.deepEqual((await week('session')).yours, { status: 'entry', franchiseId: 3, picks: [{ matchup: [1, 2], picked: 2 }, { matchup: [7, 8], picked: 8 }] });
    await signInAs('owner-1');
    assert.deepEqual((await week('session')).yours, { status: 'entry', franchiseId: 1, picks: [{ matchup: [1, 2], picked: 1 }] });
    await signInAs('owner-5');
    assert.deepEqual((await week('session')).yours, { status: 'entry', franchiseId: 5, picks: [] });
    const anonymous = await week('nobody');
    assert.equal(anonymous.yours, null, 'a read for nobody carries no picks, even with an owner signed in');
    assert.doesNotMatch(JSON.stringify(anonymous), /picked/);
    await signInAs('owner-none');
    assert.deepEqual((await week('session')).yours, { status: 'no-team' });
    await signOut();
    assert.deepEqual((await week('session')).yours, { status: 'signed-out' });
});

test('Pick\'em saves have their own limit of 300 in 15 minutes and other owner actions keep theirs', async t => {
    const { act, asOwner, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    for (let i = 0; i < 300; i++) {
        const result = await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6 + (i % 17), matchup: [1, 2], picked: i % 2 ? 1 : 2 }));
        assert.deepEqual(result, { ok: true }, `save ${i + 1}`);
    }
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [3, 4], picked: 3 })), { ok: false, reason: 'rate-limited' });
    for (let i = 0; i < 30; i++) assert.equal((await asOwner(s => s.ownerPreamble('keepers'))).ok, true, 'the keepers limit is its own');
    await assert.rejects(asOwner(s => s.ownerPreamble('keepers')), { message: 'Too many attempts. Please try again in 15 minutes.' });
});
