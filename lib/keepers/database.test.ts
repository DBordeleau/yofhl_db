import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';
import { CALDER_SEASON, KEEPER_DEADLINE, type KeeperSubmission } from './model';
import { keeperSubmissionQuery, reviewRookieQuery, saveKeepersQuery } from './queries';

test('keeper persistence enforces ownership, concurrent edits, DB deadline and durable rookie decisions', async () => {
    const client = new PGlite();
    const db = drizzle(client);
    // Move only the deadline bind value for deterministic DB-clock tests in any calendar year.
    const run = async (query: SQL, closed = false) => {
        const compiled = new PgDialect().sqlToQuery(query);
        const deadline = new Date(Date.now() + (closed ? -60000 : 60000)).toISOString();
        return (await client.query<KeeperSubmission>(compiled.sql, compiled.params.map(value => value === KEEPER_DEADLINE ? deadline : value))).rows;
    };
    try {
        await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
        await db.execute(sql`insert into league.franchises(id, display_name, first_season, folded_after_season)
            values (1, 'First', 2026, null), (2, 'Second', 2026, null), (3, 'Folded', 2026, 2026)`);
        await db.execute(sql`insert into league.team_management(franchise_id, owner_uid) values (1, 'owner'), (2, 'other'), (3, 'former')`);
        const roster = [{ id: 'rookie', name: 'Rookie Player', position: 'C', lineupPosition: 'C', status: 'ACTIVE', nhlTeam: 'NHL' }];
        const input = { franchiseId: 1, uid: 'owner', version: 0, roster, selection: { keptIds: ['rookie'], rookieId: 'rookie', rookieDeclared: true, rookieSeason: CALDER_SEASON } };
        assert.equal((await run(saveKeepersQuery({ ...input, uid: 'intruder' }))).length, 0);
        assert.equal((await run(saveKeepersQuery({ ...input, franchiseId: 3, uid: 'former' }))).length, 0);
        assert.equal((await run(saveKeepersQuery(input), true)).length, 0, 'late initial submission rejected');
        assert.equal((await run(saveKeepersQuery({ ...input, version: 5 }))).length, 0, 'cannot create from stale nonzero version');
        const first = await Promise.all([run(saveKeepersQuery(input)), run(saveKeepersQuery(input))]);
        assert.equal(first.flat().length, 1, 'only one initial submission wins');
        assert.equal(first.flat()[0].version, 1);
        assert.deepEqual(first.flat()[0].roster, roster, 'snapshot persisted');
        assert.equal((await run(saveKeepersQuery({ ...input, version: 1 }), true)).length, 0, 'late update rejected');
        assert.equal((await run(saveKeepersQuery({ ...input, version: 1, uid: 'other' }))).length, 0);
        const competing = await Promise.all([run(saveKeepersQuery({ ...input, version: 1 })), run(saveKeepersQuery({ ...input, version: 1 }))]);
        assert.equal(competing.flat().length, 1, 'only one revision wins');
        const rejection = { franchiseId: 1, version: 2, rookieId: 'rookie', status: 'rejected' as const, note: 'Not Calder eligible' };
        assert.equal((await run(reviewRookieQuery({ ...rejection, version: 1 }))).length, 0, 'stale admin review cannot apply');
        assert.equal((await run(reviewRookieQuery({ ...rejection, rookieId: 'other-player' }))).length, 0);
        const [reviewed] = await run(reviewRookieQuery(rejection));
        assert.equal(reviewed.rookieReviews.rookie?.status, 'rejected');
        assert.equal(reviewed.rookieReviews.rookie?.calderSeason, CALDER_SEASON);
        assert.equal((await run(saveKeepersQuery({ ...input, version: 2 }))).length, 0, 'review invalidates owner revision');
        assert.equal((await run(saveKeepersQuery({ ...input, version: 3 }))).length, 0, 'rejected rookie cannot be resubmitted');
        const [corrected] = await run(saveKeepersQuery({ ...input, version: 3, selection: { ...input.selection, rookieId: null, rookieDeclared: false } }));
        assert.equal(corrected.version, 4); assert.equal(corrected.rookieReviews.rookie?.status, 'rejected', 'owner cannot erase decisions');
        assert.equal((await run(saveKeepersQuery({ ...input, version: 4 }))).length, 0, 'switching back cannot bypass rejection');
        await db.execute(sql`update league.franchises set display_name = 'Imported name' where id = 1`);
        assert.equal((await run(keeperSubmissionQuery(1)))[0].keptIds[0], 'rookie', 'imports and renames preserve lists');
    } finally { await client.close(); }
});
