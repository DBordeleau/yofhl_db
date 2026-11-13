import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { archiveCompletedQuery, cancelQuery, drawQuery, editQuery, lotteryLogosQuery, publicLotteryQuery } from './queries';
import { easternInput, publicLottery, type LotteryEntry, type LotteryInput, type LotteryRecord } from './model';
import { disposableLeague } from '../testing/disposable-league';

// Franchises as [id, logo], and team seasons as [franchise, season, logo].
async function seedTeams(db: PGlite, franchises: [number, string | null][], seasons: [number, number, string | null][] = []) {
    await db.exec('insert into league.seasons values (2025, \'2024–25\', \'complete\'), (2026, \'2025–26\', \'complete\')');
    for (const [id, logo] of franchises) {
        await db.query('insert into league.franchises (id, display_name, logo_url, first_season) values ($1, $2, $3, 2025)', [id, `Franchise ${id}`, logo]);
    }
    for (const [franchise, year, logo] of seasons) {
        await db.query(`insert into league.team_seasons (season_year, franchise_id, name, fantrax_name, abbreviation, logo_url,
            division, division_rank, wins, losses, ties, fpts_for, fpts_against) values ($1, $2, $3, $3, $4, $5, 1, 1, 0, 0, 0, 0, 0)`,
            [year, franchise, `Team ${franchise}`, `T${franchise}`, logo]);
    }
}

test('database enforces one draw, edit/cancel deadlines, stale version protection and one current event', async t => {
    const db = (await disposableLeague(t)).client;
    const dialect = new PgDialect();
    const run = (query: SQL) => { const { sql, params } = dialect.sqlToQuery(query); return db.query(sql, params); };
    const id = '00000000-0000-4000-8000-000000000001';
    const entries: LotteryEntry[] = [40, 30, 20, 10, null].map((odds, i) => ({ id: i + 1, name: `Team ${i}`, abbreviation: `T${i}`, logo: null, odds }));
    await seedTeams(db, [1, 2, 3, 4, 5].map(id => [id, null]));
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
});

test('lottery logos match team pages and repair saved snapshots without changing the draw', async t => {
    const db = (await disposableLeague(t)).client;
    await seedTeams(db, [[1, '/franchise.png'], [2, '/fallback.png'], [3, null], [4, null]],
        [[1, 2025, '/old.png'], [1, 2026, '/current.png'], [2, 2026, null]]);
    const entries: LotteryEntry[] = [1, 2, 3, 4, 5].map((id) => ({ id, name: `Saved team ${id}`, abbreviation: `T${id}`, logo: id >= 3 && id !== 4 ? '/saved.png' : null, odds: id <= 4 ? 25 : null }));
    const { sql: query, params } = new PgDialect().sqlToQuery(lotteryLogosQuery(entries));
    const result = (await db.query<LotteryEntry>(query, params)).rows;
    assert.deepEqual(result, entries.map((entry, index) => ({ ...entry, logo: ['/current.png', '/fallback.png', '/saved.png', null, '/saved.png'][index] })));
    assert.equal(entries[0].logo, null, 'saved entries are not mutated');
    await db.exec("insert into league.team_management (franchise_id, logo_url) values (1, '/owner.webp')");
    const updated = (await db.query<LotteryEntry>(query, params)).rows;
    assert.equal(updated[0].logo, '/owner.webp');
    assert.equal(updated[0].name, entries[0].name, 'saved event names are preserved');
});

test('public read returns event, artwork and database clock together, including empty and cancelled events', async t => {
    const league = await disposableLeague(t, { app: true });
    const db = league.client;
    const { getPublicLottery } = await import('./data');
    // The app's queries since the count was last reset.
    let since = 0;
    const queries = () => league.queries() - since;
    const read = async (id?: string) => {
        const { sql, params } = new PgDialect().sqlToQuery(publicLotteryQuery(id));
        return (await db.query<{ now: Date; record: LotteryRecord | null }>(sql, params)).rows[0];
    };
    const id = '00000000-0000-4000-8000-000000000001';
    const entries: LotteryEntry[] = [2, 1].map(id => ({ id, name: `Saved ${id}`, abbreviation: `T${id}`, odds: 50, logo: null }));
    await seedTeams(db, [[1, '/fallback.png'], [2, null]], [[2, 2025, '/old.png'], [2, 2026, '/latest.png']]);
    await db.exec("insert into league.team_management (franchise_id, logo_url) values (1, '/owner.webp')");
    const empty = await read();
    assert.equal(empty.record, null);
    assert.ok(Number.isFinite(new Date(empty.now).getTime()));
    assert.equal((await getPublicLottery()).lottery, null);
    assert.equal(queries(), 1, 'no event needs only one database read');
    await db.query(`insert into league.draft_lotteries (id,title,starts_at,entries)
        values ($1,'Test',clock_timestamp()+interval '1 hour',$2::jsonb)`, [id, JSON.stringify(entries)]);
    const current = await read();
    assert.equal(current.record?.id, id);
    assert.equal(current.record?.version, 1);
    assert.deepEqual(current.record?.entries, entries.map(entry => ({ ...entry, logo: entry.id === 1 ? '/owner.webp' : '/latest.png' })));
    assert.equal(publicLottery(current.record!, new Date(current.now).getTime()).phase, 'scheduled');
    since = league.queries();
    assert.equal((await getPublicLottery()).lottery?.phase, 'scheduled');
    assert.equal(queries(), 1, 'ordinary polls use one database read');
    await db.query(`update league.draft_lotteries set starts_at=clock_timestamp()-interval '1 second' where id=$1`, [id]);
    since = league.queries();
    assert.equal((await getPublicLottery()).lottery?.winnerId, null);
    assert.equal(queries(), 3, 'a draw uses one read, one guarded write and one fresh read');
    const live = await read();
    assert.ok([1, 2].includes(live.record!.winnerId!));
    assert.equal(publicLottery(live.record!, new Date(live.now).getTime()).winnerId, null, 'new query still goes through timed redaction');
    since = league.queries();
    await getPublicLottery();
    assert.equal(queries(), 1, 'subsequent viewers do not draw again');
    await db.query(`update league.draft_lotteries set is_current=false where id=$1`, [id]);
    assert.equal((await read()).record, null);
    assert.equal((await read(id)).record?.id, id, 'historical events remain available by ID');
    await db.query(`update league.draft_lotteries set cancelled_at=clock_timestamp() where id=$1`, [id]);
    assert.equal((await read(id)).record, null);
});

// The admin's save and cancel, driven through the app as the server actions call them.
async function adminLeague(t: TestContext) {
    const league = await disposableLeague(t, { app: true });
    await seedTeams(league.client, [1, 2, 3].map(id => [id, null]));
    const admin = await import('./admin');
    const lotteries = async () => (await league.client.query<{ id: string; title: string; version: number; is_current: boolean; cancelled_at: Date | null }>(
        'select id, title, version, is_current, cancelled_at from league.draft_lotteries order by title')).rows;
    return { league, admin, lotteries };
}
const UNSAVED = { error: 'Unable to save. Another scheduled lottery may already exist; reload and try again.' };
const inHours = (hours: number) => easternInput(new Date(Date.now() + hours * 3600_000).toISOString());
const draw = [{ id: 1, odds: 60 }, { id: 2, odds: 40 }, { id: 3, odds: null }];
const input = (overrides: Partial<LotteryInput> = {}): LotteryInput =>
    ({ id: null, version: 0, title: 'Draft lottery', easternDateTime: inHours(2), entries: draw, ...overrides });

test('scheduling a lottery with none current makes it current and returns it as the editor shows it', async t => {
    const { admin, lotteries } = await adminLeague(t);
    const { lottery, error } = await admin.saveLottery(input({ title: '  Draft lottery  ' }));
    assert.equal(error, undefined);
    assert.equal(lottery?.title, 'Draft lottery');
    assert.equal(lottery?.version, 1);
    assert.equal(lottery?.isCurrent, true);
    assert.equal(lottery?.winnerId, null);
    assert.equal(lottery?.cancelledAt, null);
    assert.equal(easternInput(lottery!.startsAt), input().easternDateTime);
    assert.deepEqual(lottery?.entries.map(entry => [entry.id, entry.name, entry.odds]), [[1, 'Franchise 1', 60], [2, 'Franchise 2', 40], [3, 'Franchise 3', null]]);
    assert.deepEqual((await lotteries()).map(row => [row.id, row.is_current]), [[lottery!.id, true]]);
});

// A drawn lottery that started `ago` ago; a three-team draw finishes revealing 27 seconds after it starts.
async function drawnLottery(client: PGlite, ago: string) {
    const entries = draw.map(({ id, odds }) => ({ id, name: `Franchise ${id}`, abbreviation: `T${id}`, logo: null, odds }));
    return (await client.query<{ id: string }>(`insert into league.draft_lotteries (title, starts_at, entries, winner_id, drawn_at)
        values ('Earlier', clock_timestamp() - $1::interval, $2::jsonb, 1, clock_timestamp() - $1::interval) returning id`,
        [ago, JSON.stringify(entries)])).rows[0].id;
}

test('scheduling a lottery archives a finished one, but never one still being revealed', async t => {
    const { league, admin, lotteries } = await adminLeague(t);
    const earlier = await drawnLottery(league.client, '10 seconds');
    assert.deepEqual(await admin.saveLottery(input()), UNSAVED);
    assert.deepEqual((await lotteries()).map(row => [row.title, row.is_current, row.version]), [['Earlier', true, 1]], 'the live lottery is untouched');

    await league.client.query(`update league.draft_lotteries set starts_at = clock_timestamp() - interval '1 hour' where id = $1`, [earlier]);
    league.failNextQuery('insert into league.draft_lotteries', Object.assign(new Error('connection lost'), { code: '08006' }));
    assert.deepEqual(await admin.saveLottery(input()), UNSAVED);
    assert.deepEqual((await lotteries()).map(row => [row.title, row.is_current]), [['Earlier', true]], 'a failed insert leaves the finished lottery current');

    const { lottery } = await admin.saveLottery(input());
    assert.deepEqual((await lotteries()).map(row => [row.title, row.is_current]), [['Draft lottery', true], ['Earlier', false]]);
    assert.equal(lottery?.isCurrent, true);
});

test('a lottery with a bad title, too little notice or broken entries is refused with its reason and nothing is written', async t => {
    const { admin, lotteries } = await adminLeague(t);
    const refusals: [Partial<LotteryInput>, string][] = [
        [{ title: '   ' }, 'Give the lottery a title of 1–80 characters.'],
        [{ title: 'x'.repeat(81) }, 'Give the lottery a title of 1–80 characters.'],
        [{ easternDateTime: inHours(0.5 / 60) }, 'Schedule the lottery at least one minute in the future.'],
        [{ easternDateTime: inHours(-1) }, 'Schedule the lottery at least one minute in the future.'],
        [{ easternDateTime: 'tomorrow' }, 'Choose a valid date and time in Eastern Time.'],
        [{ entries: [{ id: 1, odds: 60 }, { id: 2, odds: 40 }, { id: 9, odds: null }] }, 'Each team must appear exactly once.'],
        [{ entries: [{ id: 1, odds: 60 }, { id: 2, odds: 30 }, { id: 3, odds: null }] }, 'Lottery odds must add up to exactly 100%.'],
        [{ entries: draw.slice(0, 2) }, 'Include every active team exactly once in the starting draft order.'],
    ];
    for (const [overrides, error] of refusals) assert.deepEqual(await admin.saveLottery(input(overrides)), { error }, JSON.stringify(overrides));
    assert.deepEqual(await lotteries(), []);
});

test('editing a lottery needs its current version and must happen before it starts', async t => {
    const { league, admin, lotteries } = await adminLeague(t);
    const { lottery } = await admin.saveLottery(input());
    const changed = 'This lottery has started or was changed in another tab. Reload before editing.';
    const { lottery: edited } = await admin.saveLottery(input({ id: lottery!.id, version: 1, title: 'Edited' }));
    assert.deepEqual([edited?.title, edited?.version, edited?.isCurrent], ['Edited', 2, true]);
    assert.deepEqual(await admin.saveLottery(input({ id: lottery!.id, version: 1, title: 'Stale tab' })), { error: changed });
    await league.client.query(`update league.draft_lotteries set starts_at = clock_timestamp() - interval '1 second'`);
    assert.deepEqual(await admin.saveLottery(input({ id: lottery!.id, version: 2, title: 'Too late' })), { error: changed });
    assert.deepEqual((await lotteries()).map(row => [row.title, row.version]), [['Edited', 2]]);
});

test('cancelling a lottery needs its current version and must happen before it starts', async t => {
    const { league, admin, lotteries } = await adminLeague(t);
    const reload = { error: 'This lottery has started or changed. Reload the page.' };
    const { lottery } = await admin.saveLottery(input());
    await admin.saveLottery(input({ id: lottery!.id, version: 1, title: 'Edited' }));
    assert.deepEqual(await admin.cancelLottery(lottery!.id, 1), reload, 'a stale version');
    const { lottery: next } = await admin.saveLottery(input({ id: lottery!.id, version: 2, title: 'Edited again' }));
    await league.client.query(`update league.draft_lotteries set starts_at = clock_timestamp() - interval '1 second'`);
    assert.deepEqual(await admin.cancelLottery(next!.id, 3), reload, 'after the start');
    assert.equal((await lotteries())[0].cancelled_at, null);

    await league.client.query(`update league.draft_lotteries set starts_at = clock_timestamp() + interval '1 hour'`);
    assert.deepEqual(await admin.cancelLottery(next!.id, 3), { success: true });
    const [cancelled] = await lotteries();
    assert.deepEqual([cancelled.is_current, cancelled.version], [false, 4]);
    assert.ok(cancelled.cancelled_at);
});

test('a database or connection failure is never shown to the admin', async t => {
    const { league, admin } = await adminLeague(t);
    league.failNextQuery('clock_timestamp() as now', new TypeError('fetch failed: getaddrinfo ENOTFOUND ep-secret.neon.tech'));
    assert.deepEqual(await admin.saveLottery(input()), UNSAVED);
    league.failNextQuery('current_teams', Object.assign(new Error('relation "league.current_teams" does not exist'), { code: '42P01' }));
    assert.deepEqual(await admin.saveLottery(input()), UNSAVED);
    const { lottery } = await admin.saveLottery(input());
    league.failNextQuery('update league.draft_lotteries', Object.assign(new Error('Failed query: update league.draft_lotteries set title = $1'), { query: 'update' }));
    assert.deepEqual(await admin.saveLottery(input({ id: lottery!.id, version: 1 })), UNSAVED);
});
