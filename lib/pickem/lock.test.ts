// The lock: noon Eastern on the week's first day, read through a week of the live season.
import test from 'node:test';
import assert from 'node:assert/strict';
import { liveSeasonState, pickemLeague, SEASON } from './testing/pickem-league';

const DAY = 86400 * 1000;
// Week starts (ISO), and the lock each must get: noon in Toronto on the start's date in Toronto.
const STARTS: [start: string, lock: string][] = [
    ['2026-10-07T04:00:00.000Z', '2026-10-07T16:00:00.000Z'], // a Wednesday opening week, midnight EDT
    ['2026-10-12T17:00:00.000Z', '2026-10-12T16:00:00.000Z'], // Monday 1 p.m. EDT: the lock comes before the start
    ['2026-10-27T02:00:00.000Z', '2026-10-26T16:00:00.000Z'], // Monday 10 p.m. EDT, already Tuesday in UTC
    ['2026-11-01T04:00:00.000Z', '2026-11-01T17:00:00.000Z'], // the Sunday daylight saving ends: midnight EDT, noon EST
    ['2026-11-02T05:00:00.000Z', '2026-11-02T17:00:00.000Z'], // the Monday after, in EST
    ['2027-03-08T05:00:00.000Z', '2027-03-08T17:00:00.000Z'], // a Monday in EST
    ['2027-03-14T05:00:00.000Z', '2027-03-14T16:00:00.000Z'], // the Sunday daylight saving starts: midnight EST, noon EDT
    ['2027-03-15T04:00:00.000Z', '2027-03-15T16:00:00.000Z'], // the Monday after, in EDT
];

function season() {
    const starts = [...STARTS.map(([start]) => start), '2027-03-22T04:00:00.000Z', '2027-03-29T04:00:00.000Z', '2027-04-05T04:00:00.000Z'];
    return liveSeasonState(starts.map((startDate, index) => ({
        number: index + 1, startDate, endDate: new Date(Date.parse(startDate) + 5 * DAY).toISOString(),
    })));
}

test('a week locks at noon Eastern on its first day, on both sides of a daylight saving change and on any weekday', async t => {
    const { act } = await pickemLeague(t, { live: season() });
    const before = Date.parse('2026-09-01T12:00:00.000Z');
    for (const [index, [start, lock]] of STARTS.entries()) {
        const read = await act(p => p.readWeek({ now: before, seasonYear: SEASON, week: index + 1, asker: 'nobody' }));
        assert.ok(read.status === 'week', start);
        assert.equal(read.week.lock, lock, start);
    }
});

test('the next week to lock turns over at the lock, not at the week\'s start', async t => {
    const { act } = await pickemLeague(t, { live: season() });
    const next = async (now: number) => {
        const read = await act(p => p.readWeek({ now, asker: 'nobody' }));
        return read.status === 'week' ? [read.week.week, read.week.phase] : read.status;
    };
    const week2Lock = Date.parse('2026-10-12T16:00:00.000Z');
    assert.deepEqual(await next(week2Lock - 1000), [2, 'open']);
    assert.deepEqual(await next(week2Lock), [3, 'open'], 'week 2 has locked though it starts an hour later');
    assert.deepEqual(await next(Date.parse('2027-03-15T16:00:00.000Z')), 'no-week', 'every regular-season week has locked');
});
