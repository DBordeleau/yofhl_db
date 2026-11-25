import assert from 'node:assert/strict';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
import { disposableLeague } from '@/lib/testing/disposable-league';
import type { Db } from './connect';
import type { DraftFactsLoader } from './draft-development';
import { readGamesPlayedHistory, type GamesPlayedHistory } from './games-played';
import { loadLeagueConfig } from './league-config';
import { importSeasons, readLegacySeeds, type SeasonImportInput } from './season-import';

// Games played (GLOSSARY.md) through the season import of the invented league in season-import-fixture/, whose
// games-played.json covers 2025–26: Aaron Ashby (0fx01) scored 300 in 80 games played, Dan Dorsey (0fx04) 400 in
// 49, and Leo Lark (0fx0c), on the championship roster, and Max Moss (0fx0d), both with no points and no roster
// spot, played none. Here Max Moss played 6.

const FIXTURE = path.join('scripts', 'db', 'lib', 'season-import-fixture');
const draftFacts: DraftFactsLoader = async (pick) => ({ nhlId: 9000 + pick.overall, birthDate: '2004-06-01', draftedOn: pick.draftedOn, priorNhlGames: null });
const fixtureHistory = (): GamesPlayedHistory => {
    const history = readGamesPlayedHistory(path.join(FIXTURE, 'games-played.json'));
    return { ...history, coverage: [{ ...history.coverage[0], players: history.coverage[0].players + 1 }], players: [...history.players, { id: '0fx0d', year: 2026, gamesPlayed: 6 }] };
};
/** a history file that doesn't cover 2025–26, as the frozen file doesn't cover the season being played */
const uncovered = (): GamesPlayedHistory => ({ ...fixtureHistory(), coverage: [], players: [] });

async function fixtureLeague(t: TestContext) {
    const league = await disposableLeague(t);
    const db = drizzle(league.client, { schema });
    const run = (input: Partial<Omit<SeasonImportInput, 'db'>> = {}) => importSeasons({
        db: db as unknown as Db,
        config: loadLeagueConfig(path.join(FIXTURE, 'league.yml')),
        dataDir: path.join(FIXTURE, 'data'),
        seasons: [],
        legacy: readLegacySeeds(path.join(FIXTURE, 'legacy-awards.json'), path.join(FIXTURE, 'legacy-championship-rosters.json')),
        gamesPlayed: fixtureHistory(),
        loadDraftFacts: draftFacts,
        ...input,
    });
    /** each career row as [player ID, career FPts, career FP/G, seasons, all-time rank], by rank */
    const careers = async () => (await db.select().from(schema.playerCareers))
        .sort((a, b) => a.allTimeRank - b.allTimeRank || a.playerId.localeCompare(b.playerId))
        .map((c) => [c.playerId, c.totalFpts, c.fpg, c.seasons, c.allTimeRank]);
    const career = async (id: string) => (await careers()).find((row) => row[0] === id) ?? null;
    const query = async <T>(sql: string) => (await league.client.query<T>(sql)).rows;
    return { client: league.client, run, careers, career, query };
}

test("an import writes each player season's games played from the history file, and careers are FPts over games played", async (t) => {
    const { run, career, query } = await fixtureLeague(t);
    const result = await run();
    assert.ok(result.ok);
    assert.deepEqual(result.seasons, [{ year: 2026, players: 13 }], 'Max Moss is kept for his games played');

    assert.deepEqual(await query(`select player_id, team_season_id, fpts::float8, games_played from league.player_seasons where player_id in ('0fx0c', '0fx0d') order by player_id`), [
        { player_id: '0fx0c', team_season_id: null, fpts: 0, games_played: 0 },
        { player_id: '0fx0d', team_season_id: null, fpts: 0, games_played: 6 },
    ]);
    assert.deepEqual(await career('0fx01'), ['0fx01', 300, 3.75, 1, 3]);
    assert.deepEqual(await career('0fx04'), ['0fx04', 400, 8.16, 1, 1], "400 FPts in 49 games played, not the export's 8.1");
    assert.deepEqual(await career('0fx0d'), ['0fx0d', 0, 0, 1, 12], 'a scoreless season with games played gets a career row, ranked last');
    assert.equal(await career('0fx0c'), null, 'a ring player with no games played counts toward no career');
});

test('a re-import keeps every player season\'s games played', async (t) => {
    const { run, careers, query } = await fixtureLeague(t);
    assert.ok((await run()).ok);
    const before = [await query(`select player_id, games_played from league.player_seasons order by player_id`), await careers()];
    assert.ok((await run()).ok);
    assert.deepEqual([await query(`select player_id, games_played from league.player_seasons order by player_id`), await careers()], before);
});

test("a season the history file doesn't cover keeps the games played the season sync wrote, and keeps a scoreless season that has some", async (t) => {
    const { client, run, career, query } = await fixtureLeague(t);
    assert.ok((await run({ gamesPlayed: uncovered() })).ok);
    assert.equal(await career('0fx01'), null, 'no games played yet, so no career');
    assert.deepEqual(await query(`select player_id from league.player_seasons where player_id = '0fx0d'`), [], 'Max Moss has no games played yet');

    // the season sync writes the season's games played
    await client.exec(`update league.player_seasons set games_played = 60 where player_id = '0fx01';
        insert into league.players (id, name) values ('0fx0d', 'Max Moss');
        insert into league.player_seasons (player_id, season_year, positions, fpts, fpg, games_played) values ('0fx0d', 2026, '{C}', 0, 0, 7)`);
    const result = await run({ gamesPlayed: uncovered() });
    assert.ok(result.ok);
    assert.deepEqual(result.seasons, [{ year: 2026, players: 13 }]);
    assert.deepEqual(await query(`select player_id, games_played from league.player_seasons where player_id in ('0fx01', '0fx0d') order by player_id`), [
        { player_id: '0fx01', games_played: 60 },
        { player_id: '0fx0d', games_played: 7 },
    ]);
    assert.deepEqual(await career('0fx01'), ['0fx01', 300, 5, 1, 1]);
});

test('an import is refused, writing nothing, when a covered season has a player season with FPts and no games played', async (t) => {
    const { run, query } = await fixtureLeague(t);
    const history = fixtureHistory();
    history.players = history.players.filter((row) => row.id !== '0fx0b');
    history.coverage[0].players -= 1;
    const result = await run({ gamesPlayed: history });
    assert.deepEqual(result, { ok: false, errors: ['2025–26: Kyle Knox (0fx0b) has FPts but no games played in the games-played history file'] });
    assert.deepEqual(await query(`select * from league.player_seasons`), []);
});
