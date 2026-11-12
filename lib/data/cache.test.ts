import assert from 'node:assert/strict';
import test from 'node:test';
import { sql } from 'drizzle-orm';
import { disposableLeague } from '../testing/disposable-league';
import { LEAGUE_TAG } from './cache-tags';
import { AWARDS, awardHref } from '../awards';

test('curated edits expire exactly the cached readers that show their data', async t => {
    const testLeague = await disposableLeague(t, { app: true, nextCache: true, seed: `
        insert into league.seasons values (2025, '2024–25', 'complete'), (2026, '2025–26', 'complete');
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
    ` });
    const { client, db } = testLeague;
    // The curated edits' injected invalidator.
    const invalidate = (tag: string) => testLeague.expire(tag);
    const cache = { invalidate };
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
            const before = testLeague.queries();
            await read();
            if (testLeague.queries() > before) misses.push(name);
        }
        assert.deepEqual(misses.sort(), [...expected].sort());
    };
    const edits = await import('./curated-edits');
    const saved = <T extends { ok: boolean }>(result: T) => { assert.ok(result.ok, JSON.stringify(result)); return result; };
    const beforeEmptySearch = testLeague.queries();
    await searchPublicDirectory({ q: '---', type: 'all', page: 1 });
    assert.equal(testLeague.queries(), beforeEmptySearch, 'empty or punctuation-only search never wakes the database');
    await expectMisses(Object.keys(readers));
    await expectMisses([]);
    const beforeQueries = testLeague.queries();
    for (const q of ['Player', 'Team', '2026', 'unmatched query']) await searchPublicDirectory({ q, type: 'all', page: 1 });
    assert.equal(testLeague.queries(), beforeQueries, 'different searches reuse a single cached directory');

    saved(await edits.saveRoster(2026, ['p2'], cache));
    await expectMisses(['champion26', 'season26', 'leaders26', 'leadersAll', 'careers', 'player1', 'player2', 'franchise1', 'franchise2', 'discovery']);
    assert.deepEqual((await league.getChampionRoster(2026))?.rows.map(row => row.ID), ['p2']);
    assert.equal((await league.getAllTimeLeaderboard('all', 1, '')).rows.find(row => row.ID === 'p2')?.ChampionshipsWon, 1);

    saved(await edits.saveAwards(2026, [{ award: 'mvp', playerId: 'p2' }], cache));
    await expectMisses(['champion26', 'season26', 'leaders26', 'leadersAll', 'player1', 'player2', 'awards', 'honors1', 'honors2', 'records']);
    assert.equal((await league.getAwardWinners('mvp'))?.winners[0].PlayerID, 'p2');
    assert.equal((await history.getFranchiseHonors(1)).awards.length, 0);
    assert.equal((await history.getFranchiseHonors(2)).awards[0].playerId, 'p2');
    assert.equal((await db.execute(sql`select awards from league.player_careers where player_id='p2'`)).rows[0].awards, 1);

    saved(await edits.saveMatchup(2026, 2, 2, '', cache));
    await expectMisses(['banners', 'champion26', 'season26', 'leaders26', 'player1', 'player2', 'cards', 'franchise1', 'franchise2', 'cups', 'rivalries', 'records', 'discovery']);
    assert.equal((await league.getBannerSeasons()).find(season => season.year === 2026)?.franchiseId, 2);
    assert.deepEqual((await league.getFranchise(2))?.championships, [2026]);
    assert.equal((await league.getPlayer('p2'))?.championships[0].team, 'Team 2');

    saved(await edits.saveTeamIdentity({ admin: true }, { franchiseId: 1, version: 0, name: 'Renamed', logoUrl: '/new.webp' }, cache));
    await expectMisses(['cards', 'franchise1', 'rivalries', 'records', 'discovery']);
    assert.equal((await league.getFranchise(1))?.name, 'Renamed');
    assert.equal((await getRivalryData()).teams.find(team => team.ID === 1)?.LogoUrl, '/new.webp');
    assert.equal((await league.getChampionRoster(2025))?.team, 'Team 1', 'historical identities remain unchanged');
    assert.equal((await searchPublicDirectory({ q: 'Renamed', type: 'teams', page: 1 })).groups[0].results[0].href, '/teams/1');
    assert.match((await searchPublicDirectory({ q: 'Team 1', type: 'teams', page: 1 })).groups[0].results[0].subtitle, /Formerly Team 1/);
    assert.equal((await searchPublicDirectory({ q: 'One', type: 'teams', page: 1 })).groups[0].results[0].href, '/teams/1', 'franchise display names remain searchable after renames');

    const colours = { primary: '#123456', secondary: '#ABCDEF', tertiary: '#FFFFFF', treatment: 'stripes' } as const;
    saved(await edits.saveTeamBranding({ admin: true }, 1, 1, colours, cache));
    await expectMisses(['branding']);
    assert.deepEqual((await getTeamBranding())[1], colours);

    invalidate(LEAGUE_TAG);
    await expectMisses(Object.keys(readers));

    await client.exec("insert into league.players values ('plain', 'Plain ID');");
    assert.equal((await league.getPlayer('plain'))?.name, 'Plain ID');
    assert.equal(await league.getPlayer('missing-player'), null);
    await client.exec(`
        insert into league.seasons values (2020, '2019–20', 'cancelled'), (2027, '2026–27', 'complete');
        insert into league.owners (id, name) values (1, 'Former Owner'), (2, 'New Owner');
        update league.team_seasons set owner_id=1 where season_year=2025;
        update league.team_seasons set owner_id=2 where season_year=2026;
    `);
    invalidate(LEAGUE_TAG);
    const directory = await getSearchDirectory();
    assert.equal(directory.find(row => row.kind === 'players' && row.id === 'p1')?.careerPoints, 198);
    assert.equal(directory.find(row => row.kind === 'players' && row.id === 'plain')?.careerPoints, 0);
    assert.equal(directory.filter(row => row.kind === 'players' && row.id === 'plain').length, 1);
    assert.equal(directory.find(row => row.kind === 'players' && row.id === 'plain')?.title, 'Plain ID');
    assert.equal(directory.find(row => row.id === 'plain')?.subtitle, 'No career statistics yet');
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
    saved(await edits.saveRoster(2026, ['p2'], cache));
    assert.equal((await searchPublicDirectory({ q: 'Player', type: 'players', page: 1 })).groups[0].results[0].id, 'p2', 'refreshed career points change prominence ranking');
    assert.equal((await searchPublicDirectory({ q: 'Player One', type: 'players', page: 1 })).groups[0].results[0].id, 'p1', 'a specific name still beats prominence');
});
