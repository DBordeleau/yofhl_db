import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import * as schema from '../../../db/schema';
import type { NhlProfile, NhlSeasonStats } from '../../../lib/keepers/player-details';
import type { Db } from './connect';
import { enrichDraftDevelopment, priorNhlGames } from './draft-development';
import { writeHistory, type HistoryImport } from './history';
import { draftRegretEligible } from '../../../lib/draft/development';

const row = (season: number, gamesPlayed: number, team = 'Team', leagueAbbrev = 'NHL', gameTypeId = 2): NhlSeasonStats =>
    ({ season, gamesPlayed, leagueAbbrev, gameTypeId, teamName: { default: team } });
const profile = (seasonTotals: NhlSeasonStats[]): NhlProfile =>
    ({ playerId: 1, firstName: { default: 'Test' }, lastName: { default: 'Player' }, position: 'D', birthDate: '2001-01-01', seasonTotals });

test('experience combines traded teams once and excludes playoffs, other leagues and future games', () => {
    const player = profile([row(20222023, 10, 'A'), row(20222023, 20, 'B'), row(20222023, 30, '2 Teams'),
        row(20232024, 5, 'A'), row(20232024, 7, 'B'), row(20232024, 50, 'Farm', 'AHL'), row(20232024, 10, 'A', 'NHL', 3), row(20242025, 82)]);
    const log = { gameLog: [{ gameDate: '2024-10-01' }, { gameDate: '2024-10-04' }, { gameDate: '2024-10-06' }] };
    assert.equal(priorNhlGames(player, 2025, '2024-10-04', log), 43);
    assert.equal(priorNhlGames(profile([]), 2025, '2024-09-21', { gameLog: [] }), 0);
    assert.throws(() => priorNhlGames(profile([row(20232024, NaN)]), 2025, '2024-09-21', { gameLog: [] }), /Incomplete/);
});

test('migration backfills existing picks by season, identity and draft date', async () => {
    const client = new PGlite();
    try {
        const migrations = readMigrationFiles({ migrationsFolder: 'db/migrations' });
        for (const migration of migrations.slice(0, 9)) for (const sql of migration.sql) await client.exec(sql);
        await client.exec(`
            INSERT INTO league.seasons (year, label, playoff_status) VALUES (2025, '2024–25', 'complete'), (2026, '2025–26', 'complete');
            INSERT INTO league.players (id, name) VALUES ('*04yu6*', 'Jamie Drysdale'), ('unknown', 'Unknown');
            INSERT INTO league.draft_picks (season_year, overall, round, pick, player_id, player_name, positions, drafted_on, source_time, source_file) VALUES
                (2025, 59, 5, 11, '*04yu6*', 'Jamie Drysdale', 'D', '2024-09-21', 'draft', 'draft.csv'),
                (2026, 70, 6, 10, '*04yu6*', 'Jamie Drysdale', 'D', '2025-10-04', 'draft', 'draft.csv'),
                (2025, 60, 5, 12, '*04yu6*', 'Jamie Drysdale', 'D', '2024-09-22', 'draft', 'draft.csv'),
                (2025, 61, 5, 13, 'unknown', 'Unknown', 'D', '2024-09-21', 'draft', 'draft.csv');
        `);
        for (const sql of migrations[9].sql) await client.exec(sql);
        const db = drizzle(client, { schema });
        const picks = await db.select().from(schema.draftPicks);
        const young = picks.find(p => p.overall === 59)!;
        const next = picks.find(p => p.overall === 70)!;
        assert.equal(young.developmentFacts?.birthDate, '2002-04-08');
        assert.equal(draftRegretEligible({ ...young, year: 2025 }, young.developmentFacts), false);
        assert.equal(next.developmentFacts?.priorNhlGames, 217);
        assert.equal(draftRegretEligible({ ...next, year: 2026 }, next.developmentFacts), true);
        assert.ok(picks.filter(p => p.overall === 60 || p.overall === 61).every(p => p.developmentFacts === null));
        await enrichDraftDevelopment(db as unknown as Db, [young, next], async () => { throw new Error('Backfilled picks must reimport offline'); });
    } finally { await client.close(); }
});

test('imports persist facts, reuse them offline, enrich new seasons, and stop safely on failed lookups', async () => {
    const client = new PGlite();
    try {
        const db = drizzle(client, { schema });
        const connection = db as unknown as Db;
        await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
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
    } finally { await client.close(); }
});
