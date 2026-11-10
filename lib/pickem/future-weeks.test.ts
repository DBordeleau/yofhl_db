// Picking any future week: the week switcher, privacy of weeks ahead, and Pick'em picks across schedule changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { liveSeasonState, pickemLeague, scheduleOf, SEASON } from './testing/pickem-league';

const now = () => Date.now();

test('the switcher lists every regular-season week from the start week on, with the next week to lock selected', async t => {
    const { act } = await pickemLeague(t, { launch: { seasonYear: SEASON, week: 3 } });
    const read = await act(p => p.readWeek({ now: now(), asker: 'nobody' }));
    assert.ok(read.status === 'week');
    assert.equal(read.week.week, 6, 'the next week to lock is selected by default');
    assert.deepEqual(read.weeks.map(week => week.week), Array.from({ length: 21 }, (_, index) => index + 3), 'weeks 3–23, no playoff rounds');
    assert.deepEqual(read.weeks.slice(0, 4).map(week => [week.name, week.phase]), [
        ['Week 3', 'locked'], ['Week 4', 'locked'], ['Week 5', 'locked'], ['Week 6', 'open'],
    ]);
    assert.ok(read.weeks.every(week => typeof week.lock === 'string'));

    const ahead = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 15, asker: 'nobody' }));
    assert.ok(ahead.status === 'week');
    assert.equal(ahead.week.week, 15);
    assert.deepEqual(ahead.weeks, read.weeks, 'every week of the season reads the same switcher');
});

test('a week several weeks ahead saves, changes and clears Pick\'em picks up to its own lock', async t => {
    const { act, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    const read = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 10, asker: 'session' }));
    assert.ok(read.status === 'week');
    assert.equal(read.week.phase, 'open');
    assert.equal(read.week.matchups.length, 5);
    const lock = Date.parse(read.week.lock);
    const week6Lock = Date.parse(read.weeks.find(week => week.week === 6)!.lock);
    assert.ok(lock > week6Lock);

    const save = (at: number, matchup: [number, number], picked: number | null) =>
        act(p => p.savePick({ now: at, seasonYear: SEASON, week: 10, matchup, picked }));
    assert.deepEqual(await save(week6Lock + 1000, [1, 2], 1), { ok: true }, 'week 6 locking does not close week 10');
    assert.deepEqual(await save(now(), [3, 4], 4), { ok: true });
    assert.deepEqual(await save(lock - 1000, [1, 2], 2), { ok: true });
    assert.deepEqual(await save(now(), [3, 4], null), { ok: true });
    assert.deepEqual(await save(lock, [5, 6], 5), { ok: false, reason: 'locked' });

    const after = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 10, asker: 'session' }));
    assert.ok(after.status === 'week');
    assert.deepEqual(after.week.yours, { status: 'entry', franchiseId: 1, picks: [{ matchup: [1, 2], picked: 2 }] },
        'one of the week\'s five matchups picked');
});

test('reading a future week returns nothing about any other entry', async t => {
    const { act, signInAs, signOut } = await pickemLeague(t);
    for (const owner of ['owner-2', 'owner-3']) {
        await signInAs(owner);
        assert.deepEqual(await act(p => p.savePick({ now: now(), seasonYear: SEASON, week: 12, matchup: [7, 8], picked: 7 })), { ok: true });
    }
    await signInAs('owner-1');
    const mine = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 12, asker: 'session' }));
    assert.ok(mine.status === 'week');
    assert.deepEqual(mine.week.yours, { status: 'entry', franchiseId: 1, picks: [] });
    await signOut();
    const anonymous = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 12, asker: 'nobody' }));
    for (const read of [mine, anonymous]) {
        const text = JSON.stringify({ ...read, week: { ...read.status === 'week' ? read.week : {}, yours: null } });
        assert.doesNotMatch(text, /picked|owner-|"in"/, 'no Pick\'em picks and no who\'s-in list');
    }
});

test('a Pick\'em pick reads as unpicked once its two franchises no longer meet, and is never deleted', async t => {
    const state = liveSeasonState();
    const { act, signInAs } = await pickemLeague(t, { live: state });
    const round = state.fantrax.core.schedule.find(item => item.week === 9)!;
    await signInAs('owner-1');
    const save = (matchup: [number, number], picked: number) => act(p => p.savePick({ now: now(), seasonYear: SEASON, week: 9, matchup, picked }));
    const picks = async () => {
        const read = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 9, asker: 'session' }));
        assert.ok(read.status === 'week' && read.week.yours?.status === 'entry');
        return read.week.yours.picks;
    };
    assert.deepEqual(await save([1, 2], 1), { ok: true });
    assert.deepEqual(await save([3, 4], 4), { ok: true });

    // Fantrax reshuffles week 9 so neither picked pairing meets.
    round.matchups = scheduleOf([[1, 3], [4, 2], [5, 6], [7, 8], [9, 10]]);
    assert.deepEqual(await picks(), []);
    round.matchups = scheduleOf([[1, 3], [2, 5], [4, 6], [8, 7], [10, 9]]);
    assert.deepEqual(await picks(), []);
    round.matchups = scheduleOf([[2, 9], [4, 3], [5, 6], [7, 8], [1, 10]]);
    assert.deepEqual(await picks(), [{ matchup: [3, 4], picked: 4 }], 'the same two franchises still meet, so the pick stands');
    assert.deepEqual(await save([1, 2], 2), { ok: false, reason: 'no-such-matchup' });
    assert.deepEqual(await save([1, 10], 10), { ok: true }, 'the new matchup can be picked');
    assert.deepEqual(await picks(), [{ matchup: [1, 10], picked: 10 }, { matchup: [3, 4], picked: 4 }]);

    // Fantrax puts the original pairings back: the old pick was kept as it was.
    round.matchups = scheduleOf([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]);
    assert.deepEqual(await picks(), [{ matchup: [1, 2], picked: 1 }, { matchup: [3, 4], picked: 4 }]);
});

test('an owner fills every remaining week in one sitting, about a hundred saves in a row', async t => {
    const { act, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    const first = await act(p => p.readWeek({ now: now(), asker: 'nobody' }));
    assert.ok(first.status === 'week');
    const open = first.weeks.filter(week => week.phase === 'open');
    assert.equal(open.length, 18, 'weeks 6–23');
    let saves = 0;
    for (const { week } of open) {
        for (const pair of [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]] as [number, number][]) {
            assert.deepEqual(await act(p => p.savePick({ now: now(), seasonYear: SEASON, week, matchup: pair, picked: pair[week % 2] })), { ok: true }, `week ${week}`);
            saves++;
        }
    }
    assert.equal(saves, 90);
    const last = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 23, asker: 'session' }));
    assert.ok(last.status === 'week' && last.week.yours?.status === 'entry');
    assert.equal(last.week.yours.picks.length, last.week.matchups.length, 'every matchup of the week picked');
});
