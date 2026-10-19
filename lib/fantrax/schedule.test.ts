import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EVENING_REFRESH_TIMES, scheduledRefreshTime, UTC_REFRESH_SLOTS } from './schedule';

test('six daily UTC jobs produce exactly four Eastern refreshes in summer, winter and after DST changes', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
    assert.equal(config.crons.length, UTC_REFRESH_SLOTS.length);
    for (const day of ['2026-10-19', '2026-11-02', '2027-01-20', '2027-03-15']) {
        for (const delay of [0, 59 * 60 * 1000]) {
            const times = config.crons.flatMap((cron: { path: string; schedule: string }) => {
                const slot = new URL(cron.path, 'https://example.com').searchParams.get('slot')!;
                const [hour, minute] = slot.split(':').map(Number);
                assert.equal(cron.schedule, `${minute} ${hour} * * *`, 'each job runs once per day on Hobby');
                const result = scheduledRefreshTime(slot, Date.parse(`${day}T${slot}:00Z`) + delay);
                return result ? [result] : [];
            });
            assert.deepEqual(times, EVENING_REFRESH_TIMES, `${day}, ${delay}ms late`);
        }
    }
});

test('rejects unknown slots and executions outside the scheduled hour', () => {
    const now = Date.parse('2026-10-19T00:00:00Z');
    for (const slot of [null, '', '20:00', '00:01', '24:00', '0:00']) assert.equal(scheduledRefreshTime(slot, now), null);
    assert.equal(scheduledRefreshTime('00:00', now + 60 * 60 * 1000), null);
    assert.equal(scheduledRefreshTime('01:00', now), null);
});
