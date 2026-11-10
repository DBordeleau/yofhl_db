// Locked weeks: the breakdown everyone sees from the lock on, and settle recording each locked week's pairings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, liveSeasonState, pickemLeague, scheduleOf, SEASON, weeksAroundNow } from './testing/pickem-league';

const now = () => Date.now();
type League = Awaited<ReturnType<typeof pickemLeague>>;

/** each owner's Pick'em picks on week `week`, saved now: [owner N, matchup, picked] */
async function savePicks({ act, signInAs, signOut }: League, week: number, picks: [number, [number, number], number][]) {
    for (const [owner, matchup, picked] of picks) {
        await signInAs(`owner-${owner}`);
        assert.deepEqual(await act(p => p.savePick({ now: now(), seasonYear: SEASON, week, matchup, picked })), { ok: true });
    }
    await signOut();
}

async function readAt(league: League, week: number, time: number, asker: 'nobody' | 'session' = 'nobody') {
    const read = await league.act(p => p.readWeek({ now: time, seasonYear: SEASON, week, asker }));
    assert.ok(read.status === 'week', `week ${week} reads`);
    return read.week;
}

/** a breakdown as [away, home, away entries' franchises, home entries' franchises] per matchup */
const sides = (week: Awaited<ReturnType<typeof readAt>>) => week.breakdown?.map(item =>
    [item.matchup.away.id, item.matchup.home.id, item.away.map(entry => entry.franchise.id), item.home.map(entry => entry.franchise.id)]);

test('until the lock a read returns no other entry\'s Pick\'em picks; from the lock anyone sees the breakdown', async t => {
    const league = await pickemLeague(t);
    await savePicks(league, 6, [[1, [1, 2], 1], [1, [3, 4], 4], [3, [1, 2], 2], [3, [3, 4], 4], [5, [1, 2], 1]]);
    const lock = Date.parse((await readAt(league, 6, now())).lock);

    for (const asker of ['nobody', 'session'] as const) {
        await league.signInAs('owner-1');
        const before = await readAt(league, 6, lock - 1000, asker);
        assert.equal(before.phase, 'open');
        assert.equal(before.breakdown, null, `a second before the lock, for ${asker}`);
        if (asker === 'session') assert.deepEqual(before.yours, { status: 'entry', franchiseId: 1, picks: [{ matchup: [1, 2], picked: 1 }, { matchup: [3, 4], picked: 4 }] });
    }

    await league.signOut();
    // No settle has run: the breakdown is there from the lock itself.
    const after = await readAt(league, 6, lock);
    assert.equal(after.phase, 'locked');
    assert.deepEqual(sides(after), [[1, 2, [1, 5], [3]], [3, 4, [], [1, 3]], [5, 6, [], []], [7, 8, [], []], [9, 10, [], []]]);
    assert.deepEqual(after.breakdown![0].away[0], { franchise: { id: 1, name: 'Franchise 1', abbreviation: 'F1', logo: '/logos/f1.png' }, owner: 'Owner 1' });
    const signedOut = await readAt(league, 6, lock, 'session');
    assert.deepEqual(signedOut.yours, { status: 'signed-out' });
    assert.deepEqual(sides(signedOut), sides(after), 'a signed-out caller sees the same breakdown');
});

/** Fantrax moves week `number` to have started `days` ago, so its lock has genuinely passed */
function startAgo({ live }: League, number: number, days = 1) {
    live.fantrax.core.weeks.find(week => week.number === number)!.startDate = new Date(Date.now() - days * DAY).toISOString();
}

const setPairs = ({ live }: League, number: number, pairs: [number, number][]) => {
    live.fantrax.core.schedule.find(round => round.week === number)!.matchups = scheduleOf(pairs);
};

const settle = (league: League, time = now()) => league.act(p => p.settle({ now: time }));
const weeksOf = (result: Awaited<ReturnType<typeof settle>>) => result.recorded.map(item => [item.seasonYear, item.week]);

test('settle records a locked week\'s pairings and lock once, and the breakdown counts Pick\'em picks against them', async t => {
    const league = await pickemLeague(t);
    await savePicks(league, 6, [[1, [1, 2], 1], [3, [5, 6], 6], [7, [7, 8], 8]]);
    // Before the lock Fantrax reshuffles week 6: 1 and 2 still meet, 5 and 6 no longer do.
    setPairs(league, 6, [[2, 1], [3, 5], [4, 6], [7, 8], [9, 10]]);
    startAgo(league, 6);
    const recordedLock = (await readAt(league, 6, now())).lock;
    const expected = [[2, 1, [], [1]], [3, 5, [], []], [4, 6, [], []], [7, 8, [], [7]], [9, 10, [], []]];
    assert.deepEqual(sides(await readAt(league, 6, now())), expected, 'before settle, the live pairing');

    assert.deepEqual(weeksOf(await settle(league)), [1, 2, 3, 4, 5, 6].map(week => [SEASON, week]));
    // Afterwards Fantrax changes week 6 again, pairing and start; neither the record nor a second settle follow it.
    setPairs(league, 6, [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]);
    startAgo(league, 6, 2);
    assert.deepEqual(weeksOf(await settle(league)), [], 'a second run changes nothing');

    const week = await readAt(league, 6, now());
    assert.equal(week.lock, recordedLock);
    assert.equal(week.phase, 'locked');
    assert.deepEqual(week.matchups.map(item => [item.away.id, item.home.id]), [[2, 1], [3, 5], [4, 6], [7, 8], [9, 10]]);
    assert.deepEqual(sides(week), expected, 'a pick on 5 v 6 matches no recorded pairing and appears on neither side');
    await league.signInAs('owner-3');
    assert.deepEqual((await readAt(league, 6, now(), 'session')).yours, { status: 'entry', franchiseId: 3, picks: [] });
    await league.signInAs('owner-1');
    assert.deepEqual((await readAt(league, 6, now(), 'session')).yours, { status: 'entry', franchiseId: 1, picks: [{ matchup: [1, 2], picked: 1 }] });
});

test('settle skips weeks before the start week and weeks not yet locked, and catches up a missed evening', async t => {
    const league = await pickemLeague(t, { launch: { seasonYear: SEASON, week: 3 } });
    const lockOf5 = Date.parse((await readAt(league, 5, now())).lock);
    assert.deepEqual(weeksOf(await settle(league, lockOf5 - 1000)), [[SEASON, 3], [SEASON, 4]]);
    assert.deepEqual(weeksOf(await settle(league)), [[SEASON, 5]], 'the next run records the week the last one missed');
    assert.deepEqual(weeksOf(await settle(league)), []);
    // Week 6 had not locked, so it was not recorded: once it locks, its pairing is whatever Fantrax has then.
    setPairs(league, 6, [[1, 3], [2, 4], [5, 7], [6, 8], [9, 10]]);
    startAgo(league, 6);
    assert.deepEqual((await readAt(league, 6, now())).matchups.map(item => [item.away.id, item.home.id]), [[1, 3], [2, 4], [5, 7], [6, 8], [9, 10]]);
    assert.deepEqual(weeksOf(await settle(league)), [[SEASON, 6]]);
});

test('settle skips playoff rounds and does nothing while Pick\'em is switched off', async t => {
    const late = await pickemLeague(t, { live: liveSeasonState(weeksAroundNow(26)) });
    assert.deepEqual(weeksOf(await settle(late)), Array.from({ length: 23 }, (_, index) => [SEASON, index + 1]), 'weeks 24 and 25 are playoff rounds');
    const off = await pickemLeague(t, { launch: null });
    assert.deepEqual(weeksOf(await settle(off)), []);
});

test('no caller can save or clear a Pick\'em pick on a locked week, before or after settle records it', async t => {
    const league = await pickemLeague(t);
    await savePicks(league, 6, [[1, [1, 2], 1]]);
    startAgo(league, 6);
    const attempts = async () => {
        await league.signOut();
        const save = (matchup: [number, number], picked: number | null) => league.act(p => p.savePick({ now: now(), seasonYear: SEASON, week: 6, matchup, picked }));
        assert.deepEqual(await save([1, 2], 2), { ok: false, reason: 'session-expired' });
        for (const owner of ['owner-1', 'owner-3']) {
            await league.signInAs(owner);
            assert.deepEqual(await save([1, 2], 2), { ok: false, reason: 'locked' }, owner);
            assert.deepEqual(await save([3, 4], 3), { ok: false, reason: 'locked' }, owner);
            assert.deepEqual(await save([1, 2], null), { ok: false, reason: 'locked' }, owner);
        }
        assert.deepEqual(sides(await readAt(league, 6, now())), [[1, 2, [1], []], [3, 4, [], []], [5, 6, [], []], [7, 8, [], []], [9, 10, [], []]]);
    };
    await attempts();
    assert.deepEqual(weeksOf(await settle(league)), [1, 2, 3, 4, 5, 6].map(week => [SEASON, week]));
    await attempts();
});

test('the most recently locked week can be read without naming it', async t => {
    const league = await pickemLeague(t, { launch: { seasonYear: SEASON, week: 3 } });
    const read = await league.act(p => p.readWeek({ now: now(), week: 'last-locked', asker: 'nobody' }));
    assert.ok(read.status === 'week');
    assert.equal(read.week.week, 5);
    assert.equal(read.week.phase, 'locked');
    const lockOf3 = Date.parse((await readAt(league, 3, now())).lock);
    assert.deepEqual(await league.act(p => p.readWeek({ now: lockOf3 - 1000, week: 'last-locked', asker: 'nobody' })), { status: 'no-week' }, 'before the start week locks');
});
