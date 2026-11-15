import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
import { disposableLeague } from '@/lib/testing/disposable-league';
import type { Db } from './connect';
import type { DraftFactsLoader } from './draft-development';
import { loadLeagueConfig } from './league-config';
import { importSeasons, readLegacySeeds, type SeasonImportInput } from './season-import';

// What only the season sync supplies (regular-season games, weeks and skater categories) survives a season
// import of the same season, whose CSVs hold none of it. Each test imports the invented league in
// season-import-fixture/, writes what the season sync would have, then imports again. Its six teams:
// 1 Ashgrove, 2 Brimley, 3 Cobalt, 4 Dunmore, 5 Elmsford, 6 Fernvale.

const FIXTURE = path.join('scripts', 'db', 'lib', 'season-import-fixture');
const PLAYER_STATS = '2025-2026 Player Stats.csv';

const draftFacts: DraftFactsLoader = async (pick) => ({ nhlId: 9000 + pick.overall, birthDate: '2004-06-01', draftedOn: pick.draftedOn, priorNhlGames: null });
const fixtureLegacy = () => readLegacySeeds(path.join(FIXTURE, 'legacy-awards.json'), path.join(FIXTURE, 'legacy-championship-rosters.json'));

// what the season sync writes for 2025–26: two weeks, four regular-season games (one a tie), and category
// totals for three skaters (Kyle Knox among them)
const SYNC_WRITES = `
    insert into league.weeks (season_year, week, starts_at, ends_at) values
        (2026, 1, '2025-10-06T04:00:00Z', '2025-10-13T04:00:00Z'),
        (2026, 2, '2025-10-13T04:00:00Z', '2025-10-20T04:00:00Z');
    with ts as (select franchise_id, id from league.team_seasons where season_year = 2026)
    insert into league.matchups (season_year, stage, round, bracket, slot, away_team_season_id, home_team_season_id, away_score, home_score, winner_team_season_id)
    select 2026, 'regular', g.week, 'championship', g.slot, a.id, h.id, g.away_score, g.home_score,
           case when g.away_score > g.home_score then a.id when g.home_score > g.away_score then h.id end
    from (values (1, 0, 1, 2, 101.5, 99.25), (1, 1, 3, 4, 80, 80), (2, 0, 2, 3, 70, 90.75), (2, 1, 4, 1, 60, 61))
        as g(week, slot, away, home, away_score, home_score)
    join ts a on a.franchise_id = g.away
    join ts h on h.franchise_id = g.home;
    update league.player_seasons set goals = 30, assists = 25, shots = 200, hits = 40, blocks = 10 where player_id = '0fx01' and season_year = 2026;
    update league.player_seasons set goals = 5, assists = 20, shots = 90, hits = 60, blocks = 80 where player_id = '0fx02' and season_year = 2026;
    update league.player_seasons set goals = 4, assists = 3, shots = 30, hits = 12, blocks = 2 where player_id = '0fx0b' and season_year = 2026;`;

async function syncedLeague(t: TestContext) {
    const league = await disposableLeague(t);
    const db = drizzle(league.client, { schema });
    const run = (input: Partial<Omit<SeasonImportInput, 'db'>> = {}) =>
        importSeasons({ db: db as unknown as Db, config: loadLeagueConfig(path.join(FIXTURE, 'league.yml')), dataDir: path.join(FIXTURE, 'data'), seasons: [], legacy: fixtureLegacy(), loadDraftFacts: draftFacts, ...input });

    assert.equal((await run()).ok, true);
    await league.client.exec(SYNC_WRITES);

    const query = async <T>(sql: string) => (await league.client.query<T>(sql)).rows;
    const regularGames = () => query(`select * from league.matchups where stage = 'regular' order by id`);
    const weeks = () => query(`select * from league.weeks order by season_year, week`);

    return { client: league.client, run, query, regularGames, weeks };
}

// a copy of the fixture's data folder with one export changed
function dataCopy(t: TestContext, file: string, replacements: [string, string][]) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'season-import-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    cpSync(path.join(FIXTURE, 'data'), dir, { recursive: true });
    let text = readFileSync(path.join(dir, file), 'utf8');
    for (const [from, to] of replacements) {
        assert.ok(text.includes(from), `${file} should contain ${from}`);
        text = text.replace(from, to);
    }
    writeFileSync(path.join(dir, file), text);
    return dir;
}

test('a re-import keeps every regular-season game, ids included, and the season\'s weeks', async (t) => {
    const { run, regularGames, weeks } = await syncedLeague(t);
    const games = await regularGames();
    const weeksBefore = await weeks();
    assert.equal(games.length, 4);
    assert.equal(weeksBefore.length, 2);

    assert.equal((await run()).ok, true);
    assert.deepEqual(await regularGames(), games);
    assert.deepEqual(await weeks(), weeksBefore);
});
