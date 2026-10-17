import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { SQL } from 'drizzle-orm';

const screenplay = (title: string, player = false) => `---\ntitle: ${title}\nseason: 2027\nweek: 2\n---\n${player ? '>> player "Player One"\n' : ''}DON: Welcome to the show.\n\nRON: Good evening.`;

test('publishing and real Next data caching against disposable Postgres', async t => {
    const client = new PGlite();
    const db = drizzle(client);
    const originalUrl = process.env.DATABASE_URL_V2;
    const originalMode = process.env.NODE_ENV;
    const globals = ['AsyncLocalStorage', '__incrementalCache'] as const;
    const descriptors = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    t.after(async () => {
        t.mock.restoreAll();
        await client.close();
        if (originalUrl === undefined) delete process.env.DATABASE_URL_V2; else process.env.DATABASE_URL_V2 = originalUrl;
        if (originalMode === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: originalMode });
        globals.forEach((key, i) => { if (descriptors[i]) Object.defineProperty(globalThis, key, descriptors[i]!); else Reflect.deleteProperty(globalThis, key); });
    });
    process.env.DATABASE_URL_V2 = 'postgresql://test:test@localhost/test';
    Object.assign(process.env, { NODE_ENV: 'test' });
    Object.defineProperty(globalThis, 'AsyncLocalStorage', { value: AsyncLocalStorage, configurable: true });
    const entries = new Map<string, { value: unknown; tags: string[] }>();
    Object.defineProperty(globalThis, '__incrementalCache', { configurable: true, value: {
        generateSimpleCacheKey: async (key: string) => key,
        get: async (key: string) => entries.get(key) ?? null,
        set: async (key: string, value: unknown, options: { tags: string[] }) => { entries.set(key, { value, tags: options.tags }); },
    } });
    const runtime = await import('./db');
    let queries = 0;
    let failNext = false;
    t.mock.method(runtime.getDb(), 'execute', (query: SQL) => {
        queries++;
        if (failNext) { failNext = false; throw new Error('simulated database outage'); }
        return db.execute(query);
    });
    let network = 0;
    const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
        network++;
        if (String(url).includes('search.d3.nhle.com')) return Response.json([{ playerId: '123', name: 'Player One', teamAbbrev: 'TOR' }]);
        if (String(url).includes('/123/landing')) return Response.json({ headshot: 'https://assets.nhle.com/test-player.png' });
        throw new Error(`Unexpected network request: ${url}`);
    });
    await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
    await client.exec(`insert into league.seasons values (2026, '2025-26', 'complete');
        insert into league.players values ('p1', 'Player One');
        insert into league.player_seasons (player_id, season_year, positions, nhl_team, fpts, fpg)
        values ('p1', 2026, array['C'], 'TOR', 100, 2);`);
    const data = await import('./coachs-corner');
    const { saveEpisodeRecord, deleteEpisodeRecord, unpublishEpisodeRecord, publicationEffects } = await import('../coachs-corner/publishing');
    const apply = (change: Awaited<ReturnType<typeof saveEpisodeRecord>> | undefined) => {
        assert.ok(change && !('error' in change), JSON.stringify(change));
        const effects = publicationEffects(change);
        for (const [key, entry] of entries) if (entry.tags.some(tag => effects.tags.includes(tag))) entries.delete(key);
        return { ...change, effects };
    };
    const record = () => client.query<{ script: string; players: unknown; slug: string }>('select script, players, slug from league.coachs_corner_episodes where id=$1', [id]);
    let id = 0;

    await t.test('outages and missing migrations reject without poisoning empty or not-found caches', async () => {
        for (const read of [data.getPublishedEpisodes, () => data.getPublishedEpisode('week-two')]) {
            entries.clear();
            failNext = true;
            await assert.rejects(read, /simulated database outage/);
            assert.equal(entries.size, 0);
            await read();
            assert.equal(entries.size, 1);
        }
        entries.clear();
        await client.exec('alter table league.coachs_corner_episodes rename to episodes_temporarily_missing');
        await assert.rejects(data.getPublishedEpisodes);
        assert.equal(entries.size, 0);
        await client.exec('alter table league.episodes_temporarily_missing rename to coachs_corner_episodes');
        assert.equal((await data.getPublishedEpisodes()).length, 1, 'successful empty archive falls back to pilot');
    });
    await t.test('invalid publication and reserved URLs never write; invalid drafts can be saved', async () => {
        const before = queries;
        assert.ok('error' in await saveEpisodeRecord({ id: null, slug: 'bad', script: 'unfinished', publish: true }));
        assert.ok('error' in await saveEpisodeRecord({ id: null, slug: 'local', script: screenplay('Reserved') }));
        assert.equal(queries, before);
        const draft = apply(await saveEpisodeRecord({ id: null, slug: 'week-two', script: 'unfinished' }));
        id = draft.id;
        assert.deepEqual(draft.effects.tags, []);
        assert.ok(draft.effects.paths.every(path => path.startsWith('/admin/')));
        assert.equal(await data.getPublishedEpisode('week-two'), null);
    });
    await t.test('draft save/delete keeps public caches warm and makes no NHL requests', async () => {
        await data.getPublishedEpisodes();
        await data.getPublishedEpisode(data.pilotEpisode().slug);
        apply(await saveEpisodeRecord({ id, slug: 'week-two', script: screenplay('Draft', true) }));
        const extra = apply(await saveEpisodeRecord({ id: null, slug: 'other-draft', script: '' }));
        const deleted = apply(await deleteEpisodeRecord(extra.id));
        assert.deepEqual(deleted.effects.tags, []);
        const before = queries;
        await data.getPublishedEpisodes();
        await data.getPublishedEpisode('week-two');
        await data.getPublishedEpisode(data.pilotEpisode().slug);
        assert.equal(queries, before);
        assert.equal(network, 0);
    });
    await t.test('publishing clears cached 404/archive and freezes statistics and headshot URLs', async () => {
        const published = apply(await saveEpisodeRecord({ id, slug: 'week-two', script: screenplay('Published', true), publish: true }));
        assert.ok(published.effects.tags.includes(data.episodeTag('week-two')));
        assert.equal((await data.getPublishedEpisodes())[0].title, 'Published');
        const episode = await data.getPublishedEpisode('week-two');
        assert.ok(episode);
        assert.equal(episode.players?.[0].fpts, 100);
        assert.equal(episode.players?.[0].headshot, 'https://assets.nhle.com/test-player.png');
        assert.equal(network, 2);
        await client.exec('update league.player_seasons set fpts=200');
        const before = queries;
        fetchMock.mock.mockImplementation(async () => { throw new Error('Public pages must not fetch NHL data'); });
        for (let i = 0; i < 10; i++) {
            const cached = await data.getPublishedEpisode('week-two');
            assert.equal((await data.getEpisodePlayers(cached!))[0].fpts, 100);
            await data.getPublishedEpisodes();
        }
        assert.equal(queries, before, 'ten views cause zero database queries');
    });
    await t.test('stale draft saves and invalid updates cannot alter published content', async () => {
        const before = (await record()).rows[0];
        for (const publish of [false, true]) {
            const result = await saveEpisodeRecord({ id, slug: 'hijacked', script: 'invalid', publish });
            assert.ok('error' in result);
            assert.deepEqual((await record()).rows[0], before);
        }
        failNext = true;
        await assert.rejects(() => saveEpisodeRecord({ id, slug: 'week-two', script: screenplay('Failed refresh', true), publish: true }));
        assert.deepEqual((await record()).rows[0], before, 'failed snapshot leaves the live episode untouched');
    });
    await t.test('published update refreshes snapshot and both sides of a renamed URL', async () => {
        await data.getPublishedEpisode('renamed'); // cache 404
        const changed = apply(await saveEpisodeRecord({ id, slug: 'renamed', script: screenplay('Updated', true), publish: true }));
        assert.equal(changed.oldSlug, 'week-two');
        assert.ok(changed.effects.paths.includes('/coachs-corner/week-two'));
        assert.ok(changed.effects.paths.includes('/coachs-corner/renamed'));
        assert.equal(await data.getPublishedEpisode('week-two'), null);
        assert.equal((await data.getPublishedEpisode('renamed'))?.players?.[0].fpts, 200);
        assert.equal((await data.getPublishedEpisodes())[0].title, 'Updated');
        const before = queries;
        await data.getPublishedEpisode(data.pilotEpisode().slug);
        assert.equal(queries, before, 'unrelated episode data remains cached');
        assert.ok('error' in await saveEpisodeRecord({ id: null, slug: 'renamed', script: screenplay('Duplicate') }));
    });
    await t.test('unpublish, draft editing, republish and deletion all clear the appropriate public data', async () => {
        apply(await unpublishEpisodeRecord(id));
        assert.equal(await data.getPublishedEpisode('renamed'), null);
        assert.equal((await data.getPublishedEpisodes()).length, 1);
        assert.equal(await unpublishEpisodeRecord(id), undefined);
        const draft = apply(await saveEpisodeRecord({ id, slug: 'renamed', script: 'unfinished again' }));
        assert.deepEqual(draft.effects.tags, []);
        apply(await saveEpisodeRecord({ id, slug: 'renamed', script: screenplay('Republished'), publish: true }));
        assert.equal((await data.getPublishedEpisode('renamed'))?.title, 'Republished');
        apply(await deleteEpisodeRecord(id));
        assert.equal(await data.getPublishedEpisode('renamed'), null);
        assert.equal((await data.getPublishedEpisodes()).length, 1);
        assert.equal(await deleteEpisodeRecord(id), undefined);
    });
    await t.test('the bundled pilot keeps its 2025-26 player snapshot without live stats or NHL lookups', async () => {
        const before = queries;
        const players = await data.getEpisodePlayers(data.pilotEpisode());
        assert.deepEqual(players.map(p => [p.name, p.season, p.fpts]), [
            ['Tom Wilson', 2026, 372], ['William Nylander', 2026, 378.25], ['Nico Hischier', 2026, 382.25],
        ]);
        assert.equal(queries, before, 'the episode must not drift to the latest database season');
        assert.equal(network, 2, 'the archived portraits need no NHL lookup');
    });
    await t.test('legacy player fallback caches one stats query without NHL lookups', async () => {
        entries.clear();
        const episode = { ...data.pilotEpisode(), script: screenplay('Legacy', true), players: null };
        const before = queries;
        assert.equal((await data.getEpisodePlayers(episode))[0].fpts, 200);
        await data.getEpisodePlayers(episode);
        assert.equal(queries, before + 1);
        assert.equal(network, 2);
    });
});
