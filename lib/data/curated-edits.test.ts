import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { SQL } from 'drizzle-orm';

test('curated edits against disposable Postgres', async t => {
    const client = new PGlite();
    const db = drizzle(client);
    const originalUrl = process.env.DATABASE_URL_V2;
    t.after(async () => {
        t.mock.restoreAll();
        await client.close();
        if (originalUrl === undefined) delete process.env.DATABASE_URL_V2; else process.env.DATABASE_URL_V2 = originalUrl;
    });
    // Send the shared execute to an in-memory Postgres, exactly as the cached readers' tests do.
    process.env.DATABASE_URL_V2 = 'postgresql://test:test@localhost/test';
    const runtime = await import('./db');
    t.mock.method(runtime.getDb(), 'execute', (query: SQL) => db.execute(query));
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('Tests must not access the network'); });
    await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
    await client.exec(`
        insert into league.seasons values (2020, '2019–20', 'cancelled'), (2025, '2024–25', 'complete'), (2026, '2025–26', 'complete');
        insert into league.franchises (id, display_name, first_season, folded_after_season) values (1, 'One', 2025, null), (2, 'Two', 2025, null), (3, 'Three', 2025, 2025);
        insert into league.team_seasons (id, season_year, franchise_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against, logo_url)
        values (1, 2025, 1, 'Team 1', 'Team 1', 'T1', 1, 1, 10, 5, 0, 999, 500, '/history/one.png'),
               (2, 2025, 2, 'Team 2', 'Team 2', 'T2', 1, 2, 10, 5, 0, 998, 500, null),
               (5, 2025, 3, 'Team 3', 'Team 3', 'T3', 1, 3, 10, 5, 0, 997, 500, null),
               (3, 2026, 1, 'Team 1', 'Team 1', 'T1', 1, 1, 10, 5, 0, 999, 500, null),
               (4, 2026, 2, 'Team 2', 'Team 2', 'T2', 1, 2, 10, 5, 0, 998, 500, null);
        insert into league.players values ('p1', 'Player One'), ('p2', 'Player Two'), ('p3', 'Player Three');
        insert into league.player_seasons (player_id, season_year, team_season_id, positions, fpts, fpg)
        values ('p1', 2025, 1, array['C'], 99, 2), ('p2', 2025, 2, array['C'], 98, 2),
               ('p1', 2026, 3, array['C'], 99, 2), ('p2', 2026, 4, array['C'], 98, 2), ('p3', 2026, null, array['D'], 50, 1);
        insert into league.championship_rosters values (2025, 'p1'), (2026, 'p1');
        insert into league.award_types (id, name, label, description, sort_order) values (1, 'mvp', 'MVP', 'MVP', 1), (2, 'rookie', 'Rookie', 'Rookie', 2);
        insert into league.awards values (2026, 1, 'p1', 3);
        insert into league.matchups (id, season_year, stage, round, bracket, slot, away_team_season_id, home_team_season_id, away_score, home_score, winner_team_season_id)
        values (1, 2025, 'playoff', 1, 'championship', 1, 1, 2, 100, 90, 1), (2, 2026, 'playoff', 1, 'championship', 1, 3, 4, 100, 90, 3);
        refresh materialized view league.season_results;
        refresh materialized view league.player_careers;
        refresh materialized view league.franchise_records;
    `);
    const edits = await import('./curated-edits');
    const recorder = () => {
        const tags: string[] = [];
        return { tags, invalidate: (tag: string) => { tags.push(tag); } };
    };
    const query = async <T>(text: string) => (await client.query<T>(text)).rows;

    await t.test('saving a championship roster replaces it and refreshes careers', async () => {
        const cache = recorder();
        assert.deepEqual(await edits.saveRoster(2026, ['p2', 'p3', 'p2'], cache), { ok: true, saved: 2 });
        assert.deepEqual((await query<{ player_id: string }>('select player_id from league.championship_rosters where season_year = 2026 order by player_id')).map(r => r.player_id), ['p2', 'p3']);
        assert.deepEqual(await query('select player_id, championships from league.player_careers order by player_id'),
            [{ player_id: 'p1', championships: 1 }, { player_id: 'p2', championships: 1 }, { player_id: 'p3', championships: 1 }]);
        assert.deepEqual(cache.tags.sort(), ['league:career-leaderboard', 'league:discovery', 'league:franchise-details', 'league:players', 'league:season-leaderboard', 'league:season:2026']);
    });

    const roster = (year: number) => query<{ player_id: string }>(`select player_id from league.championship_rosters where season_year = ${year} order by player_id`)
        .then(found => found.map(r => r.player_id));

    await t.test('re-saving a roster gives the same rows, and an empty roster clears it', async () => {
        assert.deepEqual(await edits.saveRoster(2026, ['p3', 'p2'], recorder()), { ok: true, saved: 2 });
        assert.deepEqual(await roster(2026), ['p2', 'p3']);
        assert.deepEqual(await edits.saveRoster(2025, [], recorder()), { ok: true, saved: 0 });
        assert.deepEqual(await roster(2025), []);
        assert.deepEqual(await edits.saveRoster(2025, ['p1'], recorder()), { ok: true, saved: 1 });
    });

    await t.test('a roster save is rejected without writing or expiring anything', async () => {
        for (const [year, ids, reason] of [
            [2031, ['p1'], 'unknown-season'],
            [2020, ['p1'], 'no-playoffs'],
            [2025, ['p3'], 'unknown-player'],
            [2026, ['p2', 'nobody'], 'unknown-player'],
        ] as const) {
            const cache = recorder();
            assert.deepEqual(await edits.saveRoster(year, [...ids], cache), { ok: false, reason }, `${year} ${ids}`);
            assert.deepEqual(cache.tags, []);
        }
        assert.deepEqual(await roster(2025), ['p1']);
        assert.deepEqual(await roster(2026), ['p2', 'p3']);
    });

    // Break a view the edit refreshes: the write has committed, so pages must still be expired.
    const withBrokenView = async (view: string, run: () => Promise<unknown>) => {
        await client.exec(`alter materialized view league.${view} rename to ${view}_broken`);
        try { await assert.rejects(run, new RegExp(view)); }
        finally { await client.exec(`alter materialized view league.${view}_broken rename to ${view}`); }
    };

    await t.test('a roster whose refresh fails is saved, expires its pages, then throws', async () => {
        const cache = recorder();
        await withBrokenView('player_careers', () => edits.saveRoster(2026, ['p1'], cache));
        assert.deepEqual(await roster(2026), ['p1']);
        assert.ok(cache.tags.includes('league:season:2026') && cache.tags.length === 6, cache.tags.join());
    });

    const awards = () => query('select award_type_id, player_id, team_season_id from league.awards order by season_year, award_type_id, player_id');

    await t.test('saving awards replaces only the picked awards and refreshes careers', async () => {
        const cache = recorder();
        assert.deepEqual(await edits.saveAwards(2026, [{ award: 'mvp', playerId: 'p2' }, { award: 'rookie', playerId: 'p3' }], cache), { ok: true, saved: 2 });
        assert.deepEqual(await awards(), [
            { award_type_id: 1, player_id: 'p2', team_season_id: 4 },
            { award_type_id: 2, player_id: 'p3', team_season_id: null },
        ]);
        assert.deepEqual(await query("select player_id, awards from league.player_careers where player_id in ('p1', 'p2') order by player_id"),
            [{ player_id: 'p1', awards: 0 }, { player_id: 'p2', awards: 1 }]);
        assert.deepEqual(cache.tags.sort(), ['league:awards', 'league:players', 'league:records', 'league:season-leaderboard', 'league:season:2026']);

        assert.deepEqual(await edits.saveAwards(2026, [{ award: 'mvp', playerId: 'p2' }], recorder()), { ok: true, saved: 1 });
        assert.deepEqual(await edits.saveAwards(2026, [{ award: 'mvp', playerId: 'p2' }, { award: 'rookie', playerId: 'p2' }], recorder()), { ok: true, saved: 2 }, 'one player can win two awards');
        assert.deepEqual(await edits.saveAwards(2026, [{ award: 'rookie', playerId: null }], recorder()), { ok: true, saved: 0 });
        assert.deepEqual(await awards(), [{ award_type_id: 1, player_id: 'p2', team_season_id: 4 }]);
    });

    await t.test('an awards save is rejected without writing or expiring anything', async () => {
        for (const [year, picks, reason] of [
            [2031, [{ award: 'mvp', playerId: 'p1' }], 'unknown-season'],
            [2026, [{ award: 'rookie', playerId: 'p1' }, { award: 'hart', playerId: 'p1' }], 'unknown-award'],
            [2025, [{ award: 'mvp', playerId: 'p3' }], 'unknown-player'],
        ] as const) {
            const cache = recorder();
            assert.deepEqual(await edits.saveAwards(year, [...picks], cache), { ok: false, reason });
            assert.deepEqual(cache.tags, []);
        }
        assert.deepEqual(await awards(), [{ award_type_id: 1, player_id: 'p2', team_season_id: 4 }]);
    });

    await t.test('awards whose refresh fails are saved, expire their pages, then throw', async () => {
        const cache = recorder();
        await withBrokenView('player_careers', () => edits.saveAwards(2026, [{ award: 'rookie', playerId: 'p1' }], cache));
        assert.equal((await awards()).length, 2);
        assert.equal(cache.tags.length, 5);
        await edits.saveAwards(2026, [{ award: 'rookie', playerId: null }], recorder());
    });

    const game = async () => ({
        winner: (await query<{ winner: number | null }>('select winner_team_season_id as winner from league.matchups where id = 2'))[0].winner,
        overrides: await query('select round, franchise_a, franchise_b, winner_franchise_id, note from league.matchup_overrides'),
        champion: (await query<{ champion: number }>('select champion_team_season_id as champion from league.season_results where season_year = 2026'))[0].champion,
        titles: await query('select franchise_id, championships from league.franchise_records order by franchise_id'),
    });

    await t.test('overriding a matchup winner rebuilds results, then franchise records from them', async () => {
        const cache = recorder();
        assert.deepEqual(await edits.saveMatchup(2026, 2, 2, '  Scoring correction  ', cache), { ok: true });
        assert.deepEqual(await game(), {
            winner: 4,
            overrides: [{ round: 1, franchise_a: 1, franchise_b: 2, winner_franchise_id: 2, note: 'Scoring correction' }],
            champion: 4,
            titles: [{ franchise_id: 1, championships: [2025] }, { franchise_id: 2, championships: [2026] }, { franchise_id: 3, championships: [] }],
        });
        assert.deepEqual(cache.tags.sort(), ['league:banners', 'league:cups', 'league:franchise-cards', 'league:franchise-details',
            'league:players', 'league:records', 'league:rivalries', 'league:season:2026', 'league:discovery'].sort());
        assert.deepEqual(await edits.saveMatchup(2026, 2, 2, 'Scoring correction', recorder()), { ok: true });
        assert.equal((await game()).overrides.length, 1, 're-saving keeps one override');
    });

    await t.test('following the score keeps a note until the note is cleared', async () => {
        await edits.saveMatchup(2026, 2, 'score', 'Checked', recorder());
        assert.deepEqual(await game(), {
            winner: 3,
            overrides: [{ round: 1, franchise_a: 1, franchise_b: 2, winner_franchise_id: null, note: 'Checked' }],
            champion: 3,
            titles: [{ franchise_id: 1, championships: [2025, 2026] }, { franchise_id: 2, championships: [] }, { franchise_id: 3, championships: [] }],
        });
        await edits.saveMatchup(2026, 2, 'score', ' ', recorder());
        assert.deepEqual((await game()).overrides, []);
    });

    await t.test('a matchup save is rejected without writing or expiring anything', async () => {
        for (const [year, id, winner, reason] of [
            [2026, 99, 'score', 'unknown-matchup'],
            [2025, 2, 'score', 'unknown-matchup'],
            [2026, 2, 3, 'not-in-matchup'],
        ] as const) {
            const cache = recorder();
            assert.deepEqual(await edits.saveMatchup(year, id, winner, 'note', cache), { ok: false, reason });
            assert.deepEqual(cache.tags, []);
        }
        assert.deepEqual((await game()).overrides, []);
    });

    await t.test('a matchup whose refresh fails is saved, expires its pages, then throws', async () => {
        const cache = recorder();
        await withBrokenView('franchise_records', () => edits.saveMatchup(2026, 2, 2, '', cache));
        assert.equal((await game()).champion, 4, 'season results refreshed before the failure');
        assert.equal(cache.tags.length, 9);
        await edits.saveMatchup(2026, 2, 'score', '', recorder());
    });

    await client.exec(`insert into league.team_management (franchise_id, owner_uid, owner_email)
        values (1, 'owner', 'owner@example.test'), (3, 'former', 'former@example.test')`);
    const owner = { uid: 'owner' };
    const admin = { admin: true } as const;
    const managed = async (id: number) => (await query<{ name: string | null; logo_url: string | null; owner_uid: string | null; version: number; branding: unknown }>(
        `select name, logo_url, owner_uid, version, branding from league.team_management where franchise_id = ${id}`))[0];
    const identityTags = (id: number) => [`league:franchise:${id}`, 'league:franchise-cards', 'league:rivalries', 'league:records', 'league:discovery'].sort();

    await t.test('an owner rename changes the current identity and leaves season identities alone', async () => {
        const cache = recorder();
        assert.deepEqual(await edits.saveTeamIdentity(owner, { franchiseId: 1, version: 1, name: 'Renamed', logoUrl: '/team-logos/1/a.webp' }, cache),
            { ok: true, orphanedLogoUrl: null });
        assert.deepEqual(await query('select name, logo from league.current_teams where id = 1'), [{ name: 'Renamed', logo: '/team-logos/1/a.webp' }]);
        assert.deepEqual((await query<{ name: string }>('select name from league.season_teams where franchise_id = 1 order by season_year')).map(r => r.name), ['Team 1', 'Team 1']);
        assert.deepEqual(cache.tags.sort(), identityTags(1));
        assert.equal((await managed(1)).version, 2);
    });

    await t.test('an identity save is rejected for strangers, folded teams and stale versions', async () => {
        for (const [actor, change, reason] of [
            [owner, { franchiseId: 1, version: 1, name: 'Stale edit' }, 'stale-version'],
            [{ uid: 'intruder' }, { franchiseId: 1, version: 2, name: 'Hacked' }, 'not-owner'],
            [{ uid: 'former' }, { franchiseId: 3, version: 1, name: 'Comeback' }, 'defunct'],
            [owner, { franchiseId: 2, version: 0, name: 'Second team' }, 'not-owner'],
            [admin, { franchiseId: 999, version: 0, name: 'Nobody' }, 'unknown-team'],
        ] as const) {
            const cache = recorder();
            assert.deepEqual(await edits.saveTeamIdentity(actor, { ...change, logoUrl: '/team-logos/x.webp' }, cache), { ok: false, reason }, change.name);
            assert.deepEqual(cache.tags, []);
        }
        assert.equal((await managed(1)).name, 'Renamed');
        assert.equal((await managed(3)).name, null);
        assert.equal(await managed(2), undefined);
    });

    await t.test('an admin creates a first identity once and can edit any team', async () => {
        assert.deepEqual(await edits.saveTeamIdentity(admin, { franchiseId: 2, version: 0, name: 'Second' }, recorder()), { ok: true, orphanedLogoUrl: null });
        assert.deepEqual(await edits.saveTeamIdentity(admin, { franchiseId: 2, version: 0, name: 'Again' }, recorder()), { ok: false, reason: 'stale-version' });
        assert.equal((await managed(2)).name, 'Second');
        assert.deepEqual(await edits.saveTeamIdentity(admin, { franchiseId: 3, version: 1, name: 'Admin name' }, recorder()), { ok: true, orphanedLogoUrl: null });
        assert.deepEqual(await edits.saveTeamIdentity(admin, { franchiseId: 1, version: 2, name: 'Admin edit' }, recorder()), { ok: true, orphanedLogoUrl: null });
        assert.deepEqual(await managed(1), { name: 'Admin edit', logo_url: '/team-logos/1/a.webp', owner_uid: 'owner', version: 3, branding: null }, 'no new logo keeps the old one');
        await client.exec("update league.franchises set display_name = 'Imported', logo_url = '/imported.png' where id = 1");
        assert.deepEqual(await query('select name, logo from league.current_teams where id = 1'), [{ name: 'Admin edit', logo: '/team-logos/1/a.webp' }],
            'an import never overwrites a managed identity');
    });

    await t.test('a replaced logo is orphaned only when no season or team snapshot still uses it', async () => {
        assert.deepEqual(await edits.saveTeamIdentity(owner, { franchiseId: 1, version: 3, name: 'Renamed', logoUrl: '/team-logos/1/b.webp' }, recorder()),
            { ok: true, orphanedLogoUrl: '/team-logos/1/a.webp' });
        await client.exec("update league.team_seasons set logo_url = '/team-logos/1/b.webp' where id = 3");
        assert.deepEqual(await edits.saveTeamIdentity(owner, { franchiseId: 1, version: 4, name: 'Renamed', logoUrl: '/team-logos/1/c.webp' }, recorder()),
            { ok: true, orphanedLogoUrl: null });
        assert.deepEqual(await edits.saveTeamIdentity(owner, { franchiseId: 1, version: 5, name: 'Renamed', logoUrl: '/team-logos/1/c.webp' }, recorder()),
            { ok: true, orphanedLogoUrl: null }, 're-saving the same logo orphans nothing');
        const { version } = await managed(1);
        await edits.saveTeamIdentity(owner, { franchiseId: 1, version, name: 'Renamed', logoUrl: '/pvlslogo.png' }, recorder());
        assert.deepEqual(await edits.saveTeamIdentity(owner, { franchiseId: 1, version: version + 1, name: 'Renamed', logoUrl: '/team-logos/1/d.webp' }, recorder()),
            { ok: true, orphanedLogoUrl: null }, "the bundled pilot's team snapshot still shows it");
    });

    const colours = { primary: '#123ABC', secondary: '#D24015', tertiary: '#FFFFFF', treatment: 'stripes' } as const;

    await t.test('an owner colour save changes branding only and expires only branding', async () => {
        const cache = recorder();
        const before = await managed(1);
        assert.deepEqual(await edits.saveTeamBranding(owner, 1, before.version, colours, cache), { ok: true });
        assert.deepEqual(await managed(1), { ...before, branding: colours, version: before.version + 1 });
        assert.deepEqual(cache.tags, ['league:branding']);
        assert.deepEqual(await edits.saveTeamIdentity(owner, { franchiseId: 1, version: before.version + 1, name: 'Renamed again' }, recorder()), { ok: true, orphanedLogoUrl: null });
        assert.deepEqual((await managed(1)).branding, colours, 'identity edits keep saved branding');
    });

    await t.test('a colour save has the same protections as an identity save', async () => {
        const { version } = await managed(1);
        for (const [actor, id, at, reason] of [
            [owner, 1, version - 1, 'stale-version'],
            [{ uid: 'intruder' }, 1, version, 'not-owner'],
            [owner, 2, 1, 'not-owner'],
            [owner, 2, 0, 'not-owner'],
            [{ uid: 'former' }, 3, 2, 'defunct'],
            [admin, 999, 0, 'unknown-team'],
            [admin, 2, 0, 'stale-version'],
        ] as const) {
            const cache = recorder();
            assert.deepEqual(await edits.saveTeamBranding(actor, id, at, colours, cache), { ok: false, reason }, `${id} ${at}`);
            assert.deepEqual(cache.tags, []);
        }
        await client.exec("insert into league.franchises (id, display_name, first_season) values (4, 'Four', 2026)");
        assert.deepEqual(await edits.saveTeamBranding(admin, 4, 0, colours, recorder()), { ok: true }, 'admin can initialise branding');
        assert.deepEqual(await edits.saveTeamBranding(admin, 3, 2, colours, recorder()), { ok: true }, 'admin can edit a folded team');
        const race = await Promise.all([
            edits.saveTeamBranding(owner, 1, version, { ...colours, treatment: 'gradient' }, recorder()),
            edits.saveTeamBranding(owner, 1, version, { ...colours, treatment: 'hoops' }, recorder()),
        ]);
        assert.equal(race.filter(result => result.ok).length, 1, 'one concurrent edit wins');
    });
});
