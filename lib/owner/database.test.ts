import test from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { hashCode, invitation, teamName } from './model';
import { claimTeamQuery, issueInviteQuery, ownedTeamQuery, rateLimitQuery } from './queries';
import { disposableLeague } from '../testing/disposable-league';

test('owner invitations, claims, lookups and rate limits', async t => {
    const { db } = await disposableLeague(t);
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
    assert.deepEqual((await db.execute(ownedTeamQuery(owner))).rows.map(team => team.id), [1]);
    assert.equal((await db.execute(ownedTeamQuery('unclaimed'))).rows.length, 0, 'private lookup does not return another owner’s team');
    assert.equal((await db.execute(issueInviteQuery(1, hashCode(first)))).rows.length, 0, 'cannot re-invite a claimed team');
    assert.equal((await db.execute(claimTeamQuery(hashCode(second), 'c', 'c@example.test'))).rows.length, 0, 'consumed code cannot claim');
    await db.execute(issueInviteQuery(2, hashCode(first)));
    assert.equal((await db.execute(claimTeamQuery(hashCode(first), owner, 'a@example.test'))).rows.length, 0, 'one account cannot claim two teams');
    await db.execute(sql`update league.team_management set invite_expires_at = now() - interval '1 second' where franchise_id = 2`);
    assert.equal((await db.execute(claimTeamQuery(hashCode(first), 'c', 'c@example.test'))).rows.length, 0, 'expired invitation cannot claim');

    await db.execute(sql`update league.franchises set folded_after_season = 2027 where id = 1`);
    assert.equal((await db.execute(ownedTeamQuery(owner))).rows.length, 0, 'private lookup excludes folded teams');

    assert.equal((await db.execute(rateLimitQuery('test'))).rows[0].attempts, 1);
    assert.equal((await db.execute(rateLimitQuery('test'))).rows[0].attempts, 2);
    await db.execute(sql`update league.owner_rate_limits set resets_at = now() - interval '1 second'`);
    assert.equal((await db.execute(rateLimitQuery('test'))).rows[0].attempts, 1);
});

test('team names are normalized and bounded', () => {
    assert.equal(teamName('  New   Team  '), 'New Team');
    for (const name of ['', 'A', 'x'.repeat(61), 'Name\u0000']) assert.throws(() => teamName(name));
});
