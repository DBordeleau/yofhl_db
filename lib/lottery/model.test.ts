import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftOrder, easternInput, easternToIso, finalRevealAt, FINALE_MS, INTRO_MS, lotteryPickCount, NAV_WINDOW_MS, navVisible, pickWinner, publicLottery, REVEAL_MS, validateEntries, type LotteryEntry, type LotteryRecord } from './model';

const entries: LotteryEntry[] = [40, 30, 20, 10, null, null].map((odds, index) => ({ id: index + 1, name: `Team ${index + 1}`, abbreviation: `T${index + 1}`, logo: null, odds }));
const start = Date.parse('2026-10-10T23:00:00Z');
const record: LotteryRecord = { id: 'test', title: 'Draft lottery', startsAt: new Date(start).toISOString(), entries, version: 1, isCurrent: true, cancelledAt: null, winnerId: 3, drawnAt: new Date(start).toISOString() };

test('Eastern scheduling round-trips summer, winter and both sides of DST changes', () => {
    for (const [local, utc] of [
        ['2026-07-15T19:30', '2026-07-15T23:30:00.000Z'],
        ['2026-12-15T19:30', '2026-12-16T00:30:00.000Z'],
        ['2026-03-08T01:30', '2026-03-08T06:30:00.000Z'],
        ['2026-03-08T03:30', '2026-03-08T07:30:00.000Z'],
        ['2026-11-01T02:30', '2026-11-01T07:30:00.000Z'],
    ]) { assert.equal(easternToIso(local), utc); assert.equal(easternInput(utc), local); }
    assert.throws(() => easternToIso('2026-03-08T02:30'), /does not exist/);
    assert.throws(() => easternToIso('2026-11-01T01:30'), /occurs twice/);
    assert.throws(() => easternToIso('2026-02-30T10:00'));
    assert.throws(() => easternToIso('not-a-date'));
});

test('each of the 10,000 equally likely tickets matches the configured odds exactly', () => {
    const counts = new Map<number, number>();
    for (let ticket = 0; ticket < 10_000; ticket++) {
        const id = pickWinner(entries, ticket);
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    assert.deepEqual([...counts], [[1, 4000], [2, 3000], [3, 2000], [4, 1000]]);
    assert.throws(() => pickWinner(entries, 10_000));
    assert.throws(() => pickWinner(entries, -1));
});

test('only the winner moves to the top, including interleaved fixed teams', () => {
    assert.deepEqual(draftOrder(entries, 3).map((team) => team.id), [3, 1, 2, 4, 5, 6]);
    assert.deepEqual(draftOrder(entries, 1), entries);
    const interleaved = [entries[4], entries[0], entries[5], entries[1], entries[2], entries[3]];
    assert.deepEqual(draftOrder(interleaved, 4).map((team) => team.id), [4, 5, 1, 6, 2, 3]);
    assert.throws(() => draftOrder(entries, 5));
    assert.equal(entries[0].id, 1);
});

test('validation rejects duplicate/missing teams, invalid odds, and invalid totals', () => {
    assert.deepEqual(validateEntries(entries, entries), entries);
    const change = (odds: number | null) => entries.map((entry, index) => index ? entry : { ...entry, odds });
    for (const odds of [NaN, Infinity, -1, 0, 40.001, 101, 39]) assert.throws(() => validateEntries(change(odds), entries));
    assert.throws(() => validateEntries([...entries.slice(1), entries[1]], entries));
    assert.throws(() => validateEntries(entries.slice(1), entries));
    assert.throws(() => validateEntries(entries.map((entry, index) => ({ ...entry, odds: index ? null : 100 })), entries));
    const decimals = entries.map((entry, index) => ({ ...entry, odds: [33.33, 33.33, 33.34, null, null, null][index] }));
    assert.deepEqual(validateEntries(decimals, entries), decimals);
});

test('the navigation appears exactly 24 hours before start', () => {
    assert.equal(navVisible(record, start - NAV_WINDOW_MS - 1), false);
    assert.equal(navVisible(record, start - NAV_WINDOW_MS), true);
    assert.equal(navVisible(record, start), true);
    assert.equal(navVisible(record, start + NAV_WINDOW_MS), true);
});

test('public start times use browser-safe ISO format for database timestamps', () => {
    const fromDatabase = { ...record, startsAt: '2026-10-10 23:00:00+00' };
    const response = publicLottery(fromDatabase, start - 10_000);
    assert.equal(response.startsAt, '2026-10-10T23:00:00.000Z');
    assert.deepEqual(response, publicLottery(record, start - 10_000));
});

test('public responses withhold unrevealed results, including the final two picks', () => {
    const pickCount = lotteryPickCount(entries);
    assert.equal(pickCount, 4);
    for (const now of [start - 1, start, start + INTRO_MS - 1]) {
        const data = publicLottery(record, now);
        assert.deepEqual(data.revealed.filter((pick) => pick.pick <= pickCount), []);
        assert.deepEqual(data.revealed.map((pick) => pick.pick), now < start ? [] : [5, 6]);
        assert.equal(data.winnerId, null);
        assert.equal('drawnAt' in data, false);
    }
    assert.equal(publicLottery(record, start - 1).phase, 'scheduled');
    assert.equal(publicLottery(record, start).phase, 'live');
    for (let count = 1; count <= pickCount - 2; count++) {
        const data = publicLottery(record, start + INTRO_MS + (count - 1) * REVEAL_MS);
        const expected: number[] = Array.from({ length: count }, (_, i): number => pickCount - count + i + 1);
        assert.deepEqual(data.revealed.filter((pick) => pick.pick <= pickCount).map((pick) => pick.pick), expected);
        assert.equal(data.winnerId, null);
    }
    const finale = finalRevealAt(record.startsAt, entries);
    assert.equal(REVEAL_MS, 10_000, 'picks are revealed ten seconds apart');
    assert.equal(finale - start, 32_000, 'fixed draft positions do not add reveal time');
    assert.equal(publicLottery(record, finale - 1).revealed.length, 4);
    const final = publicLottery(record, finale);
    assert.equal(final.winnerId, 3);
    assert.deepEqual(final.revealed.map((pick) => pick.team.id), [3, 1, 2, 4, 5, 6]);
    assert.equal(final.nextRevealAt, null);
    assert.equal(final.phase, 'live');
    assert.equal(publicLottery(record, finale + FINALE_MS).phase, 'complete');
    assert.deepEqual(publicLottery(record, finale + FINALE_MS).revealed, final.revealed);
});

test('only positions that can change are hidden, including interleaved fixed teams', () => {
    for (const order of [entries, [entries[0], entries[4], entries[1], entries[5], entries[2], entries[3]]]) {
        const count = lotteryPickCount(order);
        for (const candidate of order.filter((entry) => entry.odds !== null)) {
            assert.deepEqual(draftOrder(order, candidate.id).slice(count), order.slice(count));
        }
    }
    assert.equal(lotteryPickCount(entries.slice(0, 2)), 2);
    assert.equal(lotteryPickCount([entries[0], entries[4], entries[1], entries[5]]), 3);
});

test('a two-team draft reveals both teams together and an undrawn event never completes', () => {
    const two = { ...record, entries: entries.slice(0, 2), winnerId: 2 };
    assert.equal(publicLottery(two, start + INTRO_MS - 1).revealed.length, 0);
    assert.equal(publicLottery(two, start + INTRO_MS).revealed.length, 2);
    const undrawn = publicLottery({ ...record, winnerId: null }, start + 86400_000);
    assert.equal(undrawn.phase, 'live');
    assert.equal(undrawn.winnerId, null);
    assert.deepEqual(undrawn.revealed, []);
});
