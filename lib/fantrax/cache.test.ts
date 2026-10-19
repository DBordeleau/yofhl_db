import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import test from 'node:test';
import { DAY, FANTRAX_CURRENT_TAG, FANTRAX_TAG, scoresAreArchived } from './cache-policy';

test('matchups refresh after the correction window, then reuse final scores until invalidated', async t => {
    const globals = ['AsyncLocalStorage', '__incrementalCache'] as const;
    const descriptors = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    const originalUrl = process.env.DATABASE_URL_V2;
    process.env.DATABASE_URL_V2 = 'postgresql://test:test@localhost/test';
    t.after(() => { if (originalUrl === undefined) delete process.env.DATABASE_URL_V2; else process.env.DATABASE_URL_V2 = originalUrl; });
    t.after(() => globals.forEach((key, i) => {
        if (descriptors[i]) Object.defineProperty(globalThis, key, descriptors[i]!); else Reflect.deleteProperty(globalThis, key);
    }));
    Object.defineProperty(globalThis, 'AsyncLocalStorage', { value: AsyncLocalStorage, configurable: true });
    const entries = new Map<string, { value: unknown; tags: string[]; revalidate: number | false }>();
    const reads: { key: string; revalidate: number | false }[] = [];
    Object.defineProperty(globalThis, '__incrementalCache', { configurable: true, value: {
        generateSimpleCacheKey: async (key: string) => key,
        get: async (key: string, options: { revalidate: number | false }) => { reads.push({ key, revalidate: options.revalidate }); return entries.get(key) ?? null; },
        set: async (key: string, value: { revalidate: number | false }, options: { tags: string[] }) => {
            entries.set(key, { value, tags: options.tags, revalidate: value.revalidate });
        },
    } });
    const end = '2026-10-09T00:00:00.000Z';
    let now = Date.parse(end) + DAY * 1000;
    t.mock.method(Date, 'now', () => now);
    let scoreCalls = 0;
    let directoryCalls = 0;
    let invalidScores = false;
    t.mock.method(globalThis, 'fetch', async (input: URL | string) => {
        const url = new URL(input);
        switch (url.pathname.split('/').pop()) {
            case 'getLeagueInfo': return Response.json({ seasonYear: 2026, teamInfo: {}, rosterPeriods: [], matchups: [], playoffs: { numPlayoffTeams: 8, lastRegularSeasonPeriod: 23 }, scoringPeriods: [
                { number: 1, startDate: '2026-10-01T00:00:00Z', endDate: end },
                { number: 2, startDate: '2027-01-01T00:00:00Z', endDate: '2027-01-08T00:00:00Z' },
            ] });
            case 'getTeamRosters': return Response.json({ rosters: {} });
            case 'getStandings': return Response.json([]);
            case 'getPlayerIds': directoryCalls++; return Response.json({ p1: { name: 'Player', position: 'C' } });
            case 'getMatchupScores': {
                scoreCalls++;
                if (invalidScores) return Response.json({ period: 1, matchups: [] });
                return Response.json({ period: Number(url.searchParams.get('period')), matchups: [
                    { away: { teamId: 'a', score: scoreCalls, gamesPlayed: 1 }, home: { teamId: 'b', score: 1, gamesPlayed: 1 } },
                ] });
            }
            default: throw new Error(`Unexpected network request: ${url.pathname}`);
        }
    });
    const { getMatchupScores, getLeagueSnapshot } = await import('./data');
    const { getDb } = await import('../data/db');
    t.mock.method(getDb(), 'execute', async () => ({ rows: [] }));
    assert.equal(scoresAreArchived(end, now), false);
    await getMatchupScores(1);
    await getMatchupScores(1);
    assert.equal(scoreCalls, 1);
    assert.equal(await getMatchupScores(2), null, 'future periods never request scores');
    await assert.rejects(getMatchupScores(999), /Unknown scoring period/);
    assert.equal(scoreCalls, 1);
    now = Date.parse(end) + 7 * DAY * 1000;
    assert.equal(scoresAreArchived(end, now - 1), false);
    assert.equal(scoresAreArchived(end, now), true);
    assert.equal((await getMatchupScores(1))?.matchups[0].away.score, 2, 'archive fetches again after corrections');
    now += 90 * DAY * 1000;
    await getMatchupScores(1);
    assert.equal(scoreCalls, 2);
    assert.ok(reads.some(read => read.key.includes('fantrax-final-scores') && read.revalidate === false));
    for (const [key, entry] of entries) if (entry.tags.includes(FANTRAX_TAG)) entries.delete(key);
    assert.equal((await getMatchupScores(1))?.matchups[0].away.score, 3, 'manual invalidation picks up a late correction');
    entries.clear();
    invalidScores = true;
    await assert.rejects(getMatchupScores(1), /invalid matchup scores/);
    invalidScores = false;
    assert.equal((await getMatchupScores(1))?.matchups[0].away.score, 5, 'failed final-score loads are retried');

    await getLeagueSnapshot();
    await getLeagueSnapshot();
    assert.equal(directoryCalls, 1);
    const directory = [...entries].find(([key]) => key.includes('fantrax-player-directory'));
    const archive = [...entries].find(([key]) => key.includes('fantrax-final-scores'));
    assert.ok(directory && archive);
    assert.equal(directory[1].tags.includes(FANTRAX_CURRENT_TAG), false);
    assert.equal(archive[1].tags.includes(FANTRAX_CURRENT_TAG), false);
    for (const [key, entry] of entries) if (entry.tags.includes(FANTRAX_CURRENT_TAG)) entries.delete(key);
    await getLeagueSnapshot();
    assert.equal(directoryCalls, 1, 'evening refreshes preserve the weekly player directory');
    assert.ok(entries.has(archive[0]), 'evening refreshes preserve archived final scores');
    // Expire daily entries, as on a later visit, leaving the independent weekly directory.
    for (const [key, entry] of entries) if (entry.revalidate === DAY) entries.delete(key);
    await getLeagueSnapshot();
    assert.equal(directoryCalls, 1, 'refreshing daily data reuses the player directory');
    for (const [key, entry] of entries) if (entry.revalidate === 7 * DAY) entries.delete(key);
    await getLeagueSnapshot();
    assert.equal(directoryCalls, 2, 'the directory refreshes on its own weekly deadline');
});
