// The Fantrax cron route: its auth and slot checks, and what it reports for each refresh outcome. What a refresh
// does is covered in refresh.test.ts; what Pick'em settle does in lib/pickem/settle.test.ts and its neighbours.
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { disposableLeague } from '../testing/disposable-league';
import { fakeFantrax, SEED } from './testing/fake-fantrax';

const request = (slot: string, token?: string) =>
    new Request(`https://example.com/api/cron/fantrax?slot=${slot}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

function withSecret(t: TestContext, secret: string | undefined) {
    const original = process.env.CRON_SECRET;
    t.after(() => { if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original; });
    if (secret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = secret;
}

test('cron rejects missing or incorrect credentials and skips off-season UTC slots without fetching Fantrax', async t => {
    let calls = 0;
    // Modules that touch Next load after the league stands in for it.
    await disposableLeague(t, { app: true, nextCache: true, fetch: async () => { calls++; throw Error('No upstream request expected'); } });
    const { GET } = await import('@/app/api/cron/fantrax/route');
    withSecret(t, undefined);
    assert.equal((await GET(request('04:30', 'undefined'))).status, 401);
    process.env.CRON_SECRET = 'test-secret';
    assert.equal((await GET(request('04:30'))).status, 401);
    assert.equal((await GET(request('04:30', 'wrong-secret'))).status, 401);
    t.mock.method(Date, 'now', () => Date.parse('2026-10-19T04:30:00Z'));
    const response = await GET(request('04:30', 'test-secret'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { skipped: true });
    assert.equal(calls, 0);
});

test('cron reports whether each refresh published, found no change or skipped a frozen season, and settles Pick\'em after each',async t => {
    let settled = false;
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: SEED, fetch: fakeFantrax(() => settled) });
    t.mock.method(console, 'warn', () => {});
    const { GET } = await import('@/app/api/cron/fantrax/route');
    const { pickem } = await import('@/lib/pickem/pickem');
    const settles = t.mock.method(pickem, 'settle', async () => ({ recorded: [], frozen: [], held: [], completed: [] }));
    withSecret(t, 'test-secret');
    let now = 0;
    t.mock.method(Date, 'now', () => now);
    /** the route's response at `time`, from the UTC slot that is 11:30 p.m. Eastern then */
    const run = async (time: string, slot: string) => {
        now = Date.parse(time);
        const { result } = await league.runAsRoute('/api/cron/fantrax', () => GET(request(slot, 'test-secret')));
        return { status: result.status, body: await result.json() };
    };
    const capturedAt = (body: { fetchedAt?: unknown }) => {
        assert.ok(typeof body.fetchedAt === 'string' && !Number.isNaN(Date.parse(body.fetchedAt)), `fetchedAt ${body.fetchedAt}`);
        return { ...body, fetchedAt: 'captured' };
    };

    const published = await run('2026-10-19T03:30:00Z', '03:30');
    assert.equal(published.status, 200);
    assert.deepEqual(capturedAt(published.body), { scheduled: '23:30', refresh: 'published', fetchedAt: 'captured' });
    const unchanged = await run('2026-10-19T03:30:00Z', '03:30');
    assert.deepEqual(capturedAt(unchanged.body), { scheduled: '23:30', refresh: 'unchanged', fetchedAt: 'captured' });
    assert.equal(settles.mock.callCount(), 2, "Pick'em settles after a published and an unchanged refresh");

    settles.mock.mockImplementationOnce(async () => { throw Error('settle failed'); });
    t.mock.method(console, 'error', () => {});
    settled = true;
    const settleFailed = await run('2026-10-19T03:30:00Z', '03:30');
    assert.equal(settleFailed.status, 500);
    assert.deepEqual(capturedAt(settleFailed.body), { scheduled: '23:30', refresh: 'published', fetchedAt: 'captured', error: "Pick'em settle failed" });

    // The Final ended on November 4, so its correction window has closed: 2027 is a frozen season.
    const frozen = await run('2026-11-20T04:30:00Z', '04:30');
    assert.equal(frozen.status, 200);
    assert.deepEqual(frozen.body, { scheduled: '23:30', refresh: 'frozen' });
    assert.equal(settles.mock.callCount(), 4, "Pick'em settles after a refresh skipped for a frozen season too");

    settles.mock.mockImplementationOnce(async () => { throw Error('settle failed'); });
    const frozenSettleFailed = await run('2026-11-20T04:30:00Z', '04:30');
    assert.equal(frozenSettleFailed.status, 500);
    assert.deepEqual(frozenSettleFailed.body, { scheduled: '23:30', refresh: 'frozen', error: "Pick'em settle failed" });
});
