import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
import { disposableLeague, type LeagueOptions } from '@/lib/testing/disposable-league';
import type { Db } from './connect';
import type { DraftFactsLoader } from './draft-development';
import { loadLeagueConfig, type LeagueConfig } from './league-config';
import { importSeasons, readLegacySeeds, type SeasonImportInput } from './season-import';

// Opening the season being played: a season with a Fantrax block in the league configuration and no CSVs
// is created by the season import with zeroed standings, ready for the season sync. Each test runs the
// module's one call against the invented league in season-import-fixture/, with a loaded copy of its
// configuration that adds a 2026–27 Fantrax block, or a copy of its data folder.

const FIXTURE = path.join('scripts', 'db', 'lib', 'season-import-fixture');

const draftFacts: DraftFactsLoader = async (pick) => ({ nhlId: 9000 + pick.overall, birthDate: '2004-06-01', draftedOn: pick.draftedOn, priorNhlGames: null });
const fixtureLegacy = () => readLegacySeeds(path.join(FIXTURE, 'legacy-awards.json'), path.join(FIXTURE, 'legacy-championship-rosters.json'));

// the fixture league with 2026–27 started on Fantrax: every franchise mapped, no CSVs yet
function withLiveSeason(): LeagueConfig {
    const config = loadLeagueConfig(path.join(FIXTURE, 'league.yml'));
    config.seasons[2027] = {
        fantrax: {
            league: 'fixtureleague002',
            teams: { fxlive0000000001: 1, fxlive0000000002: 2, fxlive0000000003: 3, fxlive0000000004: 4, fxlive0000000005: 5, fxlive0000000006: 6 },
        },
    };
    return config;
}

async function league(t: TestContext, options: LeagueOptions = {}) {
    const disposable = await disposableLeague(t, options);
    const db = drizzle(disposable.client, { schema });
    const run = (input: Partial<Omit<SeasonImportInput, 'db'>> = {}) =>
        importSeasons({ db: db as unknown as Db, config: withLiveSeason(), dataDir: path.join(FIXTURE, 'data'), seasons: [], legacy: fixtureLegacy(), loadDraftFacts: draftFacts, ...input });

    // every row of every table and materialized view in the league schema, to compare before and after
    const everyRow = async () => {
        const { rows: relations } = await disposable.client.query<{ name: string }>(
            `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'league' and c.relkind in ('r', 'm') order by c.relname`,
        );
        const contents: Record<string, string[]> = {};
        for (const { name } of relations) {
            const { rows } = await disposable.client.query(`select * from league."${name}"`);
            contents[name] = rows.map((row) => JSON.stringify(row)).sort();
        }
        return contents;
    };

    // a season's team seasons as the archive holds them: identity, then standings
    const teamSeasons = async (year: number) => {
        const owners = new Map((await db.select().from(schema.owners)).map((o) => [o.id, o.name]));
        return (await db.select().from(schema.teamSeasons).where(eq(schema.teamSeasons.seasonYear, year)).orderBy(asc(schema.teamSeasons.franchiseId)))
            .map((ts) => [ts.franchiseId, ts.name, ts.ownerId === null ? null : owners.get(ts.ownerId), ts.logoUrl, ts.abbreviation, ts.wins, ts.losses, ts.ties, ts.fptsFor, ts.fptsAgainst]);
    };

    return { db, run, everyRow, teamSeasons };
}

// a copy of the fixture's data folder for the test to change
function dataCopy(t: TestContext, change: (dir: string) => void) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'season-open-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    cpSync(path.join(FIXTURE, 'data'), dir, { recursive: true });
    change(dir);
    return dir;
}

test('opening: a season with a Fantrax block and no CSVs gets one team season per mapped franchise, with its era identity and zeroed standings', async (t) => {
    const { run, teamSeasons } = await league(t);

    const result = await run();
    assert.ok(result.ok, JSON.stringify(result));

    assert.deepEqual(await teamSeasons(2027), [
        [1, 'Ashgrove Anglers', 'Ada Fixture', '/logos/fixture-ashgrove.png', 'ASH', 0, 0, 0, 0, 0],
        [2, 'Brimley Badgers', 'Bo Fixture', null, 'BRIM', 0, 0, 0, 0, 0],
        [3, 'Cobalt Comets', null, null, 'COB', 0, 0, 0, 0, 0],
        [4, 'Dunmore Drakes', null, null, 'DUN', 0, 0, 0, 0, 0],
        [5, 'Elmsford Eels', null, null, 'ELM', 0, 0, 0, 0, 0],
        [6, 'Fernvale Foxes', null, null, 'FERN', 0, 0, 0, 0, 0],
    ]);
    // the CSV season beside it is imported as before
    assert.equal((await teamSeasons(2026))[0][5], 30);
});

test('an opened season is the current season, unpublished, and on the admin season checklist', async (t) => {
    const { run } = await league(t, { app: true, nextCache: true });
    const result = await run();
    assert.ok(result.ok);
    assert.deepEqual(result.opened, [{ year: 2027, teams: 6 }]);

    const { getSeasonArchive } = await import('@/lib/data/league');
    const archive = await getSeasonArchive();
    assert.deepEqual(archive.published.map((s) => s.year), [2026]);
    assert.equal(archive.current?.year, 2027);

    const { getSearchDirectory } = await import('@/lib/data/search');
    assert.deepEqual((await getSearchDirectory()).filter((e) => e.kind === 'seasons').map((e) => e.id), ['2026']);

    const { getSeasonStatuses } = await import('@/lib/admin/data');
    const [opened] = await getSeasonStatuses();
    assert.deepEqual(opened, {
        year: 2027, label: '2026–27', playoffStatus: 'complete', teams: 6, players: 0, games: 0,
        champion: null, roster: 0, awards: 0, awardsExpected: 6, overrides: 0, // six: the catalogue's stored awards
    });
});

test("an earlier season's Fantrax block with its CSVs beside it is only loaded as its Fantrax teams: the season is imported from its CSVs, not opened", async (t) => {
    const withBlock = await league(t);
    const result = await withBlock.run();
    assert.ok(result.ok);
    assert.deepEqual([result.seasons, result.opened], [[{ year: 2026, players: 12 }], [{ year: 2027, teams: 6 }]]);

    // the same import without 2025–26's block (as for a past season kept only for the award vote's rehearsal)
    const withoutBlock = await league(t);
    const noBlock = withLiveSeason();
    delete noBlock.seasons[2026].fantrax;
    assert.ok((await withoutBlock.run({ config: noBlock })).ok);

    const { fantrax_teams: mapped, ...rest } = await withBlock.everyRow();
    const { fantrax_teams: unmapped, ...restWithout } = await withoutBlock.everyRow();
    assert.deepEqual(rest, restWithout);
    assert.deepEqual([mapped.length, unmapped.length], [12, 6]);
});

// what the season sync writes into an opened season: standings, player seasons and a playoff game
async function syncWrites(db: Awaited<ReturnType<typeof league>>['db'], year: number) {
    const teams = await db.select().from(schema.teamSeasons).where(eq(schema.teamSeasons.seasonYear, year)).orderBy(asc(schema.teamSeasons.franchiseId));
    for (const [i, ts] of teams.entries()) {
        await db.update(schema.teamSeasons)
            .set({ divisionRank: teams.length - i, wins: 3 + i, losses: 5 - i, ties: 1, fptsFor: 400.5 + i, fptsAgainst: 390.25 - i })
            .where(eq(schema.teamSeasons.id, ts.id));
    }
    await db.insert(schema.players).values([{ id: 'live01', name: 'Rex Rookie' }, { id: 'live02', name: 'Sal Sniper' }]).onConflictDoNothing();
    await db.insert(schema.playerSeasons).values([
        { playerId: 'live01', seasonYear: year, teamSeasonId: teams[0].id, nhlTeam: 'TOR', positions: ['C'], fpts: 88.5, fpg: 4.21 },
        { playerId: 'live02', seasonYear: year, teamSeasonId: null, nhlTeam: 'BOS', positions: ['RW'], fpts: 12, fpg: 1.5 },
    ]);
    await db.insert(schema.matchups).values({
        seasonYear: year, stage: 'playoff', round: 1, bracket: 'championship', slot: 0,
        awayTeamSeasonId: teams[3].id, homeTeamSeasonId: teams[4].id, awayScore: 310.5, homeScore: 290, winnerTeamSeasonId: teams[3].id,
    });
}

// everything a season holds that the season sync writes, row for row
async function synced(db: Awaited<ReturnType<typeof league>>['db'], year: number) {
    return {
        teamSeasons: await db.select().from(schema.teamSeasons).where(eq(schema.teamSeasons.seasonYear, year)).orderBy(asc(schema.teamSeasons.franchiseId)),
        playerSeasons: await db.select().from(schema.playerSeasons).where(eq(schema.playerSeasons.seasonYear, year)).orderBy(asc(schema.playerSeasons.playerId)),
        matchups: await db.select().from(schema.matchups).where(eq(schema.matchups.seasonYear, year)),
    };
}

test('opening again keeps the standings, player seasons and playoff games written since', async (t) => {
    const { db, run } = await league(t);
    assert.ok((await run()).ok);
    await syncWrites(db, 2027);
    const before = await synced(db, 2027);

    const again = await run();
    assert.ok(again.ok);
    assert.deepEqual(again.opened, [{ year: 2027, teams: 6 }]);
    assert.deepEqual(await synced(db, 2027), before);
});

test('opening again after an era change updates the team season identity and nothing else', async (t) => {
    const { db, run, teamSeasons } = await league(t);
    assert.ok((await run()).ok);
    await syncWrites(db, 2027);

    // Ashgrove becomes the Albatross for 2026–27, under a new owner
    const renamed = withLiveSeason();
    renamed.franchises[0].eras[0].to = 2026;
    renamed.franchises[0].eras.push({ from: 2027, name: 'Ashgrove Albatross', abbreviations: ['ASHA'], owner: 'Cy Fixture', logo: '/logos/fixture-albatross.png' });
    assert.ok((await run({ config: renamed })).ok);

    assert.deepEqual(await teamSeasons(2027), [
        [1, 'Ashgrove Albatross', 'Cy Fixture', '/logos/fixture-albatross.png', 'ASHA', 3, 5, 1, 400.5, 390.25],
        [2, 'Brimley Badgers', 'Bo Fixture', null, 'BRIM', 4, 4, 1, 401.5, 389.25],
        [3, 'Cobalt Comets', null, null, 'COB', 5, 3, 1, 402.5, 388.25],
        [4, 'Dunmore Drakes', null, null, 'DUN', 6, 2, 1, 403.5, 387.25],
        [5, 'Elmsford Eels', null, null, 'ELM', 7, 1, 1, 404.5, 386.25],
        [6, 'Fernvale Foxes', null, null, 'FERN', 8, 0, 1, 405.5, 385.25],
    ]);
    // the archived season keeps the era it was played under
    assert.deepEqual((await teamSeasons(2026))[0].slice(0, 5), [1, 'Ashgrove Anglers', 'Ada Fixture', '/logos/fixture-ashgrove.png', 'ASH']);
});

test('validation: a franchise mapped in the Fantrax block with no era for the season stops the import, and nothing is written', async (t) => {
    const { run, everyRow } = await league(t);
    assert.ok((await run()).ok);
    const before = await everyRow();

    // Fernvale folded after 2025–26 but is still mapped in the 2026–27 block
    const folded = withLiveSeason();
    folded.franchises[5].eras[0].to = 2026;

    assert.deepEqual(await run({ config: folded }), {
        ok: false,
        errors: ["2026–27: Fantrax team fxlive0000000006 is mapped to franchise 6, which has no era for this season in league.yml. Add one, or remove the team from the season's fantrax block."],
    });
    assert.deepEqual(await everyRow(), before);
});

test('a CSV import of an opened season replaces what was written into it, as a season import always does', async (t) => {
    const { db, run, teamSeasons } = await league(t);
    // 2025–26 opened from its Fantrax block before its CSVs were exported
    const noCsvs = dataCopy(t, (dir) => {
        for (const file of ['Player Stats', 'Team Stats', 'Playoffs']) rmSync(path.join(dir, `2025-2026 ${file}.csv`));
    });
    const opening = await run({ dataDir: noCsvs });
    assert.ok(opening.ok);
    assert.deepEqual([opening.seasons, opening.opened.map((s) => s.year)], [[], [2026, 2027]]);
    await syncWrites(db, 2026);

    const imported = await run();
    assert.ok(imported.ok);
    assert.deepEqual(imported.seasons, [{ year: 2026, players: 12 }]);
    assert.deepEqual((await teamSeasons(2026)).map((ts) => [ts[0], ts[1], ts[5], ts[6], ts[7], ts[8], ts[9]]), [
        [1, 'Ashgrove Anglers', 30, 14, 2, 4600.5, 4000],
        [2, 'Brimley Badgers', 27, 16, 3, 4450.25, 4100],
        [3, 'Cobalt Comets', 24, 19, 3, 4300, 4250.75],
        [4, 'Dunmore Drakes', 22, 21, 3, 4200, 4300],
        [5, 'Elmsford Eels', 18, 25, 3, 4000, 4400.5],
        [6, 'Fernvale Foxes', 15, 28, 3, 3900.75, 4500],
    ]);
    const { playerSeasons, matchups } = await synced(db, 2026);
    assert.deepEqual(playerSeasons.map((p) => p.playerId), ['0fx01', '0fx02', '0fx03', '0fx04', '0fx05', '0fx06', '0fx07', '0fx08', '0fx09', '0fx0a', '0fx0b', '0fx0c']);
    assert.equal(matchups.length, 4);
    const [champion] = await db.select().from(schema.seasonResults).where(eq(schema.seasonResults.seasonYear, 2026));
    assert.equal((await db.select().from(schema.teamSeasons).where(eq(schema.teamSeasons.id, champion.championTeamSeasonId!)))[0].franchiseId, 1);
});
