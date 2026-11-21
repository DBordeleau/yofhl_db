// Publishing a scored award vote: its winners written into the awards archive, which every page showing award
// winners reads, and every write refused for the season afterwards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BallotRankings } from './model';
import { COMPLETE, completeFor, FRANCHISES, lockInHours, SEASON, votingLeague, type AwardVoteLeague } from './testing/award-vote-league';

/** franchises 2 and 4's ballot: s2 above s1 for the Wayne Gretzky Award, leaving the two level */
const S2_FIRST: BallotRankings = completeFor(2, { ...COMPLETE, 'wayne-gretzky': ['s2', 's1', 's3', 's4', 's5'] });

/** an award page's winners from the award archive, as [season, winner, player, team] by player, read through the page's cache */
async function awardPages({ league }: AwardVoteLeague) {
    const { winners } = await import('@/lib/data/award-archive');
    return async (name: string) => {
        const { result } = await league.runAsRoute('/awards/[award]', () => winners(name));
        return result?.toSorted((a, b) => a.PlayerID.localeCompare(b.PlayerID))
            .map(winner => [winner.Year, winner.Winner, winner.PlayerID, winner.Team ?? null]);
    };
}

/** a league with every franchise's ballot submitted and scored */
async function scoredLeague(t: Parameters<typeof votingLeague>[0], options: Parameters<typeof votingLeague>[1] = {}) {
    const harness = await votingLeague(t, options);
    await harness.submitFor(1, completeFor(1));
    await harness.submitFor(2, completeFor(2, S2_FIRST));
    await harness.submitFor(3, completeFor(3));
    await harness.submitFor(4, completeFor(4, S2_FIRST));
    assert.deepEqual(await harness.score(), { ok: true });
    return { ...harness, awardPage: await awardPages(harness) };
}

test('publishing writes every award\'s place-one candidates into the archive, co-winners and all, and the award pages show them', async t => {
    const { publish, awardPage, admin } = await scoredLeague(t);
    // read before publishing, so the pages are cached without the winners
    assert.deepEqual(await awardPage('Wayne Gretzky Award'), []);

    const { result, revalidatedTags } = await publish();
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(revalidatedTags.toSorted(),
        [`league:award-vote-ballots:${SEASON}`, 'league:award-vote-tallies', 'league:awards', 'league:players', 'league:records', 'league:season-leaderboard', `league:season:${SEASON}`]);
    const { vote } = await admin();
    assert.equal(vote?.state, 'published');
    assert.ok(vote?.publishedAt && Math.abs(Date.parse(vote.publishedAt) - Date.now()) < 60_000, 'published just now');

    // s1 is the archive's player; s2 and the rest the archive has never had, so they are added as the snapshot names them
    assert.deepEqual(await awardPage('Wayne Gretzky Award'), [[SEASON, 'Archive s1', 's1', 'Club 1'], [SEASON, 'Skater s2', 's2', null]]);
    assert.deepEqual(await awardPage('Le Magnifique'), [[SEASON, 'Goalie g1', 'g1', null]]);
    assert.deepEqual(await awardPage('Bobby Orr Award'), [[SEASON, 'Skater d1', 'd1', null]]);
    assert.deepEqual(await awardPage('Hasek Trophy'), [[SEASON, 'Goalie g1', 'g1', null]]);
    assert.deepEqual(await awardPage('Teemu Trophy'), [[SEASON, 'Skater r1', 'r1', null]]);
    // the Danny Briere Award's credited franchise is the finalist s2 played for
    assert.deepEqual(await awardPage('Danny Briere Award'), [[SEASON, 'Skater s2', 's2', 'Club 1']]);
});

test('a winner dropped before the season ended is credited to the franchise that dropped them, and hand-entered winners are replaced', async t => {
    const { publish, awardPage } = await scoredLeague(t, {
        arrange: async ({ endedSeasonWith, dropped }) => {
            // d1 ended the season a free agent, dropped by franchise 2 in October
            await endedSeasonWith('d1', null);
            await dropped('d1', 2, '2026-10-20');
        },
    });
    const { saveAwards } = await import('@/lib/data/curated-edits');
    // the hand-entry editor credits a winner's end-of-season team
    assert.deepEqual(await saveAwards(SEASON, [{ award: 'bobby-orr', playerId: 'd1' }, { award: 'hasek', playerId: 's1' }], { invalidate: () => {} }),
        { ok: true, saved: 2 });
    assert.deepEqual(await awardPage('Bobby Orr Award'), [[SEASON, 'Archive d1', 'd1', null]]);

    assert.deepEqual((await publish()).result, { ok: true });
    assert.deepEqual(await awardPage('Bobby Orr Award'), [[SEASON, 'Archive d1', 'd1', 'Club 2']]);
    assert.deepEqual(await awardPage('Hasek Trophy'), [[SEASON, 'Goalie g1', 'g1', null]]);
});

test('publishing is refused until the award vote is scored, and while voting is reopened', async t => {
    const harness = await votingLeague(t, { open: false });
    const { publish, openVoting, submitFor, score, reopen, admin } = harness;
    const awardPage = await awardPages(harness);
    const notScored = { result: { ok: false, reason: 'not-scored' }, revalidatedTags: [] };
    assert.deepEqual(await publish(), notScored, 'prepared');
    await openVoting();
    for (const franchise of FRANCHISES) await submitFor(franchise, completeFor(franchise));
    assert.deepEqual(await publish(), notScored, 'open');
    assert.deepEqual(await score(), { ok: true });
    assert.deepEqual(await reopen(), { ok: true });
    assert.deepEqual(await publish(), notScored, 'reopened');
    assert.equal((await admin()).vote?.state, 'open');
    assert.deepEqual(await awardPage('Wayne Gretzky Award'), []);

    assert.deepEqual(await score(), { ok: true });
    assert.deepEqual((await publish()).result, { ok: true });
    assert.deepEqual(await publish(), notScored, 'published');
    assert.deepEqual(await awardPage('Wayne Gretzky Award'), [[SEASON, 'Archive s1', 's1', 'Club 1']]);
});

test('publishing is refused while no ballot counts, so the award vote has no tally, and the hand-entry awards editor still saves', async t => {
    const harness = await votingLeague(t);
    const { publish, score, ballotLockPasses, admin, league } = harness;
    const awardPage = await awardPages(harness);
    // no franchise submitted before the ballot lock
    await ballotLockPasses();
    assert.deepEqual(await score(), { ok: true });

    assert.deepEqual(await publish(), { result: { ok: false, reason: 'no-tally' }, revalidatedTags: [] });
    assert.equal((await admin()).vote?.state, 'scored');

    const { saveAwards } = await import('@/lib/data/curated-edits');
    const options = { invalidate: (tag: string) => league.expire(tag) };
    assert.deepEqual(await saveAwards(SEASON, [{ award: 'hasek', playerId: 's1' }], options), { ok: true, saved: 1 });
    assert.deepEqual(await awardPage('Hasek Trophy'), [[SEASON, 'Archive s1', 's1', 'Club 1']]);
});

test('once published, no write is accepted for the season, and its snapshot, tallies and winners stay as published', async t => {
    const { publish, act, vote, signInAs, saveDraft, submit, admin, tallies, awardPage } = await scoredLeague(t);
    assert.deepEqual((await publish()).result, { ok: true });
    const before = { preview: await admin(), tallies: await tallies(), page: await awardPage('Wayne Gretzky Award') };

    const seasonYear = SEASON;
    const ballotLock = lockInHours(48);
    assert.deepEqual(await act(() => vote.prepare({ seasonYear })), { ok: false, reason: 'not-prepared' });
    assert.deepEqual(await act(() => vote.prepare({ seasonYear, startOver: true })), { ok: false, reason: 'not-prepared' });
    assert.deepEqual(await act(() => vote.adjustRookie({ seasonYear, playerId: 'r1', change: 'remove' })), { ok: false, reason: 'not-prepared' });
    assert.deepEqual(await act(() => vote.adjustRookie({ seasonYear, playerId: 's6', change: 'add' })), { ok: false, reason: 'not-prepared' });
    assert.deepEqual(await act(() => vote.retryFailedLookups({ seasonYear })), { ok: false, reason: 'not-prepared' });
    assert.deepEqual(await act(() => vote.openVoting({ seasonYear, ballotLock })), { ok: false, reason: 'not-prepared' });
    assert.deepEqual(await act(() => vote.moveBallotLock({ seasonYear, ballotLock })), { ok: false, reason: 'not-open' });
    await signInAs('owner-1');
    assert.deepEqual(await saveDraft(COMPLETE), { ok: false, reason: 'not-open' });
    assert.deepEqual(await submit(S2_FIRST), { ok: false, reason: 'not-open' });
    assert.deepEqual(await act(() => vote.scoreBallots({ seasonYear })), { ok: false, reason: 'not-open' });
    assert.deepEqual(await act(() => vote.reopenVoting({ seasonYear, ballotLock })), { ok: false, reason: 'not-scored' });
    assert.deepEqual(await act(() => vote.voidBallot({ seasonYear, franchiseId: 2, reason: 'Bad faith.' })), { ok: false, reason: 'published' });
    assert.deepEqual(await act(() => vote.restoreBallot({ seasonYear, franchiseId: 2 })), { ok: false, reason: 'published' });
    assert.deepEqual((await publish()).result, { ok: false, reason: 'not-scored' });

    assert.deepEqual({ preview: await admin(), tallies: await tallies(), page: await awardPage('Wayne Gretzky Award') }, before);
});

test('the hand-entry awards editor is read-only and refused for a season whose award vote is published, and other seasons are unchanged', async t => {
    const { publish, awardPage, league } = await scoredLeague(t);
    const { saveAwards } = await import('@/lib/data/curated-edits');
    const { getSeasonAdmin } = await import('@/lib/admin/data');
    const tags: string[] = [];
    const options = { invalidate: (tag: string) => { tags.push(tag); league.expire(tag); } };
    await league.client.exec(`insert into league.player_seasons (player_id, season_year, team_season_id, nhl_team, positions, fpts, fpg)
        values ('s1', 2026, 1, 'EDM', '{C}', 10, 1)`);
    assert.equal((await getSeasonAdmin(SEASON))?.awardVotePublished, false);

    assert.deepEqual((await publish()).result, { ok: true });
    assert.equal((await getSeasonAdmin(SEASON))?.awardVotePublished, true);
    assert.deepEqual(await saveAwards(SEASON, [{ award: 'hasek', playerId: 's1' }], options), { ok: false, reason: 'award-vote-published' });
    assert.deepEqual(await saveAwards(SEASON, [{ award: 'hasek', playerId: null }], options), { ok: false, reason: 'award-vote-published' });
    assert.deepEqual(tags, []);
    assert.deepEqual(await awardPage('Hasek Trophy'), [[SEASON, 'Goalie g1', 'g1', null]]);

    // 2025–26 had no award vote
    assert.equal((await getSeasonAdmin(2026))?.awardVotePublished, false);
    assert.deepEqual(await saveAwards(2026, [{ award: 'hasek', playerId: 's1' }], options), { ok: true, saved: 1 });
    assert.deepEqual(await awardPage('Hasek Trophy'), [[SEASON, 'Goalie g1', 'g1', null], [2026, 'Archive s1', 's1', 'Old 1']]);
});

test('if refreshing the archive fails after publishing, the admin refreshes it again, and only for a published award vote', async t => {
    const { vote, league, publish, admin } = await scoredLeague(t);
    const refreshArchive = () => league.runAsRoute('/admin/seasons/[year]', () => vote.refreshArchive({ seasonYear: SEASON }));
    const careerAwards = async () => (await league.client.query<{ awards: number }>(
        `select awards from league.player_careers where player_id = 's1'`)).rows[0]?.awards;
    assert.deepEqual(await refreshArchive(), { result: { ok: false, reason: 'not-published' }, revalidatedTags: [] }, 'scored');

    await league.client.exec(`refresh materialized view league.player_careers`);
    assert.equal(await careerAwards(), 0);

    // the careers view can't be refreshed while publishing: the winners are written, the view stays behind
    await league.client.exec(`alter materialized view league.player_careers rename to player_careers_broken`);
    await assert.rejects(publish(), /player_careers/);
    await league.client.exec(`alter materialized view league.player_careers_broken rename to player_careers`);
    assert.equal((await admin()).vote?.state, 'published');
    assert.equal(await careerAwards(), 0);
    assert.deepEqual((await publish()).result, { ok: false, reason: 'not-scored' }, 'publishing is never repeated');

    const { result, revalidatedTags } = await refreshArchive();
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(revalidatedTags.toSorted(),
        [`league:award-vote-ballots:${SEASON}`, 'league:award-vote-tallies', 'league:awards', 'league:players', 'league:records', 'league:season-leaderboard', `league:season:${SEASON}`]);
    assert.equal(await careerAwards(), 1);
});
