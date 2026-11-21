// GM of the Year's winner on the site: read from the published tally's place-one rows, never the player-keyed awards
// archive. Its own award page shows the winners once published; every list of awards (navigation, the award gallery,
// search, the award API, the franchise trophy case) shows it only once it is released in the catalogue as well.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AWARD_CATALOGUE, type AwardDefinition } from '@/lib/awards';
import { COMPLETE, completeFor, SEASON, votingLeague } from './testing/award-vote-league';

/** the catalogue as it will be once the league owner releases GM of the Year */
const RELEASED: readonly AwardDefinition[] = AWARD_CATALOGUE.map(award =>
    award.id === 'gm-of-the-year' ? { ...award, released: undefined } : award);

/** franchises 3 and 4 split their firsts between team seasons 11 and 12, leaving franchises 1 and 2 level */
const SHARED = {
    1: completeFor(1),
    2: completeFor(2),
    3: { ...COMPLETE, 'gm-of-the-year': ['11', '12', '14'] },
    4: { ...COMPLETE, 'gm-of-the-year': ['12', '11', '13'] },
};

/** a voting league with every ballot submitted (by default franchise 1 wins GM of the Year alone) and scored */
async function scoredLeague(t: Parameters<typeof votingLeague>[0], ballots: Record<number, ReturnType<typeof completeFor>> = {}) {
    const harness = await votingLeague(t);
    for (const franchise of [1, 2, 3, 4]) await harness.submitFor(franchise, ballots[franchise] ?? completeFor(franchise));
    assert.deepEqual(await harness.score(), { ok: true });
    const route = async <T>(path: string, fn: () => Promise<T>) => (await harness.league.runAsRoute(path, fn)).result;
    const { winners } = await import('@/lib/data/award-archive');
    /** GM of the Year's award page: each winner as [season, team, franchise, owner] */
    const awardPage = async () => (await route('/awards/[award]', () => winners('gm-of-the-year')))!
        .map(winner => [winner.Year, winner.Winner, winner.TeamID, winner.Owner]);
    return { ...harness, route, awardPage };
}

test("GM of the Year's award page lists each winning team season under its season identity and that season's owner, co-winners and all, once published", async t => {
    const { awardPage, publish, league } = await scoredLeague(t, SHARED);
    // franchise 1's owner the season before doesn't take the 2026–27 win
    await league.client.exec(`insert into league.owners (id, name) values (9, 'Earlier Owner'); update league.team_seasons set owner_id = 9 where id = 1;`);
    assert.deepEqual(await awardPage(), [], 'scored, not published');

    assert.deepEqual((await publish()).result, { ok: true });
    assert.deepEqual((await awardPage()).toSorted((a, b) => Number(a[2]) - Number(b[2])),
        [[SEASON, 'Club 1', 1, 'Owner 1'], [SEASON, 'Club 2', 2, 'Owner 2']]);
});

test('lists of awards show GM of the Year only once it is released and one of its tallies is published', async t => {
    const { route, publish } = await scoredLeague(t);
    const { listed: listedAwards } = await import('@/lib/data/award-archive');
    const { searchPublicDirectory } = await import('@/lib/data/search');
    const { GET: list } = await import('@/app/api/awards/route');
    const { GET: awardWinners } = await import('@/app/api/awards/[slug]/route');
    /** where GM of the Year is listed with `catalogue`: navigation and the award gallery, and search */
    const listed = async (catalogue?: readonly AwardDefinition[]) => ({
        gallery: (await route('/awards', () => listedAwards(catalogue))).some(award => award.id === 'gm-of-the-year'),
        search: (await route('/search', () => searchPublicDirectory({ q: 'GM of the Year', type: 'awards', page: 1 }, catalogue))).total > 0,
    });
    /** the award API with the real catalogue, where GM of the Year is unreleased: its list, and its winners' status */
    const api = async () => {
        const awards: { id: string }[] = await (await route('/api/awards', () => list())).json();
        const slug = 'GM_of_the_Year';
        const response = await route('/api/awards/[slug]', () => awardWinners(new Request(`http://yofhl.test/api/awards/${slug}`), { params: Promise.resolve({ slug }) }));
        return { list: awards.some(award => award.id === 'gm-of-the-year'), status: response.status };
    };
    const hidden = { gallery: false, search: false };
    assert.deepEqual(await listed(RELEASED), hidden, 'released, scored but not published');
    assert.deepEqual(await listed(), hidden, 'unreleased, scored but not published');
    assert.deepEqual(await api(), { list: false, status: 404 }, 'unreleased, scored but not published');

    assert.deepEqual((await publish()).result, { ok: true });
    assert.deepEqual(await listed(), hidden, 'unreleased, published');
    assert.deepEqual(await api(), { list: false, status: 404 }, 'unreleased, published');
    assert.deepEqual(await listed(RELEASED), { gallery: true, search: true }, 'released, published');
});

test("GM of the Year's winners are found by any spelling of its name the catalogue knows", async t => {
    const { route, publish } = await scoredLeague(t);
    const { winners } = await import('@/lib/data/award-archive');
    assert.deepEqual((await publish()).result, { ok: true });
    for (const name of ['GM of the Year', 'gm of the year', 'gm-of-the-year']) {
        const won = await route('/awards/[award]', () => winners(name));
        assert.deepEqual(won?.map(winner => [winner.Year, winner.Winner]), [[SEASON, 'Club 1']], name);
    }
});

test("a GM of the Year win is in the winning franchise's trophy case once it is released", async t => {
    const { route, publish } = await scoredLeague(t, SHARED);
    const { franchiseHonors } = await import('@/lib/data/award-archive');
    /** franchise `id`'s trophy case: its voted team awards as [award, seasons] */
    const trophyCase = async (id: number, catalogue?: readonly AwardDefinition[]) =>
        (await route('/teams/[ID]', () => franchiseHonors(id, catalogue))).teamAwards.map(award => [award.id, award.years]);
    assert.deepEqual(await trophyCase(1, RELEASED), [], 'released, scored but not published');

    assert.deepEqual((await publish()).result, { ok: true });
    assert.deepEqual(await trophyCase(1), [], 'unreleased, published');
    assert.deepEqual(await trophyCase(1, RELEASED), [['gm-of-the-year', [SEASON]]]);
    assert.deepEqual(await trophyCase(2, RELEASED), [['gm-of-the-year', [SEASON]]], 'a shared award is in each winner\'s trophy case');
    assert.deepEqual(await trophyCase(3, RELEASED), []);
});
