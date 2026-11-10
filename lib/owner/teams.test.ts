import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { disposableLeague } from '../testing/disposable-league';

// Franchise 1 is owned and active, 2 is unclaimed, 3 is owned but folded.
const SEED = `
    insert into league.franchises (id, display_name, first_season, folded_after_season) values
        (1, 'Owned Club', 2026, null), (2, 'Open Club', 2026, null), (3, 'Folded Club', 2026, 2026);
    insert into league.team_management (franchise_id, owner_uid, owner_email) values
        (1, 'owner-1', 'one@example.test'), (3, 'owner-3', 'three@example.test');
`;

async function loaders(t: TestContext) {
    await disposableLeague(t, { app: true, seed: SEED });
    return import('./teams');
}

test('an owner reads the team their account manages', async t => {
    const { getOwnedTeam } = await loaders(t);
    const team = await getOwnedTeam('owner-1');
    assert.equal(team?.id, 1);
    assert.equal(team?.name, 'Owned Club');
    assert.equal(team?.ownerEmail, 'one@example.test');
});

test('an account with no team, or whose franchise folded, owns nothing', async t => {
    const { getOwnedTeam } = await loaders(t);
    assert.equal(await getOwnedTeam('nobody'), null);
    assert.equal(await getOwnedTeam('owner-3'), null);
});

test('the admin reads every managed team, active before folded', async t => {
    const { getManagedTeams } = await loaders(t);
    assert.deepEqual((await getManagedTeams()).map(team => [team.id, team.defunct]), [[1, false], [2, false], [3, true]]);
});

test('the admin reads one managed team by franchise id', async t => {
    const { getManagedTeam } = await loaders(t);
    assert.equal((await getManagedTeam(2))?.name, 'Open Club');
    assert.equal((await getManagedTeam(3))?.ownerUid, 'owner-3', 'a folded team is still readable');
    assert.equal(await getManagedTeam(99), null);
});
