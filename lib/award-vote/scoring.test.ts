// Scoring ballots into tallies once every franchise has submitted or the ballot lock has passed, the admin's reads
// of the tallies and the ballots, and reopening a scored award vote with a new ballot lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BallotRankings, PlayerAwardId } from './model';
import { COMPLETE, completeFor, FRANCHISES, playerTally, SEASON, votingLeague } from './testing/award-vote-league';

test('scoring is refused while the ballot lock is ahead and a franchise has not submitted, and allowed once every franchise has', async t => {
    const { submitFor, score, admin } = await votingLeague(t);
    assert.deepEqual(await score(), { ok: false, reason: 'still-voting' });
    for (const franchise of FRANCHISES.slice(0, 3)) await submitFor(franchise, completeFor(franchise));
    assert.deepEqual(await score(), { ok: false, reason: 'still-voting' });
    assert.equal((await admin()).vote?.state, 'open');

    await submitFor(4, completeFor(4));
    assert.deepEqual(await score(), { ok: true });
    const { vote } = await admin();
    assert.equal(vote?.state, 'scored');
    assert.ok(vote?.scoredAt && Math.abs(Date.parse(vote.scoredAt) - Date.now()) < 60_000, 'scored just now');
});

test("a franchise with no team season that season can't cast a ballot, isn't listed as yet to submit, and doesn't hold up scoring", async t => {
    const { submitFor, signInAs, submit, headerAnswer, admin, score } = await votingLeague(t, {
        // franchise 5 joins next season, and its owner already manages it on the site
        arrange: async ({ league }) => { await league.client.exec(`
            insert into league.franchises (id, display_name, first_season) values (5, 'Expansion', ${SEASON + 1});
            insert into league.team_management (franchise_id, name, owner_uid, owner_email, version) values (5, 'Expansion', 'owner-5', 'owner5@example.test', 1);`); },
    });
    await signInAs('owner-5');
    assert.equal((await headerAnswer()).awardVote, null, 'no nudge');
    assert.deepEqual(await submit(COMPLETE), { ok: false, reason: 'no-team' });
    assert.deepEqual((await admin()).ballotStatus?.map(item => item.franchise.id), FRANCHISES);

    for (const franchise of FRANCHISES) await submitFor(franchise, completeFor(franchise));
    assert.deepEqual(await score(), { ok: true }, 'every franchise that played the season has submitted');
});

/** franchise 2's ballot: level with COMPLETE at the top of the Wayne Gretzky Award */
const SECOND: BallotRankings = completeFor(2, {
    ...COMPLETE,
    'wayne-gretzky': ['s2', 's1', 's6', 's3', 'g1'],
    'teemu-selanne': ['r1', 'r2'],
});

/** an award's tally lines as [player, points, votes at each rank, place] */
const lines = (tally: { lines: { playerId: string; points: number; votes: number[]; place: number }[] } | undefined) =>
    tally?.lines.map(line => [line.playerId, line.points, line.votes, line.place]);

test('once the ballot lock passes, submitted ballots score 10, 7, 5, 3 and 1, and a draft or no ballot adds nothing', async t => {
    const { submitFor, signInAs, saveDraft, ballotLockPasses, score, tallies } = await votingLeague(t);
    await submitFor(1, completeFor(1));
    await submitFor(2, completeFor(2, SECOND));
    // franchise 3 only has a draft, and franchise 4 nothing
    await signInAs('owner-3');
    await saveDraft(completeFor(3, { ...COMPLETE, 'wayne-gretzky': ['s6', 's5', 's4', 's3', 's2'] }));
    assert.deepEqual(await tallies(), { ok: false, reason: 'not-scored' });

    await ballotLockPasses();
    assert.deepEqual(await score(), { ok: true });
    const result = await tallies();
    assert.ok(result.ok);
    assert.equal(result.counted, 2);
    assert.deepEqual(result.tallies.map(tally => tally.award),
        ['wayne-gretzky', 'le-magnifique', 'bobby-orr', 'hasek', 'teemu-selanne', 'danny-briere', 'gm-of-the-year']);
    const tally = (award: PlayerAwardId) => playerTally(result.tallies, award);
    assert.equal(tally('wayne-gretzky')?.label, 'Wayne Gretzky Award');
    assert.deepEqual(lines(tally('wayne-gretzky')), [
        ['s1', 17, [1, 1, 0, 0, 0], 1],
        ['s2', 17, [1, 1, 0, 0, 0], 1],
        ['s3', 8, [0, 0, 1, 1, 0], 3],
        ['s6', 5, [0, 0, 1, 0, 0], 4],
        ['s4', 3, [0, 0, 0, 1, 0], 5],
        ['g1', 1, [0, 0, 0, 0, 1], 6],
        ['s5', 1, [0, 0, 0, 0, 1], 6],
    ]);
    assert.equal(tally('wayne-gretzky')?.lines[0].name, 'Skater s1');
    // the Teemu Trophy ranks only its two candidates, for 10 and 7
    assert.deepEqual(lines(tally('teemu-selanne')), [['r1', 20, [2, 0], 1], ['r2', 14, [0, 2], 2]]);
    assert.deepEqual(lines(tally('danny-briere')), [['s2', 20, [2, 0], 1], ['s1', 14, [0, 2], 2]]);
});

/** four ballots whose tallies need every step of the tie order, and give the Bobby Orr Award two winners */
const TIED: BallotRankings[] = [
    { 'wayne-gretzky': ['s1', 's2', 's3', 's4', 's6'], 'bobby-orr': ['d3', 'd4', 'd5', 'd2', 'd1'], hasek: ['g1', 'g2', 'g4', 'g5', 'g3'] },
    { 'wayne-gretzky': ['s1', 's2', 's3', 's5', 's6'], 'bobby-orr': ['d1', 'd3', 'd4', 'd2', 'd5'], hasek: ['g1', 'g3', 'g2', 'g4', 'g5'] },
    { 'wayne-gretzky': ['s1', 's2', 's3', 's5', 's6'], 'bobby-orr': ['d4', 'd2', 'd1', 'd3', 'd5'], hasek: ['g3', 'g2', 'g4', 'g5', 'g1'] },
    { 'wayne-gretzky': ['s1', 's2', 's3', 's5', 'g1'], 'bobby-orr': ['d2', 'd1', 'd3', 'd4', 'd5'], hasek: ['g4', 'g5', 'g3', 'g2', 'g1'] },
].map(ballot => ({ ...COMPLETE, ...ballot }));

test('places follow points, then first-place votes, then second-place votes and so on, and level candidates share a place', async t => {
    const { submitFor, score, tallies } = await votingLeague(t);
    for (const [index, ballot] of TIED.entries()) await submitFor(FRANCHISES[index], completeFor(FRANCHISES[index], ballot));
    assert.deepEqual(await score(), { ok: true }, 'every franchise has submitted');
    const result = await tallies();
    assert.ok(result.ok);
    const tally = (award: PlayerAwardId) => lines(playerTally(result.tallies, award));
    assert.deepEqual(tally('hasek'), [
        // level on 23 points and one first-place vote: g3 has more second-place votes
        ['g3', 23, [1, 1, 1, 0, 1], 1],
        ['g4', 23, [1, 0, 2, 1, 0], 2],
        // level on 22 points: g1 has more first-place votes
        ['g1', 22, [2, 0, 0, 0, 2], 3],
        ['g2', 22, [0, 2, 1, 1, 0], 4],
        ['g5', 14, [0, 1, 0, 2, 1], 5],
    ]);
    assert.deepEqual(tally('bobby-orr'), [
        // level on everything: both win
        ['d3', 25, [1, 1, 1, 1, 0], 1],
        ['d4', 25, [1, 1, 1, 1, 0], 1],
        // level on points, first- and second-place votes: d1 has more third-place votes
        ['d1', 23, [1, 1, 1, 0, 1], 3],
        ['d2', 23, [1, 1, 0, 2, 0], 4],
        ['d5', 8, [0, 0, 1, 0, 3], 5],
    ]);
    assert.deepEqual(tally('wayne-gretzky'), [
        ['s1', 40, [4, 0, 0, 0, 0], 1],
        ['s2', 28, [0, 4, 0, 0, 0], 2],
        ['s3', 20, [0, 0, 4, 0, 0], 3],
        ['s5', 9, [0, 0, 0, 3, 0], 4],
        // level on 3 points and no first-, second- or third-place votes: s4 has a fourth-place vote
        ['s4', 3, [0, 0, 0, 1, 0], 5],
        ['s6', 3, [0, 0, 0, 0, 3], 6],
        ['g1', 1, [0, 0, 0, 0, 1], 7],
    ]);
});

test('a void ballot adds nothing to any tally', async t => {
    const { submitFor, league, score, tallies } = await votingLeague(t);
    for (const franchise of FRANCHISES) await submitFor(franchise, completeFor(franchise, franchise === 2 ? SECOND : COMPLETE));
    // voiding is its own operation later; here franchise 2's ballot is simply stored void
    await league.client.exec(`update league.award_vote_ballots set void_reason = 'bad faith', voided_at = now() where franchise_id = 2`);
    assert.deepEqual(await score(), { ok: true });
    const result = await tallies();
    assert.ok(result.ok);
    assert.equal(result.counted, 3);
    assert.deepEqual(lines(playerTally(result.tallies, 'wayne-gretzky'))?.slice(0, 2),
        [['s1', 30, [3, 0, 0, 0, 0], 1], ['s2', 21, [0, 3, 0, 0, 0], 2]]);
});

test('the admin reads every submitted ballot\'s rankings only once the ballot lock has passed, and owners never read another franchise\'s', async t => {
    const { submitFor, signInAs, saveDraft, ownBallot, read, ballots, ballotLockPasses, score } = await votingLeague(t);
    await submitFor(1, completeFor(1));
    await submitFor(2, completeFor(2, SECOND));
    await signInAs('owner-3');
    await saveDraft({ hasek: ['g5'] });
    assert.deepEqual(await ballots(), { ok: false, reason: 'not-locked' });

    await ballotLockPasses();
    const result = await ballots();
    assert.ok(result.ok);
    assert.deepEqual(result.ballots.map(({ franchise, owner, rankings, voidReason }) => [franchise.id, franchise.name, owner, rankings, voidReason]), [
        [1, 'Club 1', 'Owner 1', COMPLETE, null],
        [2, 'Club 2', 'Owner 2', SECOND, null],
    ]);
    assert.ok(result.ballots.every(ballot => Math.abs(Date.parse(ballot.submittedAt) - Date.now()) < 60_000));
    // an owner still reads only their own franchise's ballot
    assert.deepEqual(await ownBallot(), { draft: { hasek: ['g5', null, null, null, null] }, submitted: null, submittedAt: null });
    const view = await read();
    assert.ok(view.status === 'ballot');
    assert.deepEqual(Object.keys(view).sort(), ['awards', 'ballot', 'ballotLock', 'ballotStatus', 'gmOfTheYear', 'lists', 'locked', 'seasonYear', 'status', 'team']);

    assert.deepEqual(await score(), { ok: true });
    assert.equal((await ballots()).ok, true, 'and once scored');
});

test('the admin reads no rankings before voting opens', async t => {
    const { ballots } = await votingLeague(t, { open: false });
    assert.deepEqual(await ballots(), { ok: false, reason: 'not-locked' });
});

test('reopening a scored award vote takes a new ballot lock and keeps every ballot editable, and scoring again replaces the tallies', async t => {
    const { act, vote, submitFor, signInAs, saveDraft, submit, ownBallot, admin, ballotLockPasses, score, reopen, tallies, ballots } = await votingLeague(t);
    await submitFor(1, completeFor(1));
    await submitFor(2, completeFor(2, SECOND));
    await signInAs('owner-3');
    await saveDraft({ hasek: ['g5'] });
    await ballotLockPasses();
    assert.deepEqual(await reopen(), { ok: false, reason: 'not-scored' }, 'only a scored vote reopens');
    await score();
    assert.deepEqual(await score(), { ok: false, reason: 'not-open' }, 'already scored');

    assert.deepEqual(await reopen(-1), { ok: false, reason: 'lock-passed' });
    assert.deepEqual(await act(() => vote.reopenVoting({ seasonYear: SEASON, ballotLock: 'tomorrow' })), { ok: false, reason: 'invalid-lock' });
    assert.equal((await admin()).vote?.state, 'scored');
    assert.deepEqual(await reopen(48), { ok: true });
    const { vote: summary } = await admin();
    assert.equal(summary?.state, 'open');
    assert.ok(summary?.ballotLock && Date.parse(summary.ballotLock) > Date.now() + 47 * 3600_000, 'the new ballot lock');
    // nobody reads rankings or tallies while owners can change their ballots again
    assert.deepEqual(await ballots(), { ok: false, reason: 'not-locked' });
    assert.deepEqual(await tallies(), { ok: false, reason: 'not-scored' });

    // franchise 3's draft is still there to finish, and franchise 2 changes its submitted ballot
    assert.deepEqual((await ownBallot())?.draft, { hasek: ['g5', null, null, null, null] });
    assert.deepEqual(await submit(completeFor(3, { ...COMPLETE, hasek: ['g5', 'g1', 'g2', 'g3', 'g4'] })), { ok: true });
    await signInAs('owner-2');
    assert.deepEqual((await ownBallot())?.submitted, SECOND);
    assert.deepEqual(await submit({ ...SECOND, 'wayne-gretzky': ['s2', 's1', 's3', 's4', 's5'] }), { ok: true });

    await ballotLockPasses();
    assert.deepEqual(await score(), { ok: true });
    const result = await tallies();
    assert.ok(result.ok);
    assert.equal(result.counted, 3);
    // s6 and g1 are no longer ranked for the Wayne Gretzky Award
    assert.deepEqual(lines(playerTally(result.tallies, 'wayne-gretzky')), [
        ['s1', 27, [2, 1, 0, 0, 0], 1],
        ['s2', 24, [1, 2, 0, 0, 0], 2],
        ['s3', 15, [0, 0, 3, 0, 0], 3],
        ['s4', 9, [0, 0, 0, 3, 0], 4],
        ['s5', 3, [0, 0, 0, 0, 3], 5],
    ]);
    assert.deepEqual(lines(playerTally(result.tallies, 'hasek'))?.[0], ['g1', 27, [2, 1, 0, 0, 0], 1]);
});

test('once scored, and after reopening, preparing again, starting over, rookie changes, retrying lookups and ballot writes are refused as before', async t => {
    const { act, vote, submitFor, ballotLockPasses, score, reopen, signInAs, saveDraft, submit, read, headerAnswer, nhl, fantrax } = await votingLeague(t);
    await submitFor(1, completeFor(1));
    await ballotLockPasses();
    await score();
    t.mock.method(console, 'error', () => {});
    nhl.failing.add('r1');
    const refusedPreparing = async (when: string) => {
        const reads = fantrax.reads.length;
        assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: false, reason: 'not-prepared' }, when);
        assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON, startOver: true })), { ok: false, reason: 'not-prepared' }, when);
        assert.deepEqual(await act(() => vote.adjustRookie({ seasonYear: SEASON, playerId: 's1', change: 'add' })), { ok: false, reason: 'not-prepared' }, when);
        assert.deepEqual(await act(() => vote.adjustRookie({ seasonYear: SEASON, playerId: 'r1', change: 'remove' })), { ok: false, reason: 'not-prepared' }, when);
        assert.deepEqual(await act(() => vote.retryFailedLookups({ seasonYear: SEASON })), { ok: false, reason: 'not-prepared' }, when);
        assert.equal(fantrax.reads.length, reads, `nothing read from Fantrax ${when}`);
    };
    await refusedPreparing('once scored');
    assert.deepEqual(await act(() => vote.moveBallotLock({ seasonYear: SEASON, ballotLock: new Date(Date.now() + 3600_000).toISOString() })),
        { ok: false, reason: 'not-open' });
    await signInAs('owner-2');
    assert.deepEqual(await saveDraft(COMPLETE), { ok: false, reason: 'not-open' });
    assert.deepEqual(await submit(COMPLETE), { ok: false, reason: 'not-open' });
    assert.deepEqual(await read(), { status: 'no-vote' });
    assert.equal((await headerAnswer()).awardVote, null);

    await reopen();
    await refusedPreparing('after reopening');
    const review = await act(() => vote.readRookieReview({ seasonYear: SEASON }));
    assert.equal(review?.adjustable, false);
});
