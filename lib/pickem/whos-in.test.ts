// Who's in for the next week to lock: every active franchise, and whether it has a Pick'em pick on every matchup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickemLeague, scheduleOf, SEASON } from './testing/pickem-league';

const now = () => Date.now();

test('the next week to lock lists every active franchise by owner and current identity, none in yet', async t => {
    const { act } = await pickemLeague(t);
    const read = await act(p => p.readWeek({ now: now(), asker: 'nobody' }));
    assert.ok(read.status === 'week');
    assert.equal(read.week.week, 6);
    const list = read.week.whosIn;
    assert.ok(list);
    assert.equal(list.length, 10, 'the folded franchise is left out');
    assert.deepEqual(list.find(entry => entry.franchise.id === 3), {
        franchise: { id: 3, name: 'Franchise 3', abbreviation: 'F3', logo: '/logos/f3.png' }, owner: 'Owner 3', in: false,
    });
    assert.ok(list.every(entry => !entry.in));
});

/** the franchises in for the next week to lock, read for `asker` */
const inFor = async (act: Awaited<ReturnType<typeof pickemLeague>>['act'], asker: 'nobody' | 'session' = 'nobody') => {
    const read = await act(p => p.readWeek({ now: now(), asker }));
    assert.ok(read.status === 'week' && read.week.whosIn, 'the next week to lock has a who\'s-in list');
    return read.week.whosIn.filter(entry => entry.in).map(entry => entry.franchise.id);
};

const ALL: [number, number][] = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]];

test('a franchise with a Pick\'em pick on every matchup is in, one missing any is not, and clearing one takes it out', async t => {
    const { act, signInAs } = await pickemLeague(t);
    const save = (matchup: [number, number], picked: number | null) => act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup, picked }));
    await signInAs('owner-1');
    for (const matchup of ALL) assert.deepEqual(await save(matchup, matchup[1]), { ok: true });
    await signInAs('owner-2');
    for (const matchup of ALL.slice(0, 4)) assert.deepEqual(await save(matchup, matchup[0]), { ok: true });
    assert.deepEqual(await inFor(act), [1]);

    await signInAs('owner-2');
    assert.deepEqual(await save([9, 10], 9), { ok: true });
    assert.deepEqual((await inFor(act)).sort((a, b) => a - b), [1, 2]);
    await signInAs('owner-1');
    assert.deepEqual(await save([5, 6], null), { ok: true });
    assert.deepEqual(await inFor(act), [2]);
});

test('a Pick\'em pick on a pair that no longer meets does not count toward being in', async t => {
    const { act, live, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    for (const matchup of ALL) assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup, picked: matchup[0] })), { ok: true });
    assert.deepEqual(await inFor(act), [1]);
    // Fantrax swaps two pairings: 1 v 2 and 3 v 4 become 1 v 3 and 2 v 4.
    live.fantrax.core.schedule.find(round => round.week === 6)!.matchups = scheduleOf([[1, 3], [2, 4], [5, 6], [7, 8], [9, 10]]);
    assert.deepEqual(await inFor(act), []);
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [1, 3], picked: 1 })), { ok: true });
    assert.deepEqual(await inFor(act), []);
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [2, 4], picked: 4 })), { ok: true });
    assert.deepEqual(await inFor(act), [1]);
});

test('the who\'s-in list reaches a signed-out caller and an owner alike, and never says which side anyone picked', async t => {
    const { act, signInAs, signOut } = await pickemLeague(t);
    await signInAs('owner-4');
    for (const matchup of ALL) assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup, picked: matchup[1] })), { ok: true });
    await signOut();
    assert.deepEqual(await inFor(act, 'session'), [4]);
    assert.deepEqual(await inFor(act, 'nobody'), [4]);
    await signInAs('owner-7');
    assert.deepEqual(await inFor(act, 'session'), [4]);
    const read = await act(p => p.readWeek({ now: now(), asker: 'session' }));
    assert.ok(read.status === 'week');
    assert.deepEqual(read.week.yours, { status: 'entry', franchiseId: 7, picks: [] });
    assert.doesNotMatch(JSON.stringify(read.week.whosIn), /picked|matchup|pairs/);
    for (const entry of read.week.whosIn ?? []) assert.deepEqual(Object.keys(entry).sort(), ['franchise', 'in', 'owner']);
});

test('a week beyond the next to lock, and a locked week, have no who\'s-in list', async t => {
    const { act, signInAs } = await pickemLeague(t);
    await signInAs('owner-1');
    assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 7, matchup: [1, 2], picked: 1 })), { ok: true });
    for (const week of [5, 7, 20]) {
        for (const asker of ['nobody', 'session'] as const) {
            const read = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week, asker }));
            assert.ok(read.status === 'week');
            assert.equal(read.week.whosIn, null, `week ${week} for ${asker}`);
        }
    }
    const named = await act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 6, asker: 'nobody' }));
    assert.ok(named.status === 'week' && named.week.whosIn, 'naming the next week to lock still returns the list');
});
