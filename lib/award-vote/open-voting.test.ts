// Opening voting on a prepared award vote with a ballot lock, and moving the ballot lock later while it is open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardVoteLeague, lockInHours, SEASON, skater } from './testing/award-vote-league';

test('the admin opens a prepared award vote with a ballot lock, freezing its snapshot', async t => {
    const { act, vote, setRegularSeason, prepareFully } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 300)]);
    await prepareFully();
    const ballotLock = lockInHours(48);
    assert.deepEqual(await act(() => vote.openVoting({ seasonYear: SEASON, ballotLock })), { ok: true });

    const { vote: summary, ballot } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.equal(summary?.state, 'open');
    assert.equal(summary?.ballotLock, ballotLock);
    assert.ok(summary?.openedAt && Math.abs(Date.parse(summary.openedAt) - Date.now()) < 60_000, 'opened just now');
    assert.deepEqual(ballot![0].candidates.map(candidate => candidate.playerId), ['s1']);
});

test('opening is refused before a finished prepare, for a ballot lock already past, and once open', async t => {
    const { act, vote, setRegularSeason, prepareFully } = await awardVoteLeague(t);
    const open = (ballotLock = lockInHours(24)) => act(() => vote.openVoting({ seasonYear: SEASON, ballotLock }));
    assert.deepEqual(await open(), { ok: false, reason: 'not-prepared' }, 'never prepared');
    setRegularSeason([skater('s1', 300)]);
    await act(() => vote.prepare({ seasonYear: SEASON }));
    assert.deepEqual(await open(), { ok: false, reason: 'not-prepared' }, 'an unfinished prepare');
    await prepareFully();
    assert.deepEqual(await open(lockInHours(-1)), { ok: false, reason: 'lock-passed' });
    assert.deepEqual(await open('next Tuesday'), { ok: false, reason: 'invalid-lock' });
    assert.equal((await act(() => vote.readPreview({ seasonYear: SEASON }))).vote?.state, 'prepared');

    assert.deepEqual(await open(), { ok: true });
    assert.deepEqual(await open(lockInHours(72)), { ok: false, reason: 'not-prepared' }, 'already open');
});

test('once voting is open, preparing again, starting over, rookie changes and retrying lookups are refused', async t => {
    const { act, vote, setRegularSeason, openVoting, nhl } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 300), skater('young', 150, { age: 21 })]);
    // a failed lookup, which the admin could retry before opening
    t.mock.method(console, 'error', () => {});
    nhl.failing.add('young');
    await openVoting();
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: false, reason: 'not-prepared' });
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON, startOver: true })), { ok: false, reason: 'not-prepared' });
    assert.deepEqual(await act(() => vote.adjustRookie({ seasonYear: SEASON, playerId: 's1', change: 'add' })), { ok: false, reason: 'not-prepared' });
    assert.deepEqual(await act(() => vote.retryFailedLookups({ seasonYear: SEASON })), { ok: false, reason: 'not-prepared' });
    const { vote: summary, ballot } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.equal(summary?.state, 'open');
    assert.deepEqual(ballot![0].candidates.map(candidate => candidate.playerId), ['s1', 'young']);
    assert.equal((await act(() => vote.readRookieReview({ seasonYear: SEASON })))!.adjustable, false);
});

test('the admin moves the ballot lock later while voting is open, never earlier and never into the past', async t => {
    const { act, vote, league, setRegularSeason, prepareFully, ballotLockPasses } = await awardVoteLeague(t);
    const move = (ballotLock: string) => act(() => vote.moveBallotLock({ seasonYear: SEASON, ballotLock }));
    setRegularSeason([skater('s1', 300)]);
    await prepareFully();
    assert.deepEqual(await move(lockInHours(24)), { ok: false, reason: 'not-open' });

    const first = lockInHours(24);
    await act(() => vote.openVoting({ seasonYear: SEASON, ballotLock: first }));
    const later = lockInHours(48);
    assert.deepEqual(await move(later), { ok: true });
    assert.equal((await act(() => vote.readPreview({ seasonYear: SEASON }))).vote?.ballotLock, later);
    assert.deepEqual(await move(first), { ok: false, reason: 'not-later' });
    assert.deepEqual(await move(later), { ok: false, reason: 'not-later' });
    assert.deepEqual(await move('soon'), { ok: false, reason: 'invalid-lock' });
    assert.equal((await act(() => vote.readPreview({ seasonYear: SEASON }))).vote?.ballotLock, later);

    // the ballot lock passed two hours ago
    await league.client.exec(`update league.award_votes set ballot_lock = clock_timestamp() - interval '2 hours' where season_year = ${SEASON}`);
    assert.deepEqual(await move(lockInHours(-1)), { ok: false, reason: 'lock-passed' }, 'later than the passed lock, but still past');
    const reopened = lockInHours(72);
    assert.deepEqual(await move(reopened), { ok: true }, 'voting is still open once the ballot lock passes');
    assert.equal((await act(() => vote.readPreview({ seasonYear: SEASON }))).vote?.ballotLock, reopened);

    await ballotLockPasses();
    assert.deepEqual(await act(() => vote.scoreBallots({ seasonYear: SEASON })), { ok: true });
    assert.deepEqual(await move(lockInHours(96)), { ok: false, reason: 'not-open' }, 'scored');
});
