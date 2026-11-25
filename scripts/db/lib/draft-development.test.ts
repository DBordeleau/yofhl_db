import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../../db/schema';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryNhl, memoryNhlState, nhlPlayer, nhlSeason } from '../../../lib/nhl/memory-nhl';
import type { Db } from './connect';
import { draftFactsLoader, enrichDraftDevelopment, importFetcher, importNhl } from './draft-development';
import { writeHistory, type HistoryImport } from './history';
import { draftRegretEligible } from '../../../lib/draft/development';
import { disposableLeague } from '../../../lib/testing/disposable-league';

const draftPick = (pick: Partial<HistoryImport['picks'][number]> = {}): HistoryImport['picks'][number] => ({
    seasonYear: 2025, overall: 1, round: 1, pick: 1, playerId: '0abcd', playerName: 'Lane Hutson', positions: 'D', nhlTeam: 'MTL',
    draftedOn: '2024-10-04', sourceTime: 'Oct 4, 2024', sourceFile: 'draft.csv', ...pick,
});

test("a pick's draft facts come from the NHL player it identifies, by Player ID, every position and NHL team", async () => {
    const state = memoryNhlState({
        players: { 8483457: nhlPlayer({ nhlId: 8483457, name: 'Lane Hutson', position: 'D', team: 'MTL', birthDate: '2004-02-14', seasons: { 2024: nhlSeason({ games: 2 }) } }) },
    });
    const facts = await draftFactsLoader(createMemoryNhl(state))(draftPick({ positions: 'D,LW' }));
    // 20 on the draft date, so too young for draft regret: no games counted
    assert.deepEqual(facts, { draftedOn: '2024-10-04', birthDate: '2004-02-14', nhlId: 8483457, priorNhlGames: null });
    assert.deepEqual(state.identified, [{ name: 'Lane Hutson', playerId: '0abcd', positions: ['D', 'LW'], nhlTeam: 'MTL' }]);
});

test("a pick old enough for draft regret counts the NHL games played before its draft date", async () => {
    const state = memoryNhlState({
        players: { 8480000: nhlPlayer({ position: 'D', team: 'MTL', birthDate: '2001-05-26', seasons: { 2024: nhlSeason({ games: 60 }), 2025: nhlSeason({ games: 3 }) } }) },
        gameLogs: { 8480000: { 2025: ['2024-10-01', '2024-10-04', '2024-10-06'] } },
    });
    const facts = await draftFactsLoader(createMemoryNhl(state))(draftPick({ playerName: 'Test Player' }));
    assert.equal(facts.priorNhlGames, 61);
});

test("a pick's stored NHL identity is read without identifying the pick again", async () => {
    const state = memoryNhlState({ players: { 123: nhlPlayer({ nhlId: 123, name: 'Someone Else' }) } });
    const facts = await draftFactsLoader(createMemoryNhl(state))(draftPick(), 123);
    assert.equal(facts.nhlId, 123);
    assert.deepEqual(state.identified, []);
});

test('an unmatched pick, or an NHL player with no birth date, season history or games, has no draft facts', async () => {
    const state = memoryNhlState({
        players: {
            1: nhlPlayer({ nhlId: 1, name: 'No Birthday', position: 'D', team: 'MTL', birthDate: null }),
            2: nhlPlayer({ nhlId: 2, name: 'No History', position: 'D', team: 'MTL', seasons: null }),
            3: nhlPlayer({ nhlId: 3, name: 'No Games', position: 'D', team: 'MTL', birthDate: '2001-05-26', seasons: { 2024: nhlSeason() } }),
        },
    });
    const load = draftFactsLoader(createMemoryNhl(state));
    await assert.rejects(load(draftPick({ playerName: 'Nobody' })), /Ambiguous or unmatched NHL identity/);
    await assert.rejects(load(draftPick({ playerName: 'No Birthday' })), /Incomplete NHL profile/);
    await assert.rejects(load(draftPick({ playerName: 'No History' })), /Incomplete NHL profile/);
    await assert.rejects(load(draftPick({ playerName: 'No Games' })), /Incomplete NHL games history/);
});

test('the import paces its NHL requests, waits out rate limits and keeps answers in its file cache', async t => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'draft-development-'));
    t.after(() => rm(cacheDir, { recursive: true, force: true }));
    const waits: number[] = [];
    const answers = [new Response('slow down', { status: 429, headers: { 'retry-after': '10' } }), new Response('{"playerId":1}')];
    const asked: string[] = [];
    const fetcher = importFetcher({ cacheDir, pause: async ms => { waits.push(ms); }, fetch: async url => { asked.push(String(url)); return answers.shift() ?? new Response('gone', { status: 503 }); } });
    const url = 'https://api-web.nhle.com/v1/player/1/landing';

    assert.equal(await (await fetcher(url)).text(), '{"playerId":1}');
    // a pause before each request, and the 10 seconds the NHL asked for after its rate limit
    assert.deepEqual(waits, [850, 10000, 850]);
    assert.equal(await (await fetcher(url)).text(), '{"playerId":1}', 'answered from the file cache');
    assert.equal(asked.length, 2);
    assert.equal((await readdir(cacheDir)).length, 1);

    // a failure isn't kept, and is the NHL's answer for the module to report
    assert.equal((await fetcher('https://api-web.nhle.com/v1/player/2/landing')).status, 503);
    assert.equal((await readdir(cacheDir)).length, 1);
});

/** an NHL profile for the import's fake upstream */
const landing = (playerId: number) => JSON.stringify({ playerId, firstName: { default: 'Test' }, lastName: { default: 'Player' }, birthDate: '2001-05-26', seasonTotals: [] });

for (const [rejected, answer] of [['malformed', '<html>temporary upstream failure</html>'], ['wrong-player', landing(999)]] as const) {
    test(`a ${rejected} NHL answer the module rejects isn't kept, so a later import gets the NHL's next answer`, async t => {
        const cacheDir = await mkdtemp(join(tmpdir(), 'draft-development-'));
        t.after(() => rm(cacheDir, { recursive: true, force: true }));
        const answers = [answer, landing(123)];
        const asked: string[] = [];
        const nhl = importNhl({ cacheDir, pause: async () => {}, fetch: async url => { asked.push(String(url)); return new Response(answers.shift() ?? landing(123)); } });

        await assert.rejects(nhl.player(123));
        assert.equal((await nhl.player(123)).nhlId, 123);
        assert.equal(asked.length, 2, 'the second attempt asked the NHL again');
        // the good answer is kept: another import reads it from the file cache
        const later = importNhl({ cacheDir, pause: async () => {}, fetch: async () => { throw new Error('offline'); } });
        assert.equal((await later.player(123)).nhlId, 123);
    });

    test(`a ${rejected} NHL answer already in the file cache is dropped once rejected`, async t => {
        const cacheDir = await mkdtemp(join(tmpdir(), 'draft-development-'));
        t.after(() => rm(cacheDir, { recursive: true, force: true }));
        // an earlier import kept the answer before it was checked
        const url = 'https://api-web.nhle.com/v1/player/123/landing';
        await importFetcher({ cacheDir, pause: async () => {}, fetch: async () => new Response(answer) })(url);
        const asked: string[] = [];
        const nhl = importNhl({ cacheDir, pause: async () => {}, fetch: async url => { asked.push(String(url)); return new Response(landing(123)); } });

        await assert.rejects(nhl.player(123));
        assert.deepEqual(asked, [], 'the first attempt read the kept answer');
        assert.equal((await nhl.player(123)).nhlId, 123);
        assert.deepEqual(asked, [url]);
    });
}

test('migration backfills existing picks by season, identity and draft date', async t => {
    const league = await disposableLeague(t, { migrateThrough: '0008', seed: `
        INSERT INTO league.seasons (year, label, playoff_status) VALUES (2025, '2024–25', 'complete'), (2026, '2025–26', 'complete');
        INSERT INTO league.players (id, name) VALUES ('*04yu6*', 'Jamie Drysdale'), ('unknown', 'Unknown');
        INSERT INTO league.draft_picks (season_year, overall, round, pick, player_id, player_name, positions, drafted_on, source_time, source_file) VALUES
            (2025, 59, 5, 11, '*04yu6*', 'Jamie Drysdale', 'D', '2024-09-21', 'draft', 'draft.csv'),
            (2026, 70, 6, 10, '*04yu6*', 'Jamie Drysdale', 'D', '2025-10-04', 'draft', 'draft.csv'),
            (2025, 60, 5, 12, '*04yu6*', 'Jamie Drysdale', 'D', '2024-09-22', 'draft', 'draft.csv'),
            (2025, 61, 5, 13, 'unknown', 'Unknown', 'D', '2024-09-21', 'draft', 'draft.csv');
    ` });
    await league.migrateRest('0009');
    const { rows: [later] } = await league.client.query<{ name: string | null }>("select to_regclass('league.coachs_corner_episodes') as name");
    assert.equal(later.name, null, 'only the backfilling migration runs after the seed');
    const db = drizzle(league.client, { schema });
    const picks = await db.select().from(schema.draftPicks);
    const young = picks.find(p => p.overall === 59)!;
    const next = picks.find(p => p.overall === 70)!;
    assert.equal(young.developmentFacts?.birthDate, '2002-04-08');
    assert.equal(draftRegretEligible({ ...young, year: 2025 }, young.developmentFacts), false);
    assert.equal(next.developmentFacts?.priorNhlGames, 217);
    assert.equal(draftRegretEligible({ ...next, year: 2026 }, next.developmentFacts), true);
    assert.ok(picks.filter(p => p.overall === 60 || p.overall === 61).every(p => p.developmentFacts === null));
    await enrichDraftDevelopment(db as unknown as Db, [young, next], async () => { throw new Error('Backfilled picks must reimport offline'); });
});

test('imports persist facts, reuse them offline, enrich new seasons, and stop safely on failed lookups', async t => {
    const db = drizzle((await disposableLeague(t)).client, { schema });
    const connection = db as unknown as Db;
    await db.insert(schema.seasons).values([{ year: 2025, label: '2024–25', playoffStatus: 'complete' }, { year: 2026, label: '2025–26', playoffStatus: 'complete' }]);
    const pick = { seasonYear: 2025, overall: 1, round: 1, pick: 1, playerId: 'p', playerName: 'Player', positions: 'D', nhlTeam: 'UTA', draftedOn: '2024-09-21', sourceTime: 'Sep 21, 2024', sourceFile: 'draft.csv' };
    const data: HistoryImport = { players: [{ id: 'p', name: 'Player' }], events: [], assets: [], picks: [pick], transactionFiles: [], draftYears: [2025], skippedLineups: 0 };
    let calls = 0;
    await enrichDraftDevelopment(connection, data.picks, async p => {
        calls++;
        return { nhlId: 123, birthDate: '2001-05-26', draftedOn: p.draftedOn, priorNhlGames: 39 };
    });
    await writeHistory(connection, data);
    assert.equal(calls, 1);
    assert.equal((await db.select().from(schema.draftPicks))[0].developmentFacts?.priorNhlGames, 39);

    const reimport = { ...data, picks: [{ ...pick, developmentFacts: undefined }] };
    await enrichDraftDevelopment(connection, reimport.picks, async () => { throw new Error('Must reuse persisted facts without a network call'); });
    await writeHistory(connection, reimport);
    assert.equal((await db.select().from(schema.draftPicks))[0].developmentFacts?.nhlId, 123);

    const next = { ...pick, seasonYear: 2026, draftedOn: '2025-10-04' };
    const newPicks: HistoryImport['picks'] = [{ ...next, developmentFacts: undefined }];
    await enrichDraftDevelopment(connection, newPicks, async (p, nhlId) => {
        assert.equal(nhlId, 123, 'Reuse the established identity across seasons');
        return { nhlId: 123, birthDate: '2001-05-26', draftedOn: p.draftedOn, priorNhlGames: 90 };
    });
    assert.equal(newPicks[0].developmentFacts?.priorNhlGames, 90);

    const veteran: HistoryImport['picks'] = [{ ...pick, seasonYear: 2028, draftedOn: '2027-10-01' }];
    await enrichDraftDevelopment(connection, veteran, async () => { throw new Error('Age alone now decides eligibility'); });
    assert.equal(veteran[0].developmentFacts?.birthDate, '2001-05-26');
    assert.equal(veteran[0].developmentFacts?.draftedOn, '2027-10-01');

    const failed: HistoryImport['picks'] = [{ ...next, developmentFacts: undefined }, { ...next, overall: 2, playerId: 'new', developmentFacts: undefined }];
    await assert.rejects(enrichDraftDevelopment(connection, failed, async (p) => {
        if (p.playerId === 'new') throw new Error('NHL unavailable');
        return { nhlId: 123, birthDate: '2001-05-26', draftedOn: p.draftedOn, priorNhlGames: 90 };
    }), /NHL unavailable/);
    assert.ok(failed.every(p => p.developmentFacts === undefined), 'Do not leave a partially enriched import');
    assert.equal((await db.select().from(schema.draftPicks))[0].developmentFacts?.priorNhlGames, 39, 'Existing DB data stays intact');
});
