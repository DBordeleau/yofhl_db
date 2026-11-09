import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import type { Db } from './connect';
import { prepareFantraxTeams, writeFantraxTeams } from './fantrax-teams';
import { loadLeagueConfig, type LeagueConfig } from './league-config';

// Each season's Fantrax league and team IDs are kept in league.yml; the importer loads them into
// league.fantrax_teams, against the real migrations.

const FRANCHISES = `
franchises:
  - id: 1
    eras: [{ from: 2020, name: Paddyville Lucifers, abbreviations: [PVLS] }]
  - id: 2
    eras: [{ from: 2020, name: New Purrsey Devils, abbreviations: [NPD] }]
`;

const leagueYml = (t: TestContext, seasons: string) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'league-yml-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'league.yml');
    writeFileSync(file, `${FRANCHISES}\nseasons:\n${seasons}`);
    return loadLeagueConfig(file);
};

async function database(t: TestContext) {
    const client = new PGlite();
    t.after(() => client.close());
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
    // the importer writes league.yml's franchises before anything that points at them
    await db.insert(schema.franchises).values([{ id: 1, displayName: 'One', firstSeason: 2020 }, { id: 2, displayName: 'Two', firstSeason: 2020 }]);
    return db;
}
type TestDb = Awaited<ReturnType<typeof database>>;

const runImport = async (db: TestDb, config: LeagueConfig) => {
    const { rows, errors } = prepareFantraxTeams(config);
    assert.deepEqual(errors, []);
    await writeFantraxTeams(db as unknown as Db, rows);
};

const storedTeams = async (db: TestDb) =>
    (await db.select().from(schema.fantraxTeams))
        .map((row) => [row.seasonYear, row.fantraxLeagueId, row.fantraxTeamId, row.franchiseId])
        .sort((a, b) => String(a).localeCompare(String(b)));

const TWO_SEASONS = `
  2026:
    fantrax: { league: oldleague0000001, teams: { aaaa1111old00001: 1, bbbb2222old00002: 2 } }
  2027:
    fantrax: { league: rf5o9cu2mutybszr, teams: { 6pfjiq07mutybt24: 1, 4num7i90mutybt24: 2 } }
`;

test("a season's fantrax block maps its Fantrax teams to franchises, without creating the season", async (t) => {
    const db = await database(t);
    await runImport(db, leagueYml(t, TWO_SEASONS));
    assert.deepEqual(await storedTeams(db), [
        [2026, 'oldleague0000001', 'aaaa1111old00001', 1],
        [2026, 'oldleague0000001', 'bbbb2222old00002', 2],
        [2027, 'rf5o9cu2mutybszr', '4num7i90mutybt24', 2],
        [2027, 'rf5o9cu2mutybszr', '6pfjiq07mutybt24', 1],
    ]);
    assert.deepEqual(await db.select().from(schema.seasons), [], 'the archive has no season rows');
    assert.deepEqual(await db.select().from(schema.teamSeasons), [], 'the archive has no team season rows');
});

test('re-running the import leaves the same rows, and follows league.yml when a team is removed', async (t) => {
    const db = await database(t);
    await runImport(db, leagueYml(t, TWO_SEASONS));
    const first = await storedTeams(db);
    await runImport(db, leagueYml(t, TWO_SEASONS));
    assert.deepEqual(await storedTeams(db), first);

    await runImport(db, leagueYml(t, `
  2027:
    fantrax: { league: rf5o9cu2mutybszr, teams: { 6pfjiq07mutybt24: 1 } }
`));
    assert.deepEqual(await storedTeams(db), [[2027, 'rf5o9cu2mutybszr', '6pfjiq07mutybt24', 1]]);
});

test('a Fantrax team mapped to a franchise league.yml does not list stops the import', (t) => {
    const { errors } = prepareFantraxTeams(leagueYml(t, `
  2027:
    fantrax: { league: rf5o9cu2mutybszr, teams: { 6pfjiq07mutybt24: 1, kr34cpssmutybt24: 13 } }
`));
    assert.deepEqual(errors, ['2026–27: Fantrax team kr34cpssmutybt24 is mapped to franchise 13, which isn\'t in league.yml\'s franchises']);
});

test('two Fantrax teams mapped to one franchise in a season stop the import', (t) => {
    const { errors } = prepareFantraxTeams(leagueYml(t, `
  2027:
    fantrax: { league: rf5o9cu2mutybszr, teams: { 6pfjiq07mutybt24: 1, 4num7i90mutybt24: 1 } }
`));
    assert.deepEqual(errors, ['2026–27: Fantrax teams 6pfjiq07mutybt24 and 4num7i90mutybt24 are both mapped to franchise 1']);
});

test("league.yml's own fantrax blocks map to its franchises", () => {
    const config = loadLeagueConfig('league/league.yml');
    const { rows, errors } = prepareFantraxTeams(config);
    assert.deepEqual(errors, []);
    assert.ok(rows.some((row) => row.seasonYear === 2027), 'the 2026–27 season has its Fantrax IDs');
});
