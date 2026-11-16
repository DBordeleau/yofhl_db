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
    const league = await import('@/lib/data/league');
    /** GM of the Year's award page: each winner as [season, team, franchise, owner] */
    const awardPage = async () => (await route('/awards/[award]', () => league.getTeamAwardWinners('gm-of-the-year')))
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
    const league = await import('@/lib/data/league');
    const { searchPublicDirectory } = await import('@/lib/data/search');
    /** where GM of the Year is listed with `catalogue`: navigation and the award gallery, search, the award API's list and its winners */
    const listed = async (catalogue?: readonly AwardDefinition[]) => {
        const gallery = (await route('/awards', () => league.getListedAwards(catalogue))).some(award => award.id === 'gm-of-the-year');
        const search = (await route('/search', () => searchPublicDirectory({ q: 'GM of the Year', type: 'awards', page: 1 }, catalogue))).total > 0;
        const api = (await route('/api/awards', () => league.getListedAwardTypes(catalogue))).some(award => award.name === 'GM of the Year');
        const winners = await route('/api/awards/[slug]', () => league.getListedAwardWinners('GM of the Year', catalogue));
        return { gallery, search, api, winners: winners?.winners.map(winner => [winner.Year, winner.Winner, winner.Owner]) ?? null };
    };
    const hidden = { gallery: false, search: false, api: false, winners: null };
    assert.deepEqual(await listed(RELEASED), hidden, 'released, scored but not published');
    assert.deepEqual(await listed(), hidden, 'unreleased, scored but not published');

    assert.deepEqual((await publish()).result, { ok: true });
    assert.deepEqual(await listed(), hidden, 'unreleased, published');
    assert.deepEqual(await listed(RELEASED), { gallery: true, search: true, api: true, winners: [[SEASON, 'Club 1', 'Owner 1']] }, 'released, published');
});

test("a GM of the Year win is in the winning franchise's trophy case once it is released", async t => {
    const { route, publish } = await scoredLeague(t, SHARED);
    const { getFranchiseHonors } = await import('@/lib/data/history');
    /** franchise `id`'s trophy case: its voted team awards as [award, seasons] */
    const trophyCase = async (id: number, catalogue?: readonly AwardDefinition[]) =>
        (await route('/teams/[ID]', () => getFranchiseHonors(id, catalogue))).teamAwards.map(award => [award.id, award.years]);
    assert.deepEqual(await trophyCase(1, RELEASED), [], 'released, scored but not published');

    assert.deepEqual((await publish()).result, { ok: true });
    assert.deepEqual(await trophyCase(1), [], 'unreleased, published');
    assert.deepEqual(await trophyCase(1, RELEASED), [['gm-of-the-year', [SEASON]]]);
    assert.deepEqual(await trophyCase(2, RELEASED), [['gm-of-the-year', [SEASON]]], 'a shared award is in each winner\'s trophy case');
    assert.deepEqual(await trophyCase(3, RELEASED), []);
});
