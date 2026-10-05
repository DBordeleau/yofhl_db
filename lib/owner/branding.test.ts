import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { sql } from 'drizzle-orm';
import { parseTeamColours, type TeamColours } from '../team-branding';
import { managedTeamsQuery, saveBrandingQuery, updateTeamQuery } from './queries';

const colours: TeamColours = { primary: '#123ABC', secondary: '#D24015', tertiary: '#FFFFFF', treatment: 'stripes' };

test('branding validates colours and limits signatures to their franchises', () => {
    assert.deepEqual(parseTeamColours({ ...colours, primary: '#123abc' }, 1), colours);
    for (const value of [null, [], {}, { ...colours, primary: 'red' }, { ...colours, secondary: '#fff' }, { ...colours, tertiary: undefined }, { ...colours, primary: 'url(https://example.test)' }, { ...colours, treatment: 'unknown' }]) {
        assert.equal(parseTeamColours(value, 1), null);
    }
    assert.ok(parseTeamColours({ ...colours, treatment: 'horns' }, 1));
    assert.equal(parseTeamColours({ ...colours, treatment: 'horns' }, 2), null);
    assert.equal(parseTeamColours({ ...colours, treatment: 'arcane' }, 1), null);
    assert.ok(parseTeamColours({ ...colours, treatment: 'arcane' }, 4));
    // A colour that happened to be an old demo preset is still a valid owner choice.
    assert.equal(parseTeamColours({ ...colours, primary: '#167A83', secondary: '#ECAFC3' }, 5)?.primary, '#167A83');
    const launch: Record<string, TeamColours> = JSON.parse(readFileSync('league/seed/team-branding.json', 'utf8'));
    assert.equal(Object.keys(launch).length, 10);
    for (const [id, branding] of Object.entries(launch)) assert.deepEqual(parseTeamColours(branding, Number(id)), branding);
});

test('branding writes enforce ownership and versions without altering names, logos or claims', async () => {
    const client = new PGlite();
    const db = drizzle(client);
    try {
        await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
        await db.execute(sql`insert into league.franchises(id, display_name, first_season, folded_after_season)
            values (1, 'First', 2026, null), (2, 'Unclaimed', 2026, null), (3, 'Folded', 2026, 2026)`);
        await db.execute(sql`insert into league.team_management(franchise_id, name, logo_url, owner_uid, owner_email)
            values (1, 'Saved name', '/saved.webp', 'owner', 'owner@example.test'), (3, null, null, 'former', 'former@example.test')`);
        for (const uid of [null, 'intruder']) assert.equal((await db.execute(saveBrandingQuery(1, 1, colours, uid, false))).rows.length, 0);
        assert.equal((await db.execute(saveBrandingQuery(2, 0, colours, 'owner', false))).rows.length, 0, 'owners cannot initialise other teams');
        assert.equal((await db.execute(saveBrandingQuery(3, 1, colours, 'former', false))).rows.length, 0, 'folded team cannot be owner-edited');
        assert.equal((await db.execute(saveBrandingQuery(1, 1, colours, 'owner', false))).rows.length, 1);
        const [saved] = (await db.execute(managedTeamsQuery)).rows;
        assert.deepEqual(saved.branding, colours);
        assert.equal(saved.name, 'Saved name'); assert.equal(saved.logo, '/saved.webp'); assert.equal(saved.ownerUid, 'owner');
        assert.equal(saved.version, 2);
        assert.equal((await db.execute(saveBrandingQuery(1, 1, colours, 'owner', false))).rows.length, 0, 'stale branding rejected');
        assert.equal((await db.execute(updateTeamQuery(1, 1, 'Stale name', null, 'owner', false))).rows.length, 0, 'stale identity edit rejected');
        const race = await Promise.all([
            db.execute(saveBrandingQuery(1, 2, { ...colours, treatment: 'gradient' }, 'owner', false)),
            db.execute(saveBrandingQuery(1, 2, { ...colours, treatment: 'hoops' }, 'owner', false)),
        ]);
        assert.equal(race.reduce((n, result) => n + result.rows.length, 0), 1, 'one concurrent edit wins');
        assert.equal((await db.execute(saveBrandingQuery(2, 0, colours, null, true))).rows.length, 1, 'admin can initialise branding');
        assert.equal((await db.execute(saveBrandingQuery(2, 0, colours, null, true))).rows.length, 0, 'stale initialisation rejected');
        assert.equal((await db.execute(saveBrandingQuery(3, 1, colours, null, true))).rows.length, 1, 'admin can edit folded team');
        assert.equal((await db.execute(saveBrandingQuery(999, 0, colours, null, true))).rows.length, 0, 'unknown franchise rejected');
        await db.execute(updateTeamQuery(1, 3, 'Updated name', '/updated.webp', 'owner', false));
        const [afterName] = (await db.execute(managedTeamsQuery)).rows;
        assert.ok(afterName.branding, 'identity edits retain saved branding');
    } finally { await client.close(); }
});
