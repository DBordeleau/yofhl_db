import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { sql, type SQL } from 'drizzle-orm';
import { curatedEditEffects, LEAGUE_TAG, leagueTags, teamIdentityTags, type CuratedEdit } from './cache-tags';
import { AWARDS, awardHref } from '../awards';

test('real cached readers refresh edited data while preserving unrelated seasons and history', async t => {
    const client = new PGlite();
    const db = drizzle(client);
    const originalUrl = process.env.DATABASE_URL_V2;
    const originalMode = process.env.NODE_ENV;
    // Next normally installs these globals. Use its real unstable_cache with a local
    // cache backend, and execute every SQL query against disposable in-memory Postgres.
    const globals = ['AsyncLocalStorage', '__incrementalCache'] as const;
    const descriptors = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    t.after(async () => {
        t.mock.restoreAll();
        await client.close();
        if (originalUrl === undefined) delete process.env.DATABASE_URL_V2; else process.env.DATABASE_URL_V2 = originalUrl;
        if (originalMode === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: originalMode });
        globals.forEach((key, i) => { if (descriptors[i]) Object.defineProperty(globalThis, key, descriptors[i]!); else Reflect.deleteProperty(globalThis, key); });
    });
    process.env.DATABASE_URL_V2 = 'postgresql://test:test@localhost/test';
    Object.assign(process.env, { NODE_ENV: 'test' });
    Object.defineProperty(globalThis, 'AsyncLocalStorage', { value: AsyncLocalStorage, configurable: true });
    const entries = new Map<string, { value: unknown; tags: string[] }>();
    Object.defineProperty(globalThis, '__incrementalCache', { configurable: true, value: {
        generateSimpleCacheKey: async (key: string) => key,
        get: async (key: string) => entries.get(key) ?? null,
        set: async (key: string, value: unknown, options: { tags: string[] }) => { entries.set(key, { value, tags: options.tags }); },
    } });
    const invalidate = (tags: string[]) => {
        for (const [key, entry] of entries) if (entry.tags.some(tag => tags.includes(tag))) entries.delete(key);
    };
    const runtime = await import('./db');
    let queries = 0;
    t.mock.method(runtime.getDb(), 'execute', (query: SQL) => { queries++; return db.execute(query); });
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('Tests must not access the network'); });
    await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
    await client.exec(`
        insert into league.seasons values (2025, '2024-25', 'complete'), (2026, '2025-26', 'complete');
        insert into league.franchises (id, display_name, first_season) values (1, 'One', 2025), (2, 'Two', 2025);
        insert into league.team_seasons (id, season_year, franchise_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against)
        select (y-2025)*2+f, y, f, 'Team '||f, 'Team '||f, 'T'||f, 1, f, 10, 5, 0, 1000-f, 500
        from generate_series(2025,2026) y cross join generate_series(1,2) f;
        insert into league.players values ('p1', 'Player One'), ('p2', 'Player Two');
        insert into league.player_seasons (player_id,season_year,team_season_id,positions,fpts,fpg)
        select 'p'||f, y, (y-2025)*2+f, array['C'], 100-f, 2
        from generate_series(2025,2026) y cross join generate_series(1,2) f;
        insert into league.championship_rosters values (2025,'p1'), (2026,'p1');
        insert into league.award_types (id,name,label,description,sort_order) values (1,'mvp','MVP','MVP',1);
        insert into league.awards values (2026,1,'p1',3);
        insert into league.matchups (season_year,stage,round,bracket,slot,away_team_season_id,home_team_season_id,away_score,home_score,winner_team_season_id)
        values (2025,'playoff',1,'championship',1,1,2,100,90,1), (2026,'playoff',1,'championship',1,3,4,100,90,3);
        refresh materialized view league.season_results;
        refresh materialized view league.player_careers;
        refresh materialized view league.franchise_records;
    `);
    const league = await import('./league');
    const history = await import('./history');
    const { getRivalryData } = await import('./rivalries');
    const { getTeamBranding } = await import('./team-branding');
    const { getRecordSource } = await import('../records/data');
    const { getSearchDirectory, searchPublicDirectory } = await import('./search');
    const readers: Record<string, () => Promise<unknown>> = {
        banners: league.getBannerSeasons,
        champion25: () => league.getChampionRoster(2025), champion26: () => league.getChampionRoster(2026),
        season25: () => league.getSeasonDetail(2025), season26: () => league.getSeasonDetail(2026),
        leaders25: () => league.getSingleSeasonLeaderboard('all', 1, '', 2025),
        leaders26: () => league.getSingleSeasonLeaderboard('all', 1, '', 2026),
        leadersAll: () => league.getSingleSeasonLeaderboard('all', 1, ''),
        careers: () => league.getAllTimeLeaderboard('all', 1, ''),
        player1: () => league.getPlayer('p1'), player2: () => league.getPlayer('p2'),
        cards: league.getFranchiseCards,
        franchise1: () => league.getFranchise(1), franchise2: () => league.getFranchise(2),
        awards: () => league.getAwardWinners('mvp'), awardTypes: league.getAwardTypes,
        cups: () => league.getTeamAwardWinners('jagr-cup'), primeMinister: () => league.getTeamAwardWinners('prime-minister'),
        honors1: () => history.getFranchiseHonors(1), honors2: () => history.getFranchiseHonors(2),
        draft: () => history.getSeasonDraft(2026), franchiseDraft: () => history.getFranchiseDraft(1),
        history: () => history.getHistory({ franchiseId: 1 }), historySeasons: () => history.getHistorySeasons({ franchiseId: 1 }),
        rivalries: getRivalryData, branding: getTeamBranding, records: getRecordSource, discovery: getSearchDirectory,
    };
    const expectMisses = async (expected: string[]) => {
        const misses = [];
        for (const [name, read] of Object.entries(readers)) {
            const before = queries;
            await read();
            if (queries > before) misses.push(name);
        }
        assert.deepEqual(misses.sort(), [...expected].sort());
    };
    const edit = async (kind: CuratedEdit) => {
        const effects = curatedEditEffects(kind, 2026);
        for (const view of effects.views) await db.execute(sql`refresh materialized view league.${sql.identifier(view)}`);
        invalidate(effects.tags);
    };
    const beforeEmptySearch = queries;
    await searchPublicDirectory({ q: '---', type: 'all', page: 1 });
    assert.equal(queries, beforeEmptySearch, 'empty or punctuation-only search never wakes the database');
    await expectMisses(Object.keys(readers));
    await expectMisses([]);
    const beforeQueries = queries;
    for (const q of ['Player', 'Team', '2026', 'unmatched query']) await searchPublicDirectory({ q, type: 'all', page: 1 });
    assert.equal(queries, beforeQueries, 'different searches reuse a single cached directory');

    await client.exec("delete from league.championship_rosters where season_year=2026; insert into league.championship_rosters values (2026,'p2');");
    await edit('roster');
    await expectMisses(['champion26', 'season26', 'leaders26', 'leadersAll', 'careers', 'player1', 'player2', 'franchise1', 'franchise2', 'discovery']);
    assert.deepEqual((await league.getChampionRoster(2026))?.rows.map(row => row.ID), ['p2']);
    assert.equal((await league.getAllTimeLeaderboard('all', 1, '')).rows.find(row => row.ID === 'p2')?.ChampionshipsWon, 1);

    await client.exec("update league.awards set player_id='p2', team_season_id=4 where season_year=2026;");
    await edit('awards');
    await expectMisses(['champion26', 'season26', 'leaders26', 'leadersAll', 'player1', 'player2', 'awards', 'honors1', 'honors2', 'records']);
    assert.equal((await league.getAwardWinners('mvp'))?.winners[0].PlayerID, 'p2');
    assert.equal((await history.getFranchiseHonors(1)).awards.length, 0);
    assert.equal((await history.getFranchiseHonors(2)).awards[0].playerId, 'p2');
    assert.equal((await db.execute(sql`select awards from league.player_careers where player_id='p2'`)).rows[0].awards, 1);

    await client.exec('update league.matchups set winner_team_season_id=4 where season_year=2026;');
    await edit('matchup');
    await expectMisses(['banners', 'champion26', 'season26', 'leaders26', 'player1', 'player2', 'cards', 'franchise1', 'franchise2', 'cups', 'rivalries', 'records', 'discovery']);
    assert.equal((await league.getBannerSeasons()).find(season => season.year === 2026)?.franchiseId, 2);
    assert.deepEqual((await league.getFranchise(2))?.championships, [2026]);
    assert.equal((await league.getPlayer('p2'))?.championships[0].team, 'Team 2');

    await client.exec("insert into league.team_management (franchise_id,name,logo_url) values (1,'Renamed','/new.webp');");
    invalidate(teamIdentityTags(1));
    await expectMisses(['cards', 'franchise1', 'rivalries', 'records', 'discovery']);
    assert.equal((await league.getFranchise(1))?.name, 'Renamed');
    assert.equal((await getRivalryData()).teams.find(team => team.ID === 1)?.LogoUrl, '/new.webp');
    assert.equal((await league.getChampionRoster(2025))?.team, 'Team 1', 'historical identities remain unchanged');
    assert.equal((await searchPublicDirectory({ q: 'Renamed', type: 'teams', page: 1 })).groups[0].results[0].href, '/teams/1');
    assert.match((await searchPublicDirectory({ q: 'Team 1', type: 'teams', page: 1 })).groups[0].results[0].subtitle, /Formerly Team 1/);
    assert.equal((await searchPublicDirectory({ q: 'One', type: 'teams', page: 1 })).groups[0].results[0].href, '/teams/1', 'franchise display names remain searchable after renames');

    const colours = { primary: '#123456', secondary: '#ABCDEF', tertiary: '#FFFFFF', treatment: 'stripes' };
    await db.execute(sql`update league.team_management set branding=${JSON.stringify(colours)}::jsonb where franchise_id=1`);
    invalidate([leagueTags.branding]);
    await expectMisses(['branding']);
    assert.deepEqual((await getTeamBranding())[1], colours);

    invalidate([LEAGUE_TAG]);
    await expectMisses(Object.keys(readers));

    await client.exec("insert into league.players values ('*starred*', 'Wrapped ID'), ('plain', 'Plain ID'), ('*plain*', 'Wrapped collision');");
    assert.equal((await league.getPlayer('starred'))?.id, '*starred*');
    assert.equal((await league.getPlayer('*starred*'))?.id, '*starred*');
    assert.equal((await league.getPlayer('plain'))?.name, 'Plain ID');
    assert.equal(await league.getPlayer('missing-player'), null);
    await client.exec(`
        insert into league.seasons values (2020, '2019-20', 'cancelled'), (2027, '2026-27', 'complete');
        insert into league.owners (id, name) values (1, 'Former Owner'), (2, 'New Owner');
        update league.team_seasons set owner_id=1 where season_year=2025;
        update league.team_seasons set owner_id=2 where season_year=2026;
    `);
    invalidate([LEAGUE_TAG]);
    const directory = await getSearchDirectory();
    assert.equal(directory.find(row => row.kind === 'players' && row.id === 'p1')?.careerPoints, 198);
    assert.equal(directory.find(row => row.kind === 'players' && row.id === 'plain')?.careerPoints, 0);
    assert.equal(directory.filter(row => row.kind === 'players' && row.id === 'plain').length, 1);
    assert.equal(directory.find(row => row.kind === 'players' && row.id === 'plain')?.title, 'Plain ID');
    assert.equal(directory.find(row => row.id === 'starred')?.subtitle, 'No career statistics yet');
    assert.equal((await searchPublicDirectory({ q: 'Former Owner', type: 'all', page: 1 })).total, 0);
    assert.equal(directory.filter(row => row.kind === 'awards').length, AWARDS.length);
    for (const award of AWARDS) {
        for (const q of [award.name, award.label, award.id]) {
            const response = await searchPublicDirectory({ q, type: 'awards', page: 1 });
            assert.equal(response.groups[0].results[0]?.href, awardHref(award.name), q);
            assert.equal(response.groups[0].results[0]?.title, award.label, q);
        }
    }
    const awardResults = (await searchPublicDirectory({ q: 'gretzky', type: 'all', page: 1 })).groups.find(group => group.kind === 'awards')!;
    assert.equal(awardResults.results[0].id, 'wayne-gretzky');
    assert(directory.some(row => row.kind === 'seasons' && row.id === '2020'));
    assert(!directory.some(row => row.kind === 'seasons' && row.id === '2027'), 'incomplete seasons cannot link to a 404 page');

    await client.exec("update league.player_seasons set fpts=200 where player_id='p2';");
    await edit('roster');
    assert.equal((await searchPublicDirectory({ q: 'Player', type: 'players', page: 1 })).groups[0].results[0].id, 'p2', 'refreshed career points change prominence ranking');
    assert.equal((await searchPublicDirectory({ q: 'Player One', type: 'players', page: 1 })).groups[0].results[0].id, 'p1', 'a specific name still beats prominence');
});
