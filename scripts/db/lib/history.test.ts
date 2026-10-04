import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import type { Db } from './connect';
import { exportDate, groupAssets, resolvePlayer, writeHistory, type HistoryImport } from './history';
import { visibleTransactionEvents } from '@/lib/history/visibility';

test('export timestamps honor their explicit offset, including midnight and noon', () => {
    assert.equal(exportDate('Thu Feb 14, 2019, 11:05PM', 'EDT').occurredAt, '2019-02-15T03:05:00.000Z');
    assert.equal(exportDate('Tue Jan 1, 2019, 12:00AM', 'EST').occurredAt, '2019-01-01T05:00:00.000Z');
    assert.equal(exportDate('Tue Jan 1, 2019, 12:00PM', 'EST').occurredAt, '2019-01-01T17:00:00.000Z');
    assert.deepEqual(exportDate('Oct 4, 2025 7:31:51'), { occurredOn: '2025-10-04', occurredAt: null });
    assert.throws(() => exportDate('Feb 30, 2025 7:31:51'));
});

test('players sharing names resolve by season, NHL team and position, never a fuzzy guess', () => {
    const catalog = [
        { id: 'forward', name: 'Sebastian Aho', season: 2026, teams: ['CAR'], positions: ['C'] },
        { id: 'defense', name: 'Sebastian Aho', season: 2026, teams: ['PIT'], positions: ['D'] },
    ];
    assert.equal(resolvePlayer(catalog, 'Sebastian Aho', 'CAR', 'C', 2026), 'forward');
    assert.equal(resolvePlayer(catalog, 'Sebastian Aho', 'PIT', 'D', 2026), 'defense');
    assert.throws(() => resolvePlayer(catalog, 'Sebastian Aho', '', '', 2026));
    assert.throws(() => resolvePlayer(catalog, 'Unknown Player', 'CAR', 'C', 2026));
});

const asset = (id: string, from: number | null, to: number | null) => ({ id, eventId: 'event', playerId: 'p', label: 'Player', assetKind: 'player' as const, action: 'trade' as const, fromFranchiseId: from, toFranchiseId: to, sourceRow: 2 });
test('trade grouping joins a three-team deal but separates unrelated simultaneous trades', () => {
    const groups = groupAssets([asset('a', 1, 2), asset('b', 3, 4), asset('c', 2, 5), asset('d', 5, 1), asset('e', 1, null)]);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((g) => g.length).sort(), [1, 4]);
});

test('the hidden October 20 batch leaves the earlier trade and same-time FA claims visible', async () => {
    const client = new PGlite();
    try {
        const result = await drizzle(client).execute(sql`
            with events(id, source_file, source_time) as (values
                ('hidden', '2019-2020 Trades.csv', 'Sun Oct 20, 2019, 11:05PM'),
                ('earlier-trade', '2019-2020 Trades.csv', 'Sun Oct 20, 2019, 3:30PM'),
                ('fa-claim', '2019-2020 FA Claims.csv', 'Sun Oct 20, 2019, 11:05PM'),
                ('other-date', '2019-2020 Trades.csv', 'Tue Oct 1, 2019, 11:05PM')
            ) select e.id from events e where ${visibleTransactionEvents} order by e.id`);
        assert.deepEqual(result.rows.map((row) => row.id), ['earlier-trade', 'fa-claim', 'other-date']);
    } finally { await client.close(); }
});

test('history import is repeatable and rolls back an invalid replacement', async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    try {
        await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
        await db.insert(schema.seasons).values({ year: 2026, label: '2025–26', playoffStatus: 'complete' });
        await db.insert(schema.franchises).values([{ id: 1, displayName: 'One', firstSeason: 2026 }, { id: 2, displayName: 'Two', firstSeason: 2026 }]);
        const data: HistoryImport = {
            players: [{ id: 'p', name: 'Player' }], skippedLineups: 0, transactionFiles: ['2025-2026 Trades.csv'], draftYears: [2026],
            events: [{ id: 'event', seasonYear: 2026, kind: 'trade', occurredAt: '2026-01-01T12:00:00Z', occurredOn: '2026-01-01', sourceFile: '2025-2026 Trades.csv', sourceTime: 'Thu Jan 1, 2026, 8:00AM' }],
            assets: [asset('a', 1, 2)],
            picks: [{ seasonYear: 2026, overall: 1, round: 1, pick: 1, franchiseId: 1, teamName: 'One', playerId: 'p', playerName: 'Player', positions: 'C', draftedOn: '2025-10-04', sourceTime: 'Oct 4, 2025 7:31:51', sourceFile: '2025-2026 draft.csv' }],
        };
        await writeHistory(db as unknown as Db, data);
        await writeHistory(db as unknown as Db, data);
        assert.equal((await db.select().from(schema.transactionEvents)).length, 1);
        assert.equal((await db.select().from(schema.transactionAssets)).length, 1);
        assert.equal((await db.select().from(schema.draftPicks)).length, 1);
        await assert.rejects(writeHistory(db as unknown as Db, { ...data, assets: [{ ...data.assets[0], playerId: 'missing' }] }));
        assert.equal((await db.select().from(schema.transactionAssets))[0].playerId, 'p');
        assert.equal((await db.select().from(schema.draftPicks)).length, 1);
    } finally { await client.close(); }
});
