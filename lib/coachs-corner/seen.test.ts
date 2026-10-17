import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { episodeSeenKey, hasSeenEpisode, markEpisodeSeen, subscribeToSeenEpisodes } from './seen';

function browser(t: TestContext, storage: Pick<Storage, 'getItem' | 'setItem'>) {
    const events = new EventTarget();
    Object.defineProperty(events, 'localStorage', { value: storage });
    Object.defineProperty(globalThis, 'window', { value: events, configurable: true });
    t.after(() => { Reflect.deleteProperty(globalThis, 'window'); });
    return events;
}

test('viewing persists per publication, without older episodes resetting the latest', t => {
    const stored = new Map<string, string>();
    browser(t, { getItem: key => stored.get(key) ?? null, setItem: (key, value) => { stored.set(key, value); } });
    const latest = episodeSeenKey({ slug: 'week-2', publishedAt: '2026-10-17T12:00:00Z' });
    const older = episodeSeenKey({ slug: 'week-1', publishedAt: null });
    const upcoming = episodeSeenKey({ slug: 'week-3', publishedAt: '2026-10-24T12:00:00Z' });
    const republished = episodeSeenKey({ slug: 'week-2', publishedAt: '2026-10-18T12:00:00Z' });

    assert.equal(hasSeenEpisode(latest), false);
    markEpisodeSeen(older);
    assert.equal(hasSeenEpisode(latest), false, 'an archive watch does not dismiss the latest badge');
    markEpisodeSeen(latest);
    assert.equal(hasSeenEpisode(latest), true);
    assert.equal(stored.size, 2, 'viewing is persisted to storage');
    markEpisodeSeen(older);
    assert.equal(hasSeenEpisode(latest), true);
    assert.equal(hasSeenEpisode(upcoming), false, 'a new episode starts unseen');
    assert.equal(hasSeenEpisode(republished), false, 'republishing creates a new viewing marker');
    stored.clear();
    assert.equal(hasSeenEpisode(latest), false, 'clearing browser data resets viewing');
});

test('badges update in the current tab and other tabs, and unsubscribe cleanly', t => {
    const stored = new Map<string, string>();
    let stop = () => {};
    t.after(() => stop());
    const events = browser(t, { getItem: key => stored.get(key) ?? null, setItem: (key, value) => { stored.set(key, value); } });
    let updates = 0;
    stop = subscribeToSeenEpisodes(() => { updates++; });
    markEpisodeSeen('sync-episode');
    assert.equal(updates, 1);
    markEpisodeSeen('sync-episode');
    assert.equal(updates, 1, 'resuming an episode does not write or notify again');

    const storageEvent = (key: string | null) => {
        const event = new Event('storage');
        Object.defineProperty(event, 'key', { value: key });
        events.dispatchEvent(event);
    };
    storageEvent('unrelated-preference');
    assert.equal(updates, 1);
    storageEvent([...stored.keys()][0]);
    assert.equal(updates, 2);
    stored.clear();
    storageEvent(null);
    assert.equal(updates, 3);
    assert.equal(hasSeenEpisode('sync-episode'), false);
    stop();
    markEpisodeSeen('after-unsubscribe');
    storageEvent(null);
    assert.equal(updates, 3);
});

test('blocked storage and quota failures still dismiss the badge for this visit', t => {
    const storage = { getItem: (): string | null => null, setItem: () => { throw new Error('Quota exceeded'); } };
    browser(t, storage);
    markEpisodeSeen('quota-episode');
    assert.equal(hasSeenEpisode('quota-episode'), true);
    storage.getItem = () => { throw new Error('Storage blocked'); };
    assert.equal(hasSeenEpisode('blocked-episode'), false);
    markEpisodeSeen('blocked-episode');
    assert.equal(hasSeenEpisode('blocked-episode'), true);
    assert.equal(hasSeenEpisode('another-episode'), false);
});

test('server rendering does not access browser storage or record a view', () => {
    assert.equal(hasSeenEpisode('server-episode'), false);
    assert.doesNotThrow(() => markEpisodeSeen('server-episode'));
});
