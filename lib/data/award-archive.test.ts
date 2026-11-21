// The award archive answers who won each award. Each way an award is decided is checked once, through winners(),
// against a throwaway league read the way a page reads it: the app's database and the real Next cache, in a route.
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { disposableLeague } from '../testing/disposable-league';
import { LEAGUE_TAG } from './cache-tags';
import { MATERIALIZED_VIEWS } from './materialized-views';
import { AWARD_CATALOGUE, findAward } from '../awards';

// 2024 and 2025 are published, each with a Final; 2026 is still being played. Franchise 2 leads 2024 and 2026 on
// points, and 2025 ends with franchises 1 and 3 level on the most. The Wayne Gretzky Award was entered by hand for
// every season, shared in 2025; the Hasek Trophy once in 2025.
const SEED = `
    insert into league.seasons values (2024, '2023–24', 'complete'), (2025, '2024–25', 'complete'), (2026, '2025–26', 'complete');
    insert into league.franchises (id, display_name, first_season, logo_url) values
        (1, 'One', 2024, '/one.webp'), (2, 'Two', 2024, '/two.webp'), (3, 'Three', 2024, '/three.webp');
    insert into league.owners (id, name) values (1, 'Owner 1'), (2, 'Owner 2'), (3, 'Owner 3');
    insert into league.team_seasons (id, season_year, franchise_id, owner_id, name, fantrax_name, abbreviation, logo_url, division, division_rank, wins, losses, ties, fpts_for, fpts_against)
    select (y-2024)*3+f, y, f, f, 'Club '||f||' '||y, 'Club '||f, 'C'||f, case when y = 2025 and f = 1 then '/one-2025.webp' end, 1, f,
           10+f, 5, case when f = 2 then 1 else 0 end,
           case when (y, f) = (2024, 2) then 1500 when (y, f) in ((2025, 1), (2025, 3)) then 1400 when (y, f) = (2026, 2) then 9000 else 1000+f end, 500
    from generate_series(2024,2026) y cross join generate_series(1,3) f;
    insert into league.matchups (season_year,stage,round,bracket,slot,away_team_season_id,home_team_season_id,away_score,home_score,winner_team_season_id)
    values (2024,'playoff',1,'championship',1,1,3,100,90,3), (2025,'playoff',1,'championship',1,4,5,100,90,4);
    insert into league.players values ('p1', 'Skater One'), ('p2', 'Skater Two'), ('p3', 'Goalie Three');
    insert into league.player_seasons (player_id, season_year, team_season_id, positions, fpts, fpg) values
        ('p1', 2024, 1, array['C'], 300, 3.5), ('p1', 2025, 4, array['C'], 310, 3.6), ('p2', 2025, 5, array['LW'], 310, 3.4),
        ('p3', 2026, 9, array['G'], 250, 4.1);
    insert into league.awards (season_year, award, player_id, team_season_id) values
        (2024, 'wayne-gretzky', 'p1', 1), (2025, 'wayne-gretzky', 'p2', 5), (2025, 'wayne-gretzky', 'p1', 4),
        (2026, 'wayne-gretzky', 'p3', 9), (2025, 'hasek', 'p2', 5);
    insert into league.championship_rosters values (2025, 'p1');
`;

async function archiveLeague(t: TestContext) {
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: SEED });
    const archive = await import('./award-archive');
    /** the award page's winners of the award with this ID */
    const winners = async (id: string) => (await league.runAsRoute('/awards/[award]', () => archive.winners(findAward(id)!))).result;
    /** the 2026 Final is decided, so the season is published */
    const publish2026 = async () => {
        await league.client.exec(`
            insert into league.matchups (season_year,stage,round,bracket,slot,away_team_season_id,home_team_season_id,away_score,home_score,winner_team_season_id)
            values (2026,'playoff',1,'championship',1,8,9,100,90,9);`);
        for (const view of MATERIALIZED_VIEWS) await league.client.exec(`refresh materialized view league.${view};`);
        league.expire(LEAGUE_TAG);
    };
    return { league, archive, winners, publish2026 };
}

test("the Jagr Cup's winners are each published season's champion, newest first, under the team season's identity", async t => {
    const { winners, publish2026 } = await archiveLeague(t);
    assert.deepEqual(await winners('jagr-cup'), [
        { Year: 2025, Winner: 'Club 1 2025', PlayerID: '', Team: 'Club 1 2025', TeamID: 1, Owner: 'Owner 1', TeamLogo: '/one-2025.webp', FPts: 1400, FPG: null, Record: '11–5' },
        { Year: 2024, Winner: 'Club 3 2024', PlayerID: '', Team: 'Club 3 2024', TeamID: 3, Owner: 'Owner 3', TeamLogo: '/three.webp', FPts: 1003, FPG: null, Record: '13–5' },
    ]);

    await publish2026();
    assert.deepEqual((await winners('jagr-cup')).map(w => [w.Year, w.TeamID, w.Record]), [[2026, 3, '13–5'], [2025, 1, '11–5'], [2024, 3, '13–5']]);
});

test("the Prime Minister's Trophy goes to the team season no other franchise matched on points, and to nobody in a level season or one still being played", async t => {
    const { winners, publish2026 } = await archiveLeague(t);
    assert.deepEqual(await winners('prime-minister'), [
        { Year: 2024, Winner: 'Club 2 2024', PlayerID: '', Team: 'Club 2 2024', TeamID: 2, Owner: 'Owner 2', TeamLogo: '/two.webp', FPts: 1500, FPG: null, Record: '12–5–1' },
    ], '2025 is level on the most points and 2026 is still being played');

    await publish2026();
    assert.deepEqual((await winners('prime-minister')).map(w => [w.Year, w.TeamID, w.FPts]), [[2026, 2, 9000], [2024, 2, 1500]]);
});

test('the award API lists the listed awards and returns the same winners as the archive for each, and no award that isn’t listed', async t => {
    const { league, archive } = await archiveLeague(t);
    const { GET: list } = await import('@/app/api/awards/route');
    const { GET } = await import('@/app/api/awards/[slug]/route');
    const get = async (slug: string) => (await league.runAsRoute('/api/awards/[slug]',
        () => GET(new Request(`http://yofhl.test/api/awards/${slug}`), { params: Promise.resolve({ slug }) }))).result;
    const listed = (await league.runAsRoute('/awards', () => archive.listed())).result;
    assert.deepEqual(listed.map(award => award.id),
        ['jagr-cup', 'prime-minister', 'wayne-gretzky', 'le-magnifique', 'bobby-orr', 'hasek', 'danny-briere', 'teemu-selanne']);
    const listResponse = (await league.runAsRoute('/api/awards', () => list())).result;
    assert.deepEqual((await listResponse.json()).map((award: { id: string }) => award.id), listed.map(award => award.id));

    for (const award of listed) {
        const response = await get(award.name.replaceAll(' ', '_'));
        assert.equal(response.status, 200, award.id);
        const expected = (await league.runAsRoute('/awards/[award]', () => archive.winners(award))).result;
        assert.deepEqual(await response.json(), JSON.parse(JSON.stringify({ award: { name: award.name, label: award.label, honor: award.honor }, winners: expected })), award.id);
    }
    assert.equal((await get('Prime_Minister%27s_Trophy')).status, 200, 'an encoded slug');
    for (const slug of ['GM_of_the_Year', 'Hart_Trophy']) assert.equal((await get(slug)).status, 404, slug);
});

test("a franchise's trophy case shows the Jagr Cups and Prime Minister's Trophies the archive gives it", async t => {
    const { league, archive, winners, publish2026 } = await archiveLeague(t);
    const trophyCase = async (id: number) => {
        const { cups, primeMinisters } = (await league.runAsRoute('/teams/[ID]', () => archive.franchiseHonors(id))).result;
        return { cups, primeMinisters };
    };
    /** the franchise's wins of the award with this ID, as the award page lists them */
    const wins = async (award: string, id: number) => (await winners(award)).filter(w => w.TeamID === id);
    await publish2026();
    for (const id of [1, 2, 3]) {
        assert.deepEqual(await trophyCase(id), {
            cups: (await wins('jagr-cup', id)).map(w => w.Year),
            primeMinisters: (await wins('prime-minister', id)).map(w => ({ year: w.Year, points: w.FPts })),
        }, `franchise ${id}`);
    }
    assert.deepEqual(await trophyCase(3), { cups: [2026, 2024], primeMinisters: [] });
    assert.deepEqual(await trophyCase(2), { cups: [], primeMinisters: [{ year: 2026, points: 9000 }, { year: 2024, points: 1500 }] });
});

test("an entered individual award's winners are its published seasons' stored winners, newest first, co-winners each a row", async t => {
    const { winners, publish2026 } = await archiveLeague(t);
    assert.deepEqual(await winners('wayne-gretzky'), [
        { Year: 2025, Winner: 'Skater One', PlayerID: 'p1', Team: 'Club 1 2025', TeamID: 1, TeamLogo: '/one-2025.webp', FPts: 310, FPG: 3.6 },
        { Year: 2025, Winner: 'Skater Two', PlayerID: 'p2', Team: 'Club 2 2025', TeamID: 2, TeamLogo: '/two.webp', FPts: 310, FPG: 3.4 },
        { Year: 2024, Winner: 'Skater One', PlayerID: 'p1', Team: 'Club 1 2024', TeamID: 1, TeamLogo: '/one.webp', FPts: 300, FPG: 3.5 },
    ], '2026 is still being played');

    await publish2026();
    assert.deepEqual((await winners('wayne-gretzky')).map(w => [w.Year, w.PlayerID]), [[2026, 'p3'], [2025, 'p1'], [2025, 'p2'], [2024, 'p1']]);
});

/** the stored individual awards, in catalogue order */
const STORED = AWARD_CATALOGUE.filter(award => award.decidedBy === 'stored');

test("a player's honours are the individual awards the archive's winners give them and their Jagr Cup rings", async t => {
    const { league, archive, winners, publish2026 } = await archiveLeague(t);
    const honors = async (id: string) => (await league.runAsRoute('/player/[ID]', () => archive.playerHonors(id))).result;
    assert.deepEqual(await honors('p3'), { awards: [], championships: [] }, '2026 is still being played');
    assert.deepEqual(await honors('p2'), {
        awards: [
            { id: 'wayne-gretzky', name: 'Wayne Gretzky Award', label: 'Wayne Gretzky Award', honor: 'Most outstanding player', year: 2025 },
            { id: 'hasek', name: 'Hasek Trophy', label: 'Hasek Trophy', honor: 'Top goaltender', year: 2025 },
        ],
        championships: [],
    });
    assert.deepEqual(await honors('p1'), {
        awards: [2024, 2025].map(year => ({ id: 'wayne-gretzky', name: 'Wayne Gretzky Award', label: 'Wayne Gretzky Award', honor: 'Most outstanding player', year })),
        championships: [{ season: 2025, team: 'Club 1 2025' }],
    });

    await publish2026();
    for (const id of ['p1', 'p2', 'p3']) {
        const won = [];
        for (const award of STORED) won.push(...(await winners(award.id)).filter(w => w.PlayerID === id).map(w => [w.Year, award.id]));
        assert.deepEqual((await honors(id)).awards.map(a => [a.year, a.id]).sort(), won.sort(), id);
    }
});

test("a season's awards are the stored awards it should have and its stored winners, a season without playoffs skipping the Danny Briere Award", async t => {
    const { league, archive, winners } = await archiveLeague(t);
    const seasonAwards = (year: number) => archive.seasonAwards(year);
    const p2 = { id: 'p2', name: 'Skater Two', positions: 'LW', fpts: 310, team: 'C2' };
    assert.deepEqual(await seasonAwards(2025), {
        expected: STORED,
        winners: [
            { award: 'wayne-gretzky', player: { id: 'p1', name: 'Skater One', positions: 'C', fpts: 310, team: 'C1' } },
            { award: 'wayne-gretzky', player: p2 },
            { award: 'hasek', player: p2 },
        ],
    });
    for (const year of [2024, 2025]) {
        const stored = [];
        for (const award of STORED) stored.push(...(await winners(award.id)).filter(w => w.Year === year).map(w => [award.id, w.PlayerID]));
        assert.deepEqual((await seasonAwards(year))!.winners.map(w => [w.award, w.player.id]), stored, `${year}`);
    }

    await league.client.exec(`update league.seasons set playoff_status = 'cancelled' where year = 2026`);
    assert.deepEqual(await seasonAwards(2026), {
        expected: STORED.filter(award => award.id !== 'danny-briere'),
        winners: [{ award: 'wayne-gretzky', player: { id: 'p3', name: 'Goalie Three', positions: 'G', fpts: 250, team: 'C3' } }],
    });
    assert.equal(await seasonAwards(2031), null, 'no such season');
});
