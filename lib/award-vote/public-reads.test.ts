// What visitors see of an award vote: nothing until it is published, then each award's tally on its award page and
// every franchise's ballot on the season's ballots page, void ballots and franchises that didn't vote included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BallotRankings, PlayerAwardId } from './model';
import { COMPLETE, completeFor, SEASON, votingLeague } from './testing/award-vote-league';

/** franchise 2's ballot: s2 first for the Wayne Gretzky Award */
const SECOND: BallotRankings = completeFor(2, { ...COMPLETE, 'wayne-gretzky': ['s2', 's1', 's3', 's4', 's5'] });

/** a voting league with public reads run as the public pages run them, through their cache */
async function publicLeague(t: Parameters<typeof votingLeague>[0]) {
    const harness = await votingLeague(t);
    const { league, vote } = harness;
    const ballotsPage = async (seasonYear = SEASON) =>
        (await league.runAsRoute('/season/[year]/ballots', () => vote.readPublishedBallots({ seasonYear }))).result;
    /** an award page's published tallies, as [season, counted, [player, name, place, points, votes]] */
    const awardPage = async (award: PlayerAwardId) =>
        (await league.runAsRoute('/awards/[award]', () => vote.readPublishedTallies({ award }))).result
            .map(tally => [tally.seasonYear, tally.counted, tally.lines.map(line => [line.playerId, line.name, line.place, line.points, line.votes])]);
    /** franchises 1–3 submit, franchise 4 doesn't, the lock passes and franchise 2's ballot is voided, then it's scored */
    const scoreWithVoid = async () => {
        await harness.submitFor(1, completeFor(1));
        await harness.submitFor(2, completeFor(2, SECOND));
        await harness.submitFor(3, completeFor(3));
        await harness.ballotLockPasses();
        assert.deepEqual(await harness.act(() => vote.voidBallot({ seasonYear: SEASON, franchiseId: 2, reason: 'Ranked only his own players.' })), { ok: true });
        assert.deepEqual(await harness.score(), { ok: true });
    };
    return { ...harness, ballotsPage, awardPage, scoreWithVoid };
}

test('nothing about an award vote is public before it is published: no tallies, no ballots', async t => {
    const { ballotsPage, awardPage, submitFor, scoreWithVoid, reopen, score, ballotLockPasses } = await publicLeague(t);
    const nothing = async (when: string) => {
        assert.deepEqual(await ballotsPage(), { ok: false, reason: 'not-published' }, when);
        assert.deepEqual(await awardPage('wayne-gretzky'), [], when);
    };
    await nothing('open');
    await submitFor(1, completeFor(1));
    await nothing('a ballot submitted');
    await scoreWithVoid();
    await nothing('scored');
    assert.deepEqual(await reopen(), { ok: true });
    await nothing('reopened');
    await ballotLockPasses();
    assert.deepEqual(await score(), { ok: true });
    await nothing('scored again');
    assert.deepEqual(await ballotsPage(2026), { ok: false, reason: 'not-published' }, 'a season with no award vote');
});

test('publishing shows each award\'s tally on its award page, and expires the pages read before it', async t => {
    const { awardPage, ballotsPage, scoreWithVoid, publish } = await publicLeague(t);
    await scoreWithVoid();
    // read before publishing, so both pages are cached without the vote
    assert.deepEqual(await awardPage('wayne-gretzky'), []);
    assert.deepEqual(await ballotsPage(), { ok: false, reason: 'not-published' });

    const { result, revalidatedTags } = await publish();
    assert.deepEqual(result, { ok: true });
    assert.ok(revalidatedTags.includes(`league:award-vote-ballots:${SEASON}`), 'the season\'s ballots page');
    assert.ok(revalidatedTags.includes('league:award-vote-tallies'), 'the award pages\' tallies');

    // franchise 2's void ballot counts for nothing and franchise 4 didn't vote: two ballots counted
    assert.deepEqual(await awardPage('wayne-gretzky'), [[SEASON, 2, [
        ['s1', 'Skater s1', 1, 20, [2, 0, 0, 0, 0]],
        ['s2', 'Skater s2', 2, 14, [0, 2, 0, 0, 0]],
        ['s3', 'Skater s3', 3, 10, [0, 0, 2, 0, 0]],
        ['s4', 'Skater s4', 4, 6, [0, 0, 0, 2, 0]],
        ['s5', 'Skater s5', 5, 2, [0, 0, 0, 0, 2]],
    ]]]);
    assert.deepEqual(await awardPage('teemu-selanne'), [[SEASON, 2, [
        ['r1', 'Skater r1', 1, 20, [2, 0]],
        ['r2', 'Skater r2', 2, 14, [0, 2]],
    ]]]);
    assert.equal((await ballotsPage()).ok, true);
});

test('once published, the ballots page shows every franchise\'s ballot under its season identity and owner, void ballots with their reason, and franchises that didn\'t vote', async t => {
    const { ballotsPage, scoreWithVoid, publish, league } = await publicLeague(t);
    await scoreWithVoid();
    // franchise 3 is renamed in a later season and has a new owner: the page keeps who it was this season
    await league.client.exec(`
        insert into league.seasons values (2028, '2027–28', 'complete');
        insert into league.owners (id, name) values (9, 'Owner 9');
        insert into league.team_seasons (id, season_year, franchise_id, owner_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against, logo_url)
            values (23, 2028, 3, 9, 'Renamed 3', 'Renamed 3', 'R3', 1, 3, 0, 0, 0, 0, 0, '/logos/r3.png');`);
    assert.deepEqual((await publish()).result, { ok: true });

    const page = await ballotsPage();
    assert.ok(page.ok, 'published');
    assert.equal(page.seasonYear, SEASON);
    assert.equal(page.counted, 2);
    assert.deepEqual(page.awards.map(award => [award.award, award.depth]), [
        ['wayne-gretzky', 5], ['le-magnifique', 5], ['bobby-orr', 5], ['hasek', 5], ['teemu-selanne', 2], ['danny-briere', 2],
    ]);
    assert.deepEqual(page.ballots.map(ballot => [ballot.team.franchiseId, ballot.team.name, ballot.team.logo, ballot.owner, ballot.voted, ballot.voidReason]), [
        [1, 'Club 1', '/logos/c1.png', 'Owner 1', true, null],
        [2, 'Club 2', '/logos/c2.png', 'Owner 2', true, 'Ranked only his own players.'],
        [3, 'Club 3', '/logos/c3.png', 'Owner 3', true, null],
        [4, 'Club 4', '/logos/c4.png', 'Owner 4', false, null],
    ]);
    const ranked = (franchiseId: number, award: PlayerAwardId) =>
        page.ballots.find(ballot => ballot.team.franchiseId === franchiseId)?.rankings.find(ranking => ranking.award === award)?.players
            .map(player => player && [player.playerId, player.name]);
    assert.deepEqual(ranked(1, 'wayne-gretzky'), [['s1', 'Skater s1'], ['s2', 'Skater s2'], ['s3', 'Skater s3'], ['s4', 'Skater s4'], ['s5', 'Skater s5']]);
    assert.deepEqual(ranked(2, 'wayne-gretzky'), [['s2', 'Skater s2'], ['s1', 'Skater s1'], ['s3', 'Skater s3'], ['s4', 'Skater s4'], ['s5', 'Skater s5']]);
    assert.deepEqual(ranked(1, 'danny-briere'), [['s2', 'Skater s2'], ['s1', 'Skater s1']]);
    assert.deepEqual(page.ballots.find(ballot => ballot.team.franchiseId === 4)?.rankings, []);
});
