import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
import { disposableLeague } from '@/lib/testing/disposable-league';
import type { Db } from './connect';
import type { DraftFactsLoader } from './draft-development';
import { loadLeagueConfig, type LeagueConfig } from './league-config';
import { importSeasons, readLegacySeeds, type SeasonImportInput } from './season-import';

// The season import is all or nothing: it validates everything first, then writes in one transaction.
// Each test runs the module's one call against the invented league in season-import-fixture/, changing a
// copy of its data folder or a loaded copy of its configuration.

const FIXTURE = path.join('scripts', 'db', 'lib', 'season-import-fixture');

const draftFacts: DraftFactsLoader = async (pick) => ({ nhlId: 9000 + pick.overall, birthDate: '2004-06-01', draftedOn: pick.draftedOn, priorNhlGames: null });
const fixtureConfig = () => loadLeagueConfig(path.join(FIXTURE, 'league.yml'));
const fixtureLegacy = () => readLegacySeeds(path.join(FIXTURE, 'legacy-awards.json'), path.join(FIXTURE, 'legacy-championship-rosters.json'));

async function emptyLeague(t: TestContext) {
    const league = await disposableLeague(t);
    const db = drizzle(league.client, { schema });
    const run = (input: Partial<Omit<SeasonImportInput, 'db'>> = {}) =>
        importSeasons({ db: db as unknown as Db, config: fixtureConfig(), dataDir: path.join(FIXTURE, 'data'), seasons: [], legacy: fixtureLegacy(), loadDraftFacts: draftFacts, ...input });

    // every row of every table and materialized view in the league schema, to compare before and after
    const everyRow = async () => {
        const { rows: relations } = await league.client.query<{ name: string }>(
            `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'league' and c.relkind in ('r', 'm') order by c.relname`,
        );
        const contents: Record<string, string[]> = {};
        for (const { name } of relations) {
            const { rows } = await league.client.query(`select * from league."${name}"`);
            contents[name] = rows.map((row) => JSON.stringify(row)).sort();
        }
        return contents;
    };

    return { db, run, everyRow };
}

// a copy of the fixture's data folder for the test to change
function dataCopy(t: TestContext, change: (dir: string) => void) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'season-import-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    cpSync(path.join(FIXTURE, 'data'), dir, { recursive: true });
    change(dir);
    return dir;
}

const playerStats = (dir: string) => path.join(dir, '2025-2026 Player Stats.csv');

// league configuration changes that a write would show: an award description, a logo and the Fantrax league
function changedLeague(): LeagueConfig {
    const config = fixtureConfig();
    config.awards[0].description = 'Changed description';
    config.franchises[0].eras[0].logo = '/logos/changed.png';
    config.seasons[2026].fantrax!.league = 'changedleague002';
    return config;
}

test('validation: a ring or award player missing from the player export is reported and nothing is written', async (t) => {
    const { run, everyRow } = await emptyLeague(t);
    assert.equal((await run()).ok, true);
    const before = await everyRow();

    // Leo Lark is on the curated championship roster the first import seeded; the legacy list here doesn't name him
    const withoutLeo = dataCopy(t, (dir) => {
        const csv = readFileSync(playerStats(dir), 'utf8');
        writeFileSync(playerStats(dir), csv.split('\n').filter((line) => !line.includes('Leo Lark')).join('\n'));
    });
    const legacy = fixtureLegacy();
    legacy.rosters['2026'] = legacy.rosters['2026'].filter((p) => p.player !== 'Leo Lark');
    legacy.awards.push({ season: 2026, award: 'Top Gun Award', playerId: '*0fxzz*', player: 'Zed Zane', team: 'Ashgrove Anglers' });

    assert.deepEqual(await run({ config: changedLeague(), dataDir: withoutLeo, legacy }), {
        ok: false,
        errors: [
            '2025–26: Zed Zane (*0fxzz*) is on a championship roster or award list but isn\'t in "2025-2026 Player Stats.csv"',
            '2025–26: Leo Lark (*0fx0c*) is on a championship roster or award list but isn\'t in "2025-2026 Player Stats.csv"',
        ],
    });
    assert.deepEqual(await everyRow(), before);
});

test('validation: an unknown team, a missing file or an unmatched score override writes nothing', async (t) => {
    const { run, everyRow } = await emptyLeague(t);
    assert.equal((await run()).ok, true);
    const before = await everyRow();

    const unknownTeam = dataCopy(t, (dir) => {
        const file = path.join(dir, '2025-2026 Team Stats.csv');
        writeFileSync(file, readFileSync(file, 'utf8').replace('"Fernvale Foxes"', '"Mystery Moose"'));
    });
    const noPlayoffs = dataCopy(t, (dir) => rmSync(path.join(dir, '2025-2026 Playoffs.csv')));
    const unmatchedOverride = changedLeague();
    unmatchedOverride.scoreOverrides = [{ season: 2026, round: 3, team: 'ASH', score: 500, note: 'No such round' }];

    const unknown = await run({ config: changedLeague(), dataDir: unknownTeam });
    assert.equal(unknown.ok, false);
    assert.match((unknown as { errors: string[] }).errors.join('\n'), /team "Mystery Moose" doesn't match any franchise era/);
    assert.deepEqual(await run({ config: changedLeague(), dataDir: noPlayoffs }), {
        ok: false,
        errors: ['2025–26: missing "2025-2026 Playoffs.csv" (mark the season "playoffs: cancelled" in league.yml if there were none)'],
    });
    assert.deepEqual(await run({ config: unmatchedOverride }), {
        ok: false,
        errors: ["2025–26: score override for ASH in round 3 didn't match any playoff game"],
    });
    assert.deepEqual(await everyRow(), before);
});

test('validation: a data folder with no season CSVs is reported and nothing is written', async (t) => {
    const { run, everyRow } = await emptyLeague(t);
    const before = await everyRow();
    const empty = dataCopy(t, (dir) => {
        for (const file of ['Player Stats', 'Team Stats', 'Playoffs']) rmSync(path.join(dir, `2025-2026 ${file}.csv`));
    });

    assert.deepEqual(await run({ dataDir: empty }), { ok: false, errors: [`No Fantrax CSVs found in ${empty}/`] });
    assert.deepEqual(await everyRow(), before);
});

test('keep set: a zero-point free agent on a ring or award list is kept and one on neither is dropped', async (t) => {
    const { db, run } = await emptyLeague(t);
    // Leo Lark is on the legacy ring list; Max Moss is added to the legacy awards here; Kyle Knox scored
    const legacy = fixtureLegacy();
    legacy.awards.push({ season: 2026, award: 'Top Gun Award', playerId: '*0fx0d*', player: 'Max Moss', team: 'Ashgrove Anglers' });
    const freeAgents = async () =>
        (await db.select().from(schema.playerSeasons)).filter((p) => p.teamSeasonId === null).map((p) => p.playerId).sort();

    assert.equal((await run()).ok, true);
    assert.deepEqual(await freeAgents(), ['*0fx0b*', '*0fx0c*']);

    const { db: other, run: runOther } = await emptyLeague(t);
    assert.equal((await runOther({ legacy })).ok, true);
    assert.deepEqual(
        (await other.select().from(schema.playerSeasons)).filter((p) => p.teamSeasonId === null).map((p) => p.playerId).sort(),
        ['*0fx0b*', '*0fx0c*', '*0fx0d*'],
    );
});

test('re-import: team-season ids and curated rosters and awards survive, and legacy seeds fill only an empty season', async (t) => {
    const { db, run } = await emptyLeague(t);
    assert.equal((await run()).ok, true);
    const ids = async () => (await db.select().from(schema.teamSeasons)).map((ts) => [ts.franchiseId, ts.id]).sort((a, b) => a[0] - b[0]);
    const teamSeasonIds = await ids();

    // the admin replaces the awards with one of their own and clears the ring, which the legacy seed then refills
    const [ashgrove] = await db.select().from(schema.teamSeasons).where(eq(schema.teamSeasons.franchiseId, 1));
    const [netMinder] = await db.select().from(schema.awardTypes).where(eq(schema.awardTypes.name, 'Net Minder'));
    await db.delete(schema.awards);
    await db.insert(schema.awards).values({ seasonYear: 2026, awardTypeId: netMinder.id, playerId: '*0fx02*', teamSeasonId: ashgrove.id });
    await db.delete(schema.championshipRosters);

    const reimport = await run();
    assert.ok(reimport.ok);
    assert.deepEqual([reimport.seasons, reimport.legacyNotes], [[{ year: 2026, players: 12 }], []]);
    assert.deepEqual(await ids(), teamSeasonIds);
    assert.deepEqual(
        (await db.select().from(schema.awards)).map((a) => [a.awardTypeId, a.playerId, a.teamSeasonId]),
        [[netMinder.id, '*0fx02*', ashgrove.id]],
    );
    assert.deepEqual((await db.select().from(schema.championshipRosters)).map((r) => r.playerId).sort(), ['*0fx01*', '*0fx02*', '*0fx0c*']);

    // and a curated ring is kept as it is
    await db.delete(schema.championshipRosters).where(eq(schema.championshipRosters.playerId, '*0fx02*'));
    assert.equal((await run()).ok, true);
    assert.deepEqual((await db.select().from(schema.championshipRosters)).map((r) => r.playerId).sort(), ['*0fx01*', '*0fx0c*']);
});

test('rollback: a failure during legacy seeding, after the seasons are written, leaves every table as it was', async (t) => {
    const { run, everyRow } = await emptyLeague(t);
    // a first import with no legacy awards, so the next one seeds awards into 2025–26
    assert.equal((await run({ legacy: { ...fixtureLegacy(), awards: [] } })).ok, true);
    const before = await everyRow();

    // changed standings, so the season rows the import writes before seeding differ from the ones above
    const changedStandings = dataCopy(t, (dir) => {
        const file = path.join(dir, '2025-2026 Team Stats.csv');
        writeFileSync(file, readFileSync(file, 'utf8').replace('"1","Ashgrove Anglers","30","14"', '"1","Ashgrove Anglers","31","13"'));
    });
    const legacy = fixtureLegacy();
    legacy.awards.push({ season: 2026, award: 'Hart Trophy', playerId: '*0fx0b*', player: 'Kyle Knox', team: 'Ashgrove Anglers' });

    await assert.rejects(run({ config: changedLeague(), dataDir: changedStandings, legacy }), /Legacy award "Hart Trophy" isn't in league.yml awards/);
    assert.deepEqual(await everyRow(), before);
});
