import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { archiveCompletedQuery, cancelQuery, drawQuery, editQuery, lotteryLogosQuery } from './queries';
import type { LotteryEntry } from './model';

test('database enforces one draw, edit/cancel deadlines, stale version protection and one current event', async () => {
    // In-memory Postgres: these tests never connect to the league database.
    const db = new PGlite();
    const dialect = new PgDialect();
    const run = (query: SQL) => { const { sql, params } = dialect.sqlToQuery(query); return db.query(sql, params); };
    const id = '00000000-0000-4000-8000-000000000001';
    const entries: LotteryEntry[] = [40, 30, 20, 10, null].map((odds, i) => ({ id: i + 1, name: `Team ${i}`, abbreviation: `T${i}`, logo: null, odds }));
    try {
        await db.exec('create schema league; create table league.franchises (id integer primary key); insert into league.franchises values (1),(2),(3),(4),(5);');
        await db.exec(readFileSync('db/migrations/0003_draft_lotteries.sql', 'utf8'));
        await db.query(`insert into league.draft_lotteries (id,title,starts_at,entries) values ($1,'Test',clock_timestamp()+interval '1 hour',$2::jsonb)`, [id, JSON.stringify(entries)]);
        assert.equal((await run(drawQuery(id, 1, 2))).rows.length, 0, 'cannot draw early');
        await assert.rejects(db.query(`insert into league.draft_lotteries (title,starts_at,entries) values ('Duplicate',now(),$1::jsonb)`, [JSON.stringify(entries)]), /unique/);
        const future = new Date(Date.now() + 7200_000).toISOString();
        assert.equal((await run(editQuery(id, 1, 'Edited', future, entries))).rows.length, 1);
        assert.equal((await run(editQuery(id, 1, 'Stale', future, entries))).rows.length, 0);
        assert.equal((await run(cancelQuery(id, 1))).rows.length, 0);
        await db.query(`update league.draft_lotteries set starts_at = clock_timestamp()-interval '1 second' where id=$1`, [id]);
        assert.equal((await run(drawQuery(id, 1, 2))).rows.length, 0, 'old configuration cannot draw');
        assert.equal((await run(editQuery(id, 2, 'Too late', future, entries))).rows.length, 0);
        assert.equal((await run(cancelQuery(id, 2))).rows.length, 0);
        const attempts = await Promise.all(Array.from({ length: 20 }, (_, i) => run(drawQuery(id, 2, i % 4 + 1))));
        assert.equal(attempts.reduce((sum, attempt) => sum + attempt.rows.length, 0), 1, 'only one competing draw persists');
        const result = (await db.query<{ winner_id: number; drawn_at: Date }>('select winner_id, drawn_at from league.draft_lotteries')).rows[0];
        assert.equal(result.winner_id, 1);
        assert.ok(result.drawn_at);
        await run(archiveCompletedQuery());
        assert.equal((await db.query<{ is_current: boolean }>('select is_current from league.draft_lotteries')).rows[0].is_current, true, 'cannot replace live event');
        await db.query(`update league.draft_lotteries set starts_at=clock_timestamp()-interval '42 seconds' where id=$1`, [id]);
        await run(archiveCompletedQuery());
        assert.equal((await db.query<{ is_current: boolean }>('select is_current from league.draft_lotteries')).rows[0].is_current, true, 'the longer reveal must finish before archiving');
        await db.query(`update league.draft_lotteries set starts_at=clock_timestamp()-interval '48 seconds' where id=$1`, [id]);
        await run(archiveCompletedQuery());
        assert.equal((await db.query<{ is_current: boolean }>('select is_current from league.draft_lotteries')).rows[0].is_current, false, 'four lottery positions finish after 47 seconds, regardless of fixed teams');
        const nextId = '00000000-0000-4000-8000-000000000002';
        await db.query(`insert into league.draft_lotteries (id,title,starts_at,entries) values ($1,'Next',clock_timestamp()+interval '1 hour',$2::jsonb)`, [nextId, JSON.stringify(entries)]);
        assert.equal((await run(cancelQuery(nextId, 1))).rows.length, 1);
        await db.query(`update league.draft_lotteries set starts_at=clock_timestamp()-interval '1 hour' where id=$1`, [nextId]);
        assert.equal((await run(drawQuery(nextId, 2, 1))).rows.length, 0, 'cancelled event cannot draw');
    } finally { await db.close(); }
});

test('lottery logos match team pages and repair saved snapshots without changing the draw', async () => {
    const db = new PGlite();
    try {
        await db.exec(`create schema league;
            create table league.franchises (id integer primary key, logo_url text);
            create table league.team_seasons (franchise_id integer, season_year integer, logo_url text);
            insert into league.franchises values (1, '/franchise.png'), (2, '/fallback.png'), (3, null), (4, null);
            insert into league.team_seasons values (1, 2025, '/old.png'), (1, 2026, '/current.png'), (2, 2026, null);`);
        const entries: LotteryEntry[] = [1, 2, 3, 4, 5].map((id) => ({ id, name: `Saved team ${id}`, abbreviation: `T${id}`, logo: id >= 3 && id !== 4 ? '/saved.png' : null, odds: id <= 4 ? 25 : null }));
        const { sql: query, params } = new PgDialect().sqlToQuery(lotteryLogosQuery(entries));
        const result = (await db.query<LotteryEntry>(query, params)).rows;
        assert.deepEqual(result, entries.map((entry, index) => ({ ...entry, logo: ['/current.png', '/fallback.png', '/saved.png', null, '/saved.png'][index] })));
        assert.equal(entries[0].logo, null, 'saved entries are not mutated');
    } finally { await db.close(); }
});
