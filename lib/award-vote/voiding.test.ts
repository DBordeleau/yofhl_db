// Voiding a submitted ballot with a reason once the ballot lock has passed, and restoring it any time before publishing: a void
// ballot adds nothing to any tally, and voiding or restoring in a scored award vote recomputes the tallies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BallotRankings } from './model';
import { COMPLETE, SEASON, votingLeague } from './testing/award-vote-league';

/** franchise 2's ballot: s2 first for the Wayne Gretzky Award */
const SECOND: BallotRankings = { ...COMPLETE, 'wayne-gretzky': ['s2', 's1', 's3', 's4', 's5'] };

async function voidingLeague(t: Parameters<typeof votingLeague>[0]) {
    const league = await votingLeague(t);
    const { act, vote, ballots } = league;
    /** the admin voids franchise `franchiseId`'s ballot for `reason` */
    const voidBallot = (franchiseId: number, reason: unknown) => act(() => vote.voidBallot({ seasonYear: SEASON, franchiseId, reason }));
    /** the admin restores franchise `franchiseId`'s ballot */
    const restoreBallot = (franchiseId: number) => act(() => vote.restoreBallot({ seasonYear: SEASON, franchiseId }));
    /** each submitted ballot's franchise and void reason, as the admin reads the ballots */
    const voidReasons = async () => {
        const result = await ballots();
        assert.ok(result.ok, 'the admin reads the ballots');
        return result.ballots.map(ballot => [ballot.franchise.id, ballot.voidReason]);
    };
    return { ...league, voidBallot, restoreBallot, voidReasons };
}

test('once the ballot lock passes, the admin voids a submitted ballot with a reason, and scoring leaves it out', async t => {
    const { submitFor, ballotLockPasses, voidBallot, voidReasons, score, tallies } = await voidingLeague(t);
    await submitFor(1, COMPLETE);
    await submitFor(2, SECOND);
    await ballotLockPasses();
    assert.deepEqual(await voidBallot(2, '  Ranked only his own players.  '), { ok: true });
    assert.deepEqual(await voidReasons(), [[1, null], [2, 'Ranked only his own players.']]);

    assert.deepEqual(await score(), { ok: true });
    const result = await tallies();
    assert.ok(result.ok);
    assert.equal(result.counted, 1);
    assert.deepEqual(result.tallies.find(tally => tally.award === 'wayne-gretzky')?.lines.map(line => [line.playerId, line.points]),
        [['s1', 10], ['s2', 7], ['s3', 5], ['s4', 3], ['s5', 1]]);
});

test('voiding is refused before the ballot lock, without a reason, for a franchise with no submitted ballot, and for a void ballot', async t => {
    const { submitFor, signInAs, saveDraft, ballotLockPasses, voidBallot, voidReasons } = await voidingLeague(t);
    await submitFor(1, COMPLETE);
    await submitFor(2, SECOND);
    await signInAs('owner-3');
    await saveDraft({ hasek: ['g5'] });
    assert.deepEqual(await voidBallot(2, 'Bad faith.'), { ok: false, reason: 'not-locked' });

    await ballotLockPasses();
    assert.deepEqual(await voidBallot(2, '   '), { ok: false, reason: 'invalid-reason' });
    assert.deepEqual(await voidBallot(2, null), { ok: false, reason: 'invalid-reason' });
    assert.deepEqual(await voidBallot(2, 'x'.repeat(501)), { ok: false, reason: 'invalid-reason' });
    // franchise 3 only has a draft, franchise 4 nothing, and there is no franchise 9
    for (const franchise of [3, 4, 9]) assert.deepEqual(await voidBallot(franchise, 'Bad faith.'), { ok: false, reason: 'no-ballot' });
    assert.deepEqual(await voidReasons(), [[1, null], [2, null]]);

    assert.deepEqual(await voidBallot(2, 'Bad faith.'), { ok: true });
    assert.deepEqual(await voidBallot(2, 'Changed my mind about why.'), { ok: false, reason: 'already-void' });
    assert.deepEqual(await voidReasons(), [[1, null], [2, 'Bad faith.']]);
});

/** the Wayne Gretzky Award's tally as [player, points, votes at each rank, place], and how many ballots counted */
async function gretzky(tallies: Awaited<ReturnType<typeof voidingLeague>>['tallies']) {
    const result = await tallies();
    assert.ok(result.ok, 'the admin reads the tallies');
    const lines = result.tallies.find(tally => tally.award === 'wayne-gretzky')?.lines.map(line => [line.playerId, line.points, line.votes, line.place]);
    return { counted: result.counted, lines };
}

/** franchise 1 ranks s1 first, and franchises 2 and 3 rank s2 first */
const SCORED = {
    counted: 3,
    lines: [
        ['s2', 27, [2, 1, 0, 0, 0], 1],
        ['s1', 24, [1, 2, 0, 0, 0], 2],
        ['s3', 15, [0, 0, 3, 0, 0], 3],
        ['s4', 9, [0, 0, 0, 3, 0], 4],
        ['s5', 3, [0, 0, 0, 0, 3], 5],
    ],
};

/** the same once franchise 2's ballot is void: s1 and s2 are level on everything and share the award */
const WITHOUT_SECOND = {
    counted: 2,
    lines: [
        ['s1', 17, [1, 1, 0, 0, 0], 1],
        ['s2', 17, [1, 1, 0, 0, 0], 1],
        ['s3', 10, [0, 0, 2, 0, 0], 3],
        ['s4', 6, [0, 0, 0, 2, 0], 4],
        ['s5', 2, [0, 0, 0, 0, 2], 5],
    ],
};

test('voiding a ballot in a scored award vote recomputes every tally and its places at once', async t => {
    const { submitFor, ballotLockPasses, score, tallies, voidBallot, admin } = await voidingLeague(t);
    await submitFor(1, COMPLETE);
    await submitFor(2, SECOND);
    await submitFor(3, SECOND);
    await ballotLockPasses();
    await score();
    assert.deepEqual(await gretzky(tallies), SCORED);

    assert.deepEqual(await voidBallot(2, 'Bad faith.'), { ok: true });
    assert.deepEqual(await gretzky(tallies), WITHOUT_SECOND);
    assert.equal((await admin()).vote?.state, 'scored', 'still scored');
});

test('restoring a void ballot clears its reason and counts it again, recomputing the tallies of a scored award vote', async t => {
    const { submitFor, ballotLockPasses, score, tallies, voidBallot, restoreBallot, voidReasons } = await voidingLeague(t);
    await submitFor(1, COMPLETE);
    await submitFor(2, SECOND);
    await submitFor(3, SECOND);
    await ballotLockPasses();
    assert.deepEqual(await restoreBallot(2), { ok: false, reason: 'not-void' });
    assert.deepEqual(await restoreBallot(4), { ok: false, reason: 'no-ballot' });
    // voided and restored before scoring
    await voidBallot(2, 'Bad faith.');
    assert.deepEqual(await restoreBallot(2), { ok: true });
    assert.deepEqual(await voidReasons(), [[1, null], [2, null], [3, null]]);
    await score();
    assert.deepEqual(await gretzky(tallies), SCORED);

    // and after
    await voidBallot(2, 'Bad faith.');
    assert.deepEqual(await restoreBallot(2), { ok: true });
    assert.deepEqual(await voidReasons(), [[1, null], [2, null], [3, null]]);
    assert.deepEqual(await gretzky(tallies), SCORED);
    assert.deepEqual(await restoreBallot(2), { ok: false, reason: 'not-void' });
});

test('before the first ballot lock no ballot is void, so there is nothing to restore', async t => {
    const { submitFor, restoreBallot } = await voidingLeague(t);
    await submitFor(1, COMPLETE);
    assert.deepEqual(await restoreBallot(1), { ok: false, reason: 'not-void' });
    assert.deepEqual(await restoreBallot(2), { ok: false, reason: 'no-ballot' });
});

test('after reopening, the admin can restore a void ballot before the new ballot lock, though not void another, and it counts when scored again', async t => {
    const { submitFor, ballotLockPasses, score, reopen, tallies, voidBallot, restoreBallot, voidReasons, admin } = await voidingLeague(t);
    await submitFor(1, COMPLETE);
    await submitFor(2, SECOND);
    await submitFor(3, SECOND);
    await ballotLockPasses();
    await score();
    await voidBallot(2, 'Bad faith.');
    assert.deepEqual(await reopen(), { ok: true });

    assert.deepEqual(await voidBallot(1, 'Bad faith.'), { ok: false, reason: 'not-locked' });
    // the admin can't read the rankings until the new ballot lock, but sees which ballots are void and why
    assert.deepEqual((await admin()).voidBallots?.map(ballot => [ballot.franchise.id, ballot.voidReason]), [[2, 'Bad faith.']]);
    assert.deepEqual(await restoreBallot(2), { ok: true });
    assert.deepEqual((await admin()).voidBallots, []);
    await ballotLockPasses();
    assert.deepEqual(await voidReasons(), [[1, null], [2, null], [3, null]]);
    await score();
    assert.deepEqual(await gretzky(tallies), SCORED);
});

test('once published, a ballot can be neither voided nor restored, and the tallies stay as published', async t => {
    const { league, submitFor, ballotLockPasses, score, tallies, voidBallot, restoreBallot, voidReasons } = await voidingLeague(t);
    await submitFor(1, COMPLETE);
    await submitFor(2, SECOND);
    await submitFor(3, SECOND);
    await ballotLockPasses();
    await score();
    await voidBallot(3, 'Copied franchise 2.');
    // publishing is its own operation; here the scored vote is simply stored published
    await league.client.exec(`update league.award_votes set state = 'published', published_at = now() where season_year = ${SEASON}`);
    const published = await gretzky(tallies);

    assert.deepEqual(await voidBallot(2, 'Bad faith.'), { ok: false, reason: 'published' });
    assert.deepEqual(await restoreBallot(3), { ok: false, reason: 'published' });
    assert.deepEqual(await voidReasons(), [[1, null], [2, null], [3, 'Copied franchise 2.']]);
    assert.deepEqual(await gretzky(tallies), published);
});

test('after reopening, a void ballot stays void: its owner can still change it, and it adds nothing until restored after the new ballot lock', async t => {
    const { submitFor, signInAs, submit, ownBallot, ballotLockPasses, score, reopen, tallies, voidBallot, restoreBallot, voidReasons } = await voidingLeague(t);
    await submitFor(1, COMPLETE);
    await submitFor(2, SECOND);
    await submitFor(3, SECOND);
    await ballotLockPasses();
    await score();
    await voidBallot(2, 'Bad faith.');
    assert.deepEqual(await reopen(), { ok: true });

    // while owners can change their ballots again, nothing is voided
    assert.deepEqual(await voidBallot(1, 'Bad faith.'), { ok: false, reason: 'not-locked' });
    // franchise 2 changes its ballot to rank s3 first
    const changed: BallotRankings = { ...SECOND, 'wayne-gretzky': ['s3', 's2', 's1', 's4', 's5'] };
    await signInAs('owner-2');
    assert.deepEqual(await submit(changed), { ok: true });
    assert.deepEqual((await ownBallot())?.submitted, changed);

    await ballotLockPasses();
    assert.deepEqual(await voidReasons(), [[1, null], [2, 'Bad faith.'], [3, null]]);
    await score();
    assert.deepEqual(await gretzky(tallies), WITHOUT_SECOND);

    assert.deepEqual(await restoreBallot(2), { ok: true });
    assert.deepEqual(await gretzky(tallies), {
        counted: 3,
        lines: [
            // franchise 2's changed ballot counts: s3 10, s2 7, s1 5
            ['s2', 24, [1, 2, 0, 0, 0], 1],
            ['s1', 22, [1, 1, 1, 0, 0], 2],
            ['s3', 20, [1, 0, 2, 0, 0], 3],
            ['s4', 9, [0, 0, 0, 3, 0], 4],
            ['s5', 3, [0, 0, 0, 0, 3], 5],
        ],
    });
});
