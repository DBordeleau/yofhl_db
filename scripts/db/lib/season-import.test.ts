import assert from 'node:assert/strict';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
import { disposableLeague } from '@/lib/testing/disposable-league';
import type { Db } from './connect';
import type { DraftFactsLoader } from './draft-development';
import { loadLeagueConfig } from './league-config';
import { importSeasons, readLegacySeeds } from './season-import';

// The season import, run through its one call against the invented league in season-import-fixture/.

const FIXTURE = path.join('scripts', 'db', 'lib', 'season-import-fixture');

// Stands in for the NHL lookups, so no test reaches the network.
const draftFacts: DraftFactsLoader = async (pick) => ({ nhlId: 9000 + pick.overall, birthDate: '2004-06-01', draftedOn: pick.draftedOn, priorNhlGames: null });

async function fixtureImport(t: TestContext) {
    const db = drizzle((await disposableLeague(t)).client, { schema });
    const result = await importSeasons({
        db: db as unknown as Db,
        config: loadLeagueConfig(path.join(FIXTURE, 'league.yml')),
        dataDir: path.join(FIXTURE, 'data'),
        seasons: [],
        legacy: readLegacySeeds(path.join(FIXTURE, 'legacy-awards.json'), path.join(FIXTURE, 'legacy-championship-rosters.json')),
        loadDraftFacts: draftFacts,
    });
    return { db, result };
}

test('a clean import stores the player IDs bare, though the Fantrax CSVs wrap them', async (t) => {
    const { db, result } = await fixtureImport(t);
    assert.ok(result.ok);

    const players = (await db.select().from(schema.players)).map((p) => p.id).sort();
    assert.deepEqual(players, ['0fx01', '0fx02', '0fx03', '0fx04', '0fx05', '0fx06', '0fx07', '0fx08', '0fx09', '0fx0a', '0fx0b', '0fx0c']);
    assert.deepEqual((await db.select().from(schema.playerSeasons)).map((s) => s.playerId).sort(), players);
    assert.deepEqual((await db.select().from(schema.championshipRosters)).map((r) => r.playerId).sort(), ['0fx01', '0fx02', '0fx0c']);
    assert.deepEqual((await db.select().from(schema.awards)).map((a) => a.playerId).sort(), ['0fx01', '0fx04']);
});

test('a clean import of the fixture league writes its standings, bracket, season result and history', async (t) => {
    const { db, result } = await fixtureImport(t);

    // the statuses it returns are covered in season-import-status.test.ts
    assert.ok(result.ok);
    assert.deepEqual({ seasons: result.seasons, legacyNotes: result.legacyNotes }, {
        seasons: [{ year: 2026, players: 12 }],
        legacyNotes: ['2025–26 Net Minder (Dan Dorsey): old site said "Cobalt Comets", linked to Brimley Badgers, his team at season end'],
    });

    const teams = await db.select().from(schema.teamSeasons).orderBy(asc(schema.teamSeasons.franchiseId));
    assert.deepEqual(
        teams.map((ts) => [ts.franchiseId, ts.name, ts.abbreviation, ts.division, ts.divisionRank, ts.wins, ts.losses, ts.ties, ts.fptsFor, ts.fptsAgainst]),
        [
            [1, 'Ashgrove Anglers', 'ASH', 1, 1, 30, 14, 2, 4600.5, 4000],
            [2, 'Brimley Badgers', 'BRIM', 1, 2, 27, 16, 3, 4450.25, 4100],
            [3, 'Cobalt Comets', 'COB', 1, 3, 24, 19, 3, 4300, 4250.75],
            [4, 'Dunmore Drakes', 'DUN', 1, 4, 22, 21, 3, 4200, 4300],
            [5, 'Elmsford Eels', 'ELM', 1, 5, 18, 25, 3, 4000, 4400.5],
            [6, 'Fernvale Foxes', 'FERN', 1, 6, 15, 28, 3, 3900.75, 4500],
        ],
    );
    const franchiseOf = new Map(teams.map((ts) => [ts.id, ts.franchiseId]));
    const franchise = (teamSeasonId: number | null) => (teamSeasonId === null ? null : franchiseOf.get(teamSeasonId));

    const games = await db.select().from(schema.matchups);
    const bracket = games
        .map((g) => ({ round: g.round, bracket: g.bracket, slot: g.slot, away: franchise(g.awayTeamSeasonId), home: franchise(g.homeTeamSeasonId), winner: franchise(g.winnerTeamSeasonId) }))
        .sort((a, b) => a.bracket.localeCompare(b.bracket) || a.round - b.round || a.slot - b.slot);
    assert.deepEqual(bracket, [
        // the final's away team (Cobalt) came through the second exported semifinal, so that one is drawn first
        { round: 1, bracket: 'championship', slot: 0, away: 3, home: 2, winner: 3 },
        { round: 1, bracket: 'championship', slot: 1, away: 4, home: 1, winner: 1 },
        { round: 2, bracket: 'championship', slot: 0, away: 3, home: 1, winner: 1 },
        { round: 1, bracket: 'consolation', slot: 0, away: 6, home: 5, winner: 6 },
    ]);

    const [seasonResult] = await db.select().from(schema.seasonResults);
    assert.equal(seasonResult.seasonYear, 2026);
    assert.equal(franchise(seasonResult.championTeamSeasonId), 1);
    assert.equal(franchise(seasonResult.runnerUpTeamSeasonId), 3);

    const events = await db.select().from(schema.transactionEvents);
    assert.deepEqual(events.map((e) => [e.seasonYear, e.kind, e.occurredOn, e.sourceFile]), [[2026, 'trade', '2026-01-12', '2025-2026 Trades.csv']]);
    const assets = await db.select().from(schema.transactionAssets).orderBy(asc(schema.transactionAssets.sourceRow));
    assert.deepEqual(assets.map((a) => [a.playerId, a.action, a.fromFranchiseId, a.toFranchiseId]), [
        ['0fx08', 'trade', 3, 4],
        ['0fx06', 'trade', 4, 3],
    ]);
    const picks = await db.select().from(schema.draftPicks).orderBy(asc(schema.draftPicks.overall));
    assert.deepEqual(picks.map((p) => [p.overall, p.playerId, p.franchiseId, p.developmentFacts?.nhlId]), [
        [1, '0fx0a', 6, 9001],
        [2, '0fx09', 5, 9002],
        [3, '0fx07', 4, 9003],
        [4, '0fx05', 3, 9004],
        [5, '0fx03', 2, 9005],
        [6, '0fx02', 1, 9006],
        // an empty selection ("*") stays in the draft ledger with no player
        [7, null, 6, undefined],
    ]);
});
