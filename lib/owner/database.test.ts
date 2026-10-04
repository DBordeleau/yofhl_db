import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { sql } from 'drizzle-orm';
import { hashCode, invitation, teamName } from './model';
import { claimTeamQuery, issueInviteQuery, managedTeamsQuery, rateLimitQuery, saveTeamQuery, updateTeamQuery } from './queries';

test('owner permissions, invitations, concurrency and import preservation', async () => {
    const client = new PGlite();
    const db = drizzle(client);
    try {
        await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
        await db.execute(sql`insert into league.franchises(id, display_name, first_season, folded_after_season)
            values (1, 'Original', 2026, null), (2, 'Second', 2026, null), (3, 'Defunct', 2026, 2026)`);
        const first = invitation(); const second = invitation();
        assert.notEqual(first, second); assert.equal(first.length, 32);
        assert.equal((await db.execute(issueInviteQuery(3, hashCode(first)))).rows.length, 0, 'defunct teams cannot be invited');
        await db.execute(issueInviteQuery(1, hashCode(first)));
        await db.execute(issueInviteQuery(1, hashCode(second)));
        assert.equal((await db.execute(claimTeamQuery(hashCode(first), 'a', 'a@example.test'))).rows.length, 0, 'replaced invitation cannot claim');
        const claims = await Promise.all(['a', 'b'].map((uid) => db.execute(claimTeamQuery(hashCode(second), uid, `${uid}@example.test`))));
        assert.equal(claims.reduce((n, result) => n + result.rows.length, 0), 1, 'exactly one concurrent claim wins');
        const owner = claims[0].rows.length ? 'a' : 'b';
        assert.equal((await db.execute(issueInviteQuery(1, hashCode(first)))).rows.length, 0, 'cannot re-invite a claimed team');
        assert.equal((await db.execute(claimTeamQuery(hashCode(second), 'c', 'c@example.test'))).rows.length, 0, 'consumed code cannot claim');
        await db.execute(issueInviteQuery(2, hashCode(first)));
        assert.equal((await db.execute(claimTeamQuery(hashCode(first), owner, 'a@example.test'))).rows.length, 0, 'one account cannot claim two teams');
        await db.execute(sql`update league.team_management set invite_expires_at = now() - interval '1 second' where franchise_id = 2`);
        assert.equal((await db.execute(claimTeamQuery(hashCode(first), 'c', 'c@example.test'))).rows.length, 0, 'expired invitation cannot claim');

        const [team] = (await db.execute(managedTeamsQuery)).rows;
        const version = Number(team.version);
        assert.equal((await db.execute(updateTeamQuery(1, version, 'Hacked', null, 'intruder', false))).rows.length, 0, 'another owner cannot edit');
        assert.equal((await db.execute(updateTeamQuery(1, version, 'Hacked', null, null, false))).rows.length, 0, 'anonymous cannot edit');
        assert.equal((await db.execute(updateTeamQuery(1, version, 'New name', '/new.webp', owner, false))).rows.length, 1);
        assert.equal((await db.execute(updateTeamQuery(1, version, 'Stale edit', null, owner, false))).rows.length, 0, 'stale logo updates cannot overwrite newer edits');
        assert.equal((await db.execute(saveTeamQuery(3, 0, 'Hacked', null, false))).rows.length, 0, 'initial row creation also requires admin');
        assert.equal((await db.execute(saveTeamQuery(3, 0, 'Admin name', null, true))).rows.length, 1, 'admin can edit unclaimed defunct team');
        assert.equal((await db.execute(updateTeamQuery(1, version + 1, 'Admin name', '/admin.webp', null, true))).rows.length, 1, 'admin can edit claimed team');
        await db.execute(sql`update league.franchises set display_name = 'Imported name', logo_url = '/historical.png' where id = 1`);
        const [afterImport] = (await db.execute(managedTeamsQuery)).rows;
        assert.equal(afterImport.name, 'Admin name'); assert.equal(afterImport.logo, '/admin.webp'); assert.equal(afterImport.ownerUid, owner);
        await db.execute(sql`update league.franchises set folded_after_season = 2027 where id = 1`);
        assert.equal((await db.execute(updateTeamQuery(1, version + 2, 'Owner edit', null, owner, false))).rows.length, 0, 'former owner cannot edit folded team');

        assert.equal((await db.execute(rateLimitQuery('test'))).rows[0].attempts, 1);
        assert.equal((await db.execute(rateLimitQuery('test'))).rows[0].attempts, 2);
        await db.execute(sql`update league.owner_rate_limits set resets_at = now() - interval '1 second'`);
        assert.equal((await db.execute(rateLimitQuery('test'))).rows[0].attempts, 1);
    } finally { await client.close(); }
});

test('team names are normalized and bounded', () => {
    assert.equal(teamName('  New   Team  '), 'New Team');
    for (const name of ['', 'A', 'x'.repeat(61), 'Name\u0000']) assert.throws(() => teamName(name));
});
