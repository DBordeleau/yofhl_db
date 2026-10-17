import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { watchLottery } from './polling';
import { publicLottery, type LotteryResponse } from './model';

const start = Date.parse('2026-10-01T00:00:00Z');
const response = (elapsed: number, winnerId: number | null = 1): LotteryResponse => ({
    serverNow: new Date(start + elapsed).toISOString(),
    lottery: publicLottery({ id: 'event', title: 'Draw', startsAt: new Date(start).toISOString(),
        entries: [1, 2].map(id => ({ id, name: `Team ${id}`, abbreviation: `T${id}`, odds: 50, logo: null })),
        winnerId, drawnAt: null, version: 1, isCurrent: true, cancelledAt: null }, start + elapsed),
});
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function browser(t: TestContext) {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
    Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
    const stops: (() => void)[] = [];
    t.after(() => { stops.forEach(stop => stop()); Reflect.deleteProperty(globalThis, 'document'); Reflect.deleteProperty(globalThis, 'window'); });
    t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: start });
    t.mock.method(performance, 'now', () => Date.now() - start);
    return Object.assign((visible: boolean) => { doc.visibilityState = visible ? 'visible' : 'hidden'; doc.dispatchEvent(new Event('visibilitychange')); },
        { cleanup: (stop: () => void) => stops.push(stop) });
}

test('completion stops requests and clock ticks, including an already complete page', async t => {
    const visible = browser(t);
    const request = t.mock.method(globalThis, 'fetch', async () => Response.json(response(30_000)));
    const times: number[] = [];
    const updates: LotteryResponse[] = [];
    const stop = watchLottery(response(1000), undefined, data => updates.push(data), now => times.push(now), () => {});
    visible.cleanup(stop);
    await settle();
    assert.equal(updates.at(-1)?.lottery?.phase, 'complete');
    const ticks = times.length;
    t.mock.timers.tick(120_000);
    await settle();
    assert.equal(request.mock.callCount(), 1);
    assert.equal(times.length, ticks);
    const stopComplete = watchLottery(response(30_000), 'event', () => assert.fail('unexpected update'), () => assert.fail('unexpected tick'), () => {});
    visible.cleanup(stopComplete);
    t.mock.timers.tick(120_000);
    assert.equal(request.mock.callCount(), 1);
});

test('hidden tabs pause timers and requests; returning catches up using server time', async t => {
    const visible = browser(t);
    let next = response(-60_000, null);
    const request = t.mock.method(globalThis, 'fetch', async () => Response.json(next));
    const times: number[] = [];
    const updates: LotteryResponse[] = [];
    const stop = watchLottery(next, 'event', data => updates.push(data), now => times.push(now), () => {});
    visible.cleanup(stop);
    await settle();
    visible(false);
    const ticks = times.length;
    t.mock.timers.tick(60_000);
    window.dispatchEvent(new Event('online'));
    await settle();
    assert.equal(request.mock.callCount(), 1);
    assert.equal(times.length, ticks);
    next = response(1000);
    visible(true);
    await settle();
    assert.equal(request.mock.callCount(), 2);
    assert.equal(times.at(-1), start + 1000);
    t.mock.timers.tick(250);
    assert.equal(times.at(-1), start + 1250, 'clock advances by elapsed monotonic time');
    t.mock.timers.tick(750);
    await settle();
    assert.equal(request.mock.callCount(), 3, 'live events still poll each second');
    assert.equal(updates.at(-1)?.lottery?.winnerId, null, 'winner remains hidden before finale');
});

test('late responses cannot restart a hidden or unmounted lottery', async t => {
    const visible = browser(t);
    const pending: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
    const request = t.mock.method(globalThis, 'fetch', (_url: unknown, options: RequestInit) => new Promise<Response>(resolve => {
        pending.push({ signal: options.signal!, resolve });
    }));
    const stop = watchLottery(response(1000), undefined, () => assert.fail('stale response'), () => {}, () => assert.fail('aborted request'));
    visible.cleanup(stop);
    window.dispatchEvent(new Event('online'));
    assert.equal(request.mock.callCount(), 1, 'in-flight polls are deduplicated');
    visible(false);
    assert.equal(pending[0].signal.aborted, true);
    visible(true);
    pending[0].resolve(Response.json(response(2000)));
    await settle();
    stop();
    assert.equal(pending[1].signal.aborted, true);
    pending[1].resolve(Response.json(response(3000)));
    await settle();
    t.mock.timers.tick(120_000);
    assert.equal(request.mock.callCount(), 2);
});

test('failed polls retry and local elapsed time cannot skip an unconfirmed draw', async t => {
    const visible = browser(t);
    const errors: boolean[] = [];
    const request = t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
    const stop = watchLottery(response(60_000, null), undefined, () => {}, () => {}, error => errors.push(error));
    visible.cleanup(stop);
    await settle();
    assert.equal(errors.at(-1), true);
    t.mock.timers.tick(2500);
    await settle();
    assert.equal(request.mock.callCount(), 2, 'draw without a persisted winner must keep trying');
});
