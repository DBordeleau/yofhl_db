import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
import { disposableLeague } from '@/lib/testing/disposable-league';
import type { Db } from './connect';
import type { DraftFactsLoader } from './draft-development';
import { loadLeagueConfig, type LeagueConfig } from './league-config';
import { importSeasons, readLegacySeeds } from './season-import';

// The season import's bracket rules, run through its one call against the fixture league in
// season-import-fixture/, varied per test. Its six teams: 1 Ashgrove, 2 Brimley, 3 Cobalt, 4 Dunmore
// in the championship bracket (semis 4@1 and 3@2, final 3@1), 5 Elmsford and 6 Fernvale in consolation.

const FIXTURE = path.join('scripts', 'db', 'lib', 'season-import-fixture');
const PLAYOFFS = '2025-2026 Playoffs.csv';

const draftFacts: DraftFactsLoader = async (pick) => ({ nhlId: 9000 + pick.overall, birthDate: '2004-06-01', draftedOn: pick.draftedOn, priorNhlGames: null });

interface Variation {
    /** Changes a loaded copy of the fixture's league configuration. */
    config?: (config: LeagueConfig) => void;
    /** Changes a temp copy of the fixture's data folder. */
    data?: (dir: string) => void;
    /** SQL run on the league before the import, such as saved bracket corrections. */
    seed?: string;
}

async function variedImport(t: TestContext, { config: vary, data, seed }: Variation = {}) {
    const db = drizzle((await disposableLeague(t, { seed })).client, { schema });
    const config = loadLeagueConfig(path.join(FIXTURE, 'league.yml'));
    vary?.(config);
    let dataDir = path.join(FIXTURE, 'data');
    if (data) {
        dataDir = mkdtempSync(path.join(tmpdir(), 'season-import-'));
        t.after(() => rmSync(dataDir, { recursive: true, force: true }));
        cpSync(path.join(FIXTURE, 'data'), dataDir, { recursive: true });
        data(dataDir);
    }
    const result = await importSeasons({
        db: db as unknown as Db,
        config,
        dataDir,
        seasons: [],
        legacy: readLegacySeeds(path.join(FIXTURE, 'legacy-awards.json'), path.join(FIXTURE, 'legacy-championship-rosters.json')),
        loadDraftFacts: draftFacts,
    });

    // the imported bracket by franchise id, in drawing order
    const bracket = async () => {
        const franchiseOf = new Map((await db.select().from(schema.teamSeasons)).map((ts) => [ts.id, ts.franchiseId]));
        const franchise = (id: number | null) => (id === null ? null : franchiseOf.get(id));
        return (await db.select().from(schema.matchups))
            .map((g) => ({
                round: g.round, bracket: g.bracket, slot: g.slot,
                away: franchise(g.awayTeamSeasonId), home: franchise(g.homeTeamSeasonId), winner: franchise(g.winnerTeamSeasonId),
                adjusted: g.scoreAdjusted, note: g.note,
            }))
            .sort((a, b) => a.bracket.localeCompare(b.bracket) || a.round - b.round || a.slot - b.slot);
    };
    const nothingWritten = async () => {
        assert.deepEqual(await db.select().from(schema.seasons), []);
        assert.deepEqual(await db.select().from(schema.teamSeasons), []);
        assert.deepEqual(await db.select().from(schema.matchups), []);
    };
    return { db, result, bracket, nothingWritten };
}

const editPlayoffs = (dir: string, from: string, to: string) => {
    const file = path.join(dir, PLAYOFFS);
    const text = readFileSync(file, 'utf8');
    assert.ok(text.includes(from), `fixture playoffs should contain ${from}`);
    writeFileSync(file, text.replace(from, to));
};

const game = (round: number, bracket: 'championship' | 'consolation', slot: number, away: number, home: number, winner: number | null, adjusted = false, note: string | null = null) =>
    ({ round, bracket, slot, away, home, winner, adjusted, note });

test('season import bracket rules', async (t) => {
    await t.test('an unverified score override flips the winner and marks the game adjusted with its note', async (t) => {
        const { result, bracket } = await variedImport(t, {
            config: (c) => { c.scoreOverrides = [{ season: 2026, round: 2, team: 'COB', score: 330, note: 'Stat correction after the final' }]; },
        });
        assert.equal(result.ok, true);
        assert.deepEqual(await bracket(), [
            game(1, 'championship', 0, 3, 2, 3),
            game(1, 'championship', 1, 4, 1, 1),
            game(2, 'championship', 0, 3, 1, 3, true, 'Stat correction after the final'),
            game(1, 'consolation', 0, 6, 5, 6),
        ]);
    });

    await t.test('a verified score override flips the winner without marking the game adjusted', async (t) => {
        const { result, bracket } = await variedImport(t, {
            config: (c) => { c.scoreOverrides = [{ season: 2026, round: 2, team: 'COB', score: 330, note: 'Rebuilt from the game log', verified: true }]; },
        });
        assert.equal(result.ok, true);
        assert.deepEqual((await bracket()).find((g) => g.round === 2), game(2, 'championship', 0, 3, 1, 3));
    });

    await t.test('a saved bracket correction overrides the winner and the bracket', async (t) => {
        const { result, bracket } = await variedImport(t, {
            seed: `
                insert into league.seasons (year, label, playoff_status) values (2026, '2025–26', 'complete');
                insert into league.franchises (id, display_name, first_season) values (1, 'A', 2026), (3, 'C', 2026), (5, 'E', 2026), (6, 'F', 2026);
                insert into league.matchup_overrides (season_year, round, franchise_a, franchise_b, winner_franchise_id, bracket, note) values
                    (2026, 2, 1, 3, 3, null, 'Ashgrove forfeited'),
                    (2026, 1, 5, 6, null, 'championship', null);`,
        });
        assert.equal(result.ok, true);
        assert.deepEqual(await bracket(), [
            game(1, 'championship', 0, 3, 2, 3),
            game(1, 'championship', 1, 4, 1, 1),
            game(1, 'championship', 2, 6, 5, 6),
            game(2, 'championship', 0, 3, 1, 3),
        ]);
    });

    await t.test('consolation teams from the configuration land in the consolation bracket', async (t) => {
        const { result, bracket } = await variedImport(t, { config: (c) => { c.seasons[2026].consolation = []; } });
        assert.equal(result.ok, true);
        assert.deepEqual((await bracket()).filter((g) => g.away === 6), [game(1, 'championship', 2, 6, 5, 6)]);

        const configured = await variedImport(t);
        assert.deepEqual((await configured.bracket()).filter((g) => g.away === 6), [game(1, 'consolation', 0, 6, 5, 6)]);
    });

    await t.test('a game mixing a consolation team with a championship team is a validation error', async (t) => {
        const { result, nothingWritten } = await variedImport(t, { config: (c) => { c.seasons[2026].consolation = ['ELM', 'FERN', 'DUN']; } });
        assert.deepEqual(result, { ok: false, errors: ['2025–26: round 1 Dunmore Drakes vs Ashgrove Anglers mixes a consolation team with a championship team'] });
        await nothingWritten();
    });

    await t.test('slots put each game next to the games that fed it, whatever the export order', async (t) => {
        // the final with its sides swapped (Ashgrove away) and the semifinals exported Cobalt's first:
        // Ashgrove's semifinal is still drawn first, because it fed the final's away side
        const { result, bracket } = await variedImport(t, {
            data: (dir) => {
                editPlayoffs(dir, '"Cobalt Comets","300","Ashgrove Anglers","320.75"', '"Ashgrove Anglers","320.75","Cobalt Comets","300"');
                const ashgroveSemi = '"Dunmore Drakes","210.5","Ashgrove Anglers","250"';
                const cobaltSemi = '"Cobalt Comets","240.25","Brimley Badgers","230"';
                editPlayoffs(dir, ashgroveSemi, 'SWAP');
                editPlayoffs(dir, cobaltSemi, ashgroveSemi);
                editPlayoffs(dir, 'SWAP', cobaltSemi);
            },
        });
        assert.equal(result.ok, true);
        assert.deepEqual((await bracket()).filter((g) => g.bracket === 'championship'), [
            game(1, 'championship', 0, 4, 1, 1),
            game(1, 'championship', 1, 3, 2, 3),
            game(2, 'championship', 0, 1, 3, 1),
        ]);
    });

    await t.test('a team in a later round after losing the round before is a validation error', async (t) => {
        const { result, nothingWritten } = await variedImport(t, {
            data: (dir) => editPlayoffs(dir, '"Dunmore Drakes","210.5"', '"Dunmore Drakes","260"'),
        });
        assert.deepEqual(result, {
            ok: false,
            errors: ['2025–26: Ashgrove Anglers plays in round 2 but lost round 1 on the exported scores. Add a scoreOverrides entry in league.yml if the result stood.'],
        });
        await nothingWritten();
    });

    await t.test('a cancelled season imports with no games', async (t) => {
        const { db, result, bracket } = await variedImport(t, {
            config: (c) => { c.seasons[2026].playoffs = 'cancelled'; },
            data: (dir) => rmSync(path.join(dir, PLAYOFFS)),
        });
        assert.equal(result.ok, true);
        assert.deepEqual((await db.select().from(schema.seasons)).map((s) => [s.year, s.playoffStatus]), [[2026, 'cancelled']]);
        assert.deepEqual(await bracket(), []);
    });
});
