import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshOwnerNavigation, watchOwnerNavigation, type OwnerNavigation } from './navigation';

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test('owner navigation reuses state, throttles focus and always refreshes account changes', async t => {
    const events = new EventTarget();
    Object.defineProperty(globalThis, 'window', { value: events, configurable: true });
    let stop = () => {};
    t.after(() => { stop(); Reflect.deleteProperty(globalThis, 'window'); });
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
    let state: OwnerNavigation = { signedIn: true, team: { name: 'Team', abbreviation: 'T', logo: null } };
    const request = t.mock.method(globalThis, 'fetch', async () => Response.json(state));
    const seen: OwnerNavigation[] = [];
    stop = watchOwnerNavigation(value => seen.push(value));
    await settle();
    for (let i = 0; i < 5; i++) events.dispatchEvent(new Event('focus'));
    events.dispatchEvent(new Event('popstate'));
    assert.equal(request.mock.callCount(), 1, 'navigation and fresh focus need no session request');
    t.mock.timers.tick(60_000);
    events.dispatchEvent(new Event('focus'));
    await settle();
    assert.equal(request.mock.callCount(), 2);
    state = { signedIn: false, team: null };
    refreshOwnerNavigation();
    await settle();
    assert.equal(request.mock.callCount(), 3, 'sign-out bypasses freshness');
    assert.deepEqual(seen.at(-1), state);
    request.mock.mockImplementation(async () => { throw new Error('offline'); });
    refreshOwnerNavigation();
    await settle();
    assert.deepEqual(seen.at(-1), state, 'a transient error preserves last known state');
    stop();
    events.dispatchEvent(new Event('focus'));
    refreshOwnerNavigation();
    assert.equal(request.mock.callCount(), 4, 'cleanup removes listeners');
});

test('an account change cancels stale requests and unmount prevents late updates', async t => {
    Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
    let stop = () => {};
    t.after(() => { stop(); Reflect.deleteProperty(globalThis, 'window'); });
    const requests: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
    t.mock.method(globalThis, 'fetch', (_url: unknown, options: RequestInit) => new Promise<Response>(resolve => {
        requests.push({ signal: options.signal!, resolve });
    }));
    const seen: OwnerNavigation[] = [];
    stop = watchOwnerNavigation(value => seen.push(value));
    refreshOwnerNavigation();
    assert.equal(requests[0].signal.aborted, true);
    requests[1].resolve(Response.json({ signedIn: false, team: null }));
    requests[0].resolve(Response.json({ signedIn: true, team: null }));
    await settle();
    assert.deepEqual(seen, [{ signedIn: false, team: null }]);
    refreshOwnerNavigation();
    stop();
    assert.equal(requests[2].signal.aborted, true);
    requests[2].resolve(Response.json({ signedIn: true, team: null }));
    await settle();
    assert.equal(seen.length, 1);
});
