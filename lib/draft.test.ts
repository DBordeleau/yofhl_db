import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_STARTS_AT, draftCountdown } from './draft';

const start = Date.parse(DRAFT_STARTS_AT);

test('draft starts October 10, 2026 at 9 PM Eastern, regardless of the viewer timezone', () => {
    assert.equal(new Date(start).toISOString(), '2026-10-11T01:00:00.000Z');
    assert.equal(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(start), '2026-10-10, 21:00');
});

test('countdown rolls through each unit and expires exactly at the start', () => {
    assert.deepEqual(draftCountdown(start - (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000), [2, 3, 4, 5]);
    assert.deepEqual(draftCountdown(start - 86400_000), [1, 0, 0, 0]);
    assert.deepEqual(draftCountdown(start - 3600_000), [0, 1, 0, 0]);
    assert.deepEqual(draftCountdown(start - 60_000), [0, 0, 1, 0]);
    assert.deepEqual(draftCountdown(start - 1), [0, 0, 0, 1]);
    assert.equal(draftCountdown(start), null);
    assert.equal(draftCountdown(start + 86400_000), null);
});
