import assert from 'node:assert/strict';
import test from 'node:test';
import { GET } from '@/app/api/cron/fantrax/route';

test('cron rejects missing or incorrect credentials and skips off-season UTC slots without fetching Fantrax', async t => {
    const original = process.env.CRON_SECRET;
    t.after(() => { if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original; });
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; throw Error('No upstream request expected'); });
    const request = (token?: string) => new Request('https://example.com/api/cron/fantrax?slot=04:30', { headers: token ? { authorization: `Bearer ${token}` } : {} });
    delete process.env.CRON_SECRET;
    assert.equal((await GET(request('undefined'))).status, 401);
    process.env.CRON_SECRET = 'test-secret';
    assert.equal((await GET(request())).status, 401);
    assert.equal((await GET(request('wrong-secret'))).status, 401);
    t.mock.method(Date, 'now', () => Date.parse('2026-10-19T04:30:00Z'));
    const response = await GET(request('test-secret'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { skipped: true });
    assert.equal(calls, 0);
});
