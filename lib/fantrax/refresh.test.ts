import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { FANTRAX_CURRENT_TAG } from './cache-policy';
import type { CurrentSeasonData } from './data';

test('refresh publishes a coherent snapshot, preserves unrelated caches and retains good data after failures', async t => {
    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
    const originalUrl = process.env.DATABASE_URL_V2;
    const globals = ['AsyncLocalStorage', '__incrementalCache'] as const;
    const descriptors = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    t.after(async () => {
        t.mock.restoreAll(); await client.close();
        if (originalUrl === undefined) delete process.env.DATABASE_URL_V2; else process.env.DATABASE_URL_V2 = originalUrl;
        globals.forEach((key, index) => { if (descriptors[index]) Object.defineProperty(globalThis, key, descriptors[index]!); else Reflect.deleteProperty(globalThis, key); });
    });
    process.env.DATABASE_URL_V2 = 'postgresql://test:test@localhost/test';
    Object.defineProperty(globalThis, 'AsyncLocalStorage', { value: AsyncLocalStorage, configurable: true });
    const entries = new Map<string, { value: unknown; tags: string[] }>();
    const incrementalCache = {
        generateSimpleCacheKey: async (key: string) => key,
        get: async (key: string) => entries.get(key) ?? null,
        set: async (key: string, value: unknown, options: { tags: string[] }) => { entries.set(key, { value, tags: options.tags }); },
    };
    Object.defineProperty(globalThis, '__incrementalCache', { value: incrementalCache, configurable: true });
    const runtime = await import('../data/db');
    let failSave = false;
    t.mock.method(runtime.getDb(), 'execute', (query: SQL) => {
        if (failSave && new PgDialect().sqlToQuery(query).sql.startsWith('insert into league.fantrax_snapshots')) throw Error('save failed');
        return db.execute(query);
    });
    const now = Date.parse('2026-10-18T22:00:00Z');
    t.mock.method(Date, 'now', () => now);
    let settled = false, failStats = false, incompleteScores = false, network = 0;
    t.mock.method(globalThis, 'fetch', async (input: string | URL, options?: RequestInit) => {
        network++;
        const url = new URL(input);
        switch (url.pathname.split('/').pop()) {
            case 'getLeagueInfo': return Response.json({ seasonYear: 2026, teamInfo: { a: { name: 'A' }, b: { name: 'B' } }, rosterPeriods: [],
                playoffs: { numPlayoffTeams: 2, lastRegularSeasonPeriod: 1 },
                scoringPeriods: [{ number: 1, startDate: '2026-10-12T13:00:00-0400', endDate: '2026-10-19T18:59:59-0400' }],
                matchups: [{ period: 1, matchupList: [{ away: { id: 'a' }, home: { id: 'b' } }] }] });
            case 'getTeamRosters': return Response.json({ period: 1, rosters: {} });
            case 'getStandings': return Response.json([{ teamId: 'a', rank: 1, points: settled ? '1-0-0' : '0-0-0' }, { teamId: 'b', rank: 2, points: settled ? '0-1-0' : '0-0-0' }]);
            case 'getPlayerIds': return Response.json({ p: { name: 'Player', position: 'C' } });
            case 'getMatchupScores': return Response.json({ period: 1, matchups: [{ away: { teamId: incompleteScores ? 'unknown' : 'a', score: settled ? 20 : 10, gamesPlayed: 1 }, home: { teamId: 'b', score: 5, gamesPlayed: 1 } }] });
            case 'req': {
                if (failStats) return new Response('', { status: 503 });
                const request = JSON.parse(String(options?.body)).msgs[0].data;
                const season = { code: 'SEASON_current_YEAR_TO_DATE', name: '2026-27 Reg Season - YTD', timeframeTypeCode: 'YEAR_TO_DATE' };
                return Response.json({ responses: [{ data: { displayedStatusOrTeam: request.statusOrTeamFilter, displayedPosOrGroup: 'ALL', displayedSortType: 'SCORE',
                    displayedSortReversed: false, displayedView: 'STATS', displayedScoringCategoryType: '5', displayedSeasonOrProjection: season, seasonOrProjections: [season],
                    paginatedResultSet: { pageNumber: 1, totalNumResults: 1 }, tableHeader: { cells: [{ key: 'status' }, { key: 'fptsPerGame' }, { key: 'fpts' }] },
                    statsTable: [{ scorer: { scorerId: 'p', name: 'Player', posShortNames: 'C' }, cells: [{ content: 'A', teamId: 'a' }, { content: '10' }, { content: '20' }] }] } }] });
            }
            default: throw Error(`Unexpected request ${url.pathname}`);
        }
    });
    const { getLeagueSnapshot, getMatchupScores, getScoringLeaders, getRosterStats } = await import('./data');
    const { refreshCurrentSeason } = await import('./refresh');
    const { saveSnapshotQuery } = await import('./snapshot-store');
    const { workAsyncStorage } = await import('next/dist/server/app-render/work-async-storage.external');
    const invoke = async () => {
        const store = { incrementalCache, route: '/api/cron/fantrax', pendingRevalidatedTags: [] as string[], pendingRevalidates: {} as Record<string, Promise<unknown>> };
        const result = await workAsyncStorage.run(store as never, refreshCurrentSeason);
        await Promise.all(Object.values(store.pendingRevalidates));
        assert.deepEqual(store.pendingRevalidatedTags, [FANTRAX_CURRENT_TAG]);
        for (const [key, entry] of entries) if (entry.tags.includes(FANTRAX_CURRENT_TAG)) entries.delete(key);
        return result;
    };
    assert.deepEqual((await getLeagueSnapshot()).finalPeriods, []);
    assert.equal((await getMatchupScores(1))?.matchups[0].away.score, 10);
    entries.set('archive-sentinel', { value: {}, tags: ['league'] });
    settled = true;
    await invoke();
    const afterRefresh = network;
    const snapshot = await getLeagueSnapshot();
    assert.deepEqual(snapshot.finalPeriods, [1]);
    assert.equal((await getMatchupScores(1))?.matchups[0].away.score, 20, 'new standings cannot expose older scores');
    assert.equal((await getScoringLeaders(2026)).players[0].points, 20);
    assert.equal((await getRosterStats(2026)).players.p.points, 20);
    assert.equal(network, afterRefresh, 'the published snapshot serves without repeated Fantrax requests');
    assert.ok(entries.has('archive-sentinel'));
    const saved = (await client.query<{ data: CurrentSeasonData }>('select data from league.fantrax_snapshots')).rows[0].data;
    failStats = true;
    await assert.rejects(invoke(), /503/);
    assert.deepEqual((await client.query<{ data: CurrentSeasonData }>('select data from league.fantrax_snapshots')).rows[0].data, saved);
    failStats = false; incompleteScores = true;
    await assert.rejects(invoke(), /incomplete scheduled matchup scores/);
    assert.deepEqual((await client.query<{ data: CurrentSeasonData }>('select data from league.fantrax_snapshots')).rows[0].data, saved);
    incompleteScores = false; failSave = true;
    await assert.rejects(invoke(), /save failed/);
    assert.deepEqual((await client.query<{ data: CurrentSeasonData }>('select data from league.fantrax_snapshots')).rows[0].data, saved);
    failSave = false;
    const older = structuredClone(saved);
    older.source.fetchedAt = '2026-01-01T00:00:00Z';
    await db.execute(saveSnapshotQuery(older));
    assert.deepEqual((await client.query<{ data: CurrentSeasonData }>('select data from league.fantrax_snapshots')).rows[0].data, saved, 'an overlapping older refresh cannot overwrite a newer snapshot');
});
