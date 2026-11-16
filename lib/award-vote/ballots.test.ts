// Casting a ballot while voting is open: drafts saved per franchise, submitting a complete ballot, changes until the
// ballot lock, the owner who manages the franchise at the time, and who can read what.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardVoteLeague, COMPLETE, goalie, SEASON, skater, votingLeague } from './testing/award-vote-league';

test('the ballot shows every voted award with candidates, its ballot lock and each candidate list once', async t => {
    const { signInAs, read, admin } = await votingLeague(t);
    await signInAs('owner-1');
    const view = await read();
    assert.ok(view.status === 'ballot');
    assert.equal(view.seasonYear, SEASON);
    assert.equal(view.ballotLock, (await admin()).vote?.ballotLock);
    assert.equal(view.locked, false);
    assert.deepEqual(view.awards.map(award => [award.award, award.depth]), [
        ['wayne-gretzky', 5], ['le-magnifique', 5], ['bobby-orr', 5], ['hasek', 5], ['teemu-selanne', 2], ['danny-briere', 2],
    ]);
    // the Wayne Gretzky Award and Le Magnifique have the same candidates, sent once
    assert.equal(view.awards[0].list, view.awards[1].list);
    assert.equal(view.lists.length, 5);
    const list = (award: string) => view.lists[view.awards.find(item => item.award === award)!.list];
    assert.deepEqual(list('wayne-gretzky').map(candidate => candidate.playerId),
        ['s1', 's2', 's3', 's4', 's5', 's6', 'g1', 'g2', 'g3', 'g4', 'g5', 'd1', 'd2', 'd3', 'd4', 'd5', 'r1', 'r2']);
    assert.equal(list('wayne-gretzky')[0].team?.franchiseId, 1);
    assert.deepEqual(list('bobby-orr').map(candidate => candidate.playerId), ['d1', 'd2', 'd3', 'd4', 'd5']);
    assert.deepEqual(list('danny-briere').map(candidate => [candidate.playerId, candidate.stats.playoffRounds?.points, candidate.stats.final?.points]),
        [['s1', 40, 15], ['s2', 30, 10]]);
    assert.deepEqual(view.team, { franchiseId: 1, name: 'Club 1', abbreviation: 'C1', logo: '/logos/c1.png' });
    assert.deepEqual(view.ballot, { draft: {}, submitted: null, submittedAt: null });
});

test('an award with no candidates is left off the ballot, and a ballot is complete without it', async t => {
    const harness = await awardVoteLeague(t);
    const { setRegularSeason, openVoting, signInAs, asOwner, vote } = harness;
    // no defensemen, no rookies and nobody on a finalist's roster in the Final
    setRegularSeason([skater('s1', 300), skater('s2', 200)], [goalie('g1', 250)]);
    await openVoting();
    await signInAs('owner-1');
    const view = await asOwner(() => vote.readOwnerBallot({}));
    assert.ok(view.status === 'ballot');
    assert.deepEqual(view.awards.map(award => [award.award, award.depth]), [['wayne-gretzky', 3], ['le-magnifique', 3], ['hasek', 1]]);
    assert.deepEqual(await asOwner(() => vote.submitBallot({
        seasonYear: SEASON, rankings: { 'wayne-gretzky': ['s1', 's2', 'g1'], 'le-magnifique': ['g1', 's1', 's2'], hasek: ['g1'] },
    })), { ok: true });
});

test('a draft saves per franchise as the owner ranks, and is there on another device', async t => {
    const { signInAs, saveDraft, ownBallot, request } = await votingLeague(t);
    await signInAs('owner-1');
    assert.deepEqual(await saveDraft({ 'wayne-gretzky': ['s1', null, 's3'] }), { ok: true });
    assert.deepEqual(await saveDraft({ 'wayne-gretzky': ['s1', 's2', 's3'], hasek: [null, 'g2'] }), { ok: true });

    // the same owner on another browser
    request.cookies.clear();
    await signInAs('owner-1');
    assert.deepEqual(await ownBallot(), {
        draft: { 'wayne-gretzky': ['s1', 's2', 's3', null, null], hasek: [null, 'g2', null, null, null] },
        submitted: null, submittedAt: null,
    });
});

test('a draft or ballot that is not rankings of the ballot\'s candidates is refused', async t => {
    const { signInAs, saveDraft, submit, ownBallot } = await votingLeague(t);
    await signInAs('owner-1');
    for (const rankings of [
        null, 'ballot', ['s1'],
        { 'jagr-cup': ['s1'] },
        { 'wayne-gretzky': 's1' },
        { 'wayne-gretzky': ['s1', 's2', 's3', 's4', 's5', 's6'] },
        { 'teemu-selanne': ['r1', 'r2', null] },
        { 'wayne-gretzky': [1] },
        { 'bobby-orr': ['s1'] },
    ]) {
        assert.deepEqual(await saveDraft(rankings), { ok: false, reason: 'invalid-ballot' }, JSON.stringify(rankings));
        assert.deepEqual(await submit(rankings), { ok: false, reason: 'invalid-ballot' }, JSON.stringify(rankings));
    }
    assert.deepEqual(await ownBallot(), { draft: {}, submitted: null, submittedAt: null });
});

test('submitting is refused, naming what is missing, unless every rank is filled with distinct candidates', async t => {
    const { signInAs, submit, ownBallot, headerAnswer } = await votingLeague(t);
    await signInAs('owner-1');
    const withoutHasek = Object.fromEntries(Object.entries(COMPLETE).filter(([award]) => award !== 'hasek'));
    assert.deepEqual(await submit({
        ...withoutHasek,
        'wayne-gretzky': ['s1', 's2', null, 's4'],
        'le-magnifique': ['g1', 's1', 'd1', 's1', 'g1'],
    }), {
        ok: false, reason: 'incomplete', problems: [
            { award: 'wayne-gretzky', emptyRanks: [3, 5], repeated: [] },
            { award: 'le-magnifique', emptyRanks: [], repeated: ['s1', 'g1'] },
            { award: 'hasek', emptyRanks: [1, 2, 3, 4, 5], repeated: [] },
        ],
    });
    assert.deepEqual(await ownBallot(), { draft: {}, submitted: null, submittedAt: null }, 'nothing is saved');
    assert.notEqual((await headerAnswer()).awardVote, null);
});

test('an owner submits a complete ballot, ranking their own franchise\'s player, and the nudge goes', async t => {
    const { signInAs, submit, ownBallot, headerAnswer, admin } = await votingLeague(t);
    await signInAs('owner-1');
    const { ballotLock } = (await admin()).vote!;
    assert.deepEqual((await headerAnswer()).awardVote, { seasonYear: SEASON, ballotLock });
    assert.deepEqual(await submit(COMPLETE), { ok: true });
    const ballot = await ownBallot();
    assert.deepEqual(ballot?.submitted, COMPLETE);
    assert.deepEqual(ballot?.draft, COMPLETE);
    assert.ok(ballot?.submittedAt && Math.abs(Date.parse(ballot.submittedAt) - Date.now()) < 60_000);
    assert.equal((await headerAnswer()).awardVote, null);
});

test('a submitted ballot changes and is submitted again until the ballot lock, and every ballot write is refused after it', async t => {
    const { signInAs, saveDraft, submit, ownBallot, read, ballotLockPasses, headerAnswer } = await votingLeague(t);
    await signInAs('owner-1');
    await submit(COMPLETE);
    const changed = { ...COMPLETE, hasek: ['g2', 'g1', 'g3', 'g4', 'g5'] };
    // a change in progress is a draft; the submitted ballot stands until it is submitted again
    assert.deepEqual(await saveDraft({ ...COMPLETE, hasek: ['g2', null, 'g3', 'g4', 'g5'] }), { ok: true });
    assert.deepEqual((await ownBallot())?.submitted, COMPLETE);
    assert.deepEqual(await submit(changed), { ok: true });
    assert.deepEqual((await ownBallot())?.submitted, changed);

    await ballotLockPasses();
    assert.deepEqual(await saveDraft(COMPLETE), { ok: false, reason: 'locked' });
    assert.deepEqual(await submit(COMPLETE), { ok: false, reason: 'locked' });
    const view = await read();
    assert.ok(view.status === 'ballot');
    assert.equal(view.locked, true);
    assert.deepEqual(view.ballot?.submitted, changed);
    // and nobody is nudged once the ballot lock has passed
    await signInAs('owner-2');
    assert.equal((await headerAnswer()).awardVote, null);
    assert.deepEqual(await saveDraft(COMPLETE), { ok: false, reason: 'locked' });
});

test('before voting opens, owners see no ballot and every ballot write is refused', async t => {
    const { signInAs, saveDraft, submit, read, headerAnswer } = await votingLeague(t, { open: false });
    await signInAs('owner-1');
    assert.deepEqual(await saveDraft(COMPLETE), { ok: false, reason: 'not-open' });
    assert.deepEqual(await submit(COMPLETE), { ok: false, reason: 'not-open' });
    assert.deepEqual(await read(), { status: 'no-vote' }, 'a prepared ballot is never shown to owners');
    assert.equal((await headerAnswer()).awardVote, null);
});

test('ballot writes are refused signed out and for an owner with no team, who still sees who has submitted', async t => {
    const { signInAs, saveDraft, submit, read, headerAnswer } = await votingLeague(t);
    await signInAs(null);
    assert.deepEqual(await saveDraft(COMPLETE), { ok: false, reason: 'session-expired' });
    assert.deepEqual(await submit(COMPLETE), { ok: false, reason: 'session-expired' });
    assert.deepEqual(await read(), { status: 'signed-out' });

    await signInAs('owner-none');
    assert.deepEqual(await saveDraft(COMPLETE), { ok: false, reason: 'no-team' });
    assert.deepEqual(await submit(COMPLETE), { ok: false, reason: 'no-team' });
    const view = await read();
    assert.ok(view.status === 'ballot');
    assert.equal(view.team, null);
    assert.equal(view.ballot, null);
    assert.equal(view.ballotStatus.length, 4);
    assert.equal((await headerAnswer()).awardVote, null);
});

test('a ballot belongs to the franchise: a new owner inherits it, and the old owner and a folded franchise are refused', async t => {
    const { signInAs, saveDraft, submit, ownBallot, league, request } = await votingLeague(t);
    await signInAs('owner-1');
    assert.deepEqual(await saveDraft({ hasek: ['g1'] }), { ok: true });

    // franchise 1 changes hands
    await league.client.exec(`update league.team_management set owner_uid = 'owner-9' where franchise_id = 1`);
    assert.deepEqual(await saveDraft(COMPLETE), { ok: false, reason: 'no-team' });
    assert.deepEqual(await submit(COMPLETE), { ok: false, reason: 'no-team' });

    request.cookies.clear();
    await signInAs('owner-9');
    assert.deepEqual((await ownBallot())?.draft, { hasek: ['g1', null, null, null, null] });
    assert.deepEqual(await submit(COMPLETE), { ok: true });

    await league.client.exec(`update league.franchises set folded_after_season = 2027 where id = 1`);
    assert.deepEqual(await saveDraft(COMPLETE), { ok: false, reason: 'no-team' });
});

test("a ballot's rankings are readable only by its own franchise; who has submitted is seen by every owner and the admin", async t => {
    const { signInAs, submit, saveDraft, read, ownBallot, admin } = await votingLeague(t);
    await signInAs('owner-1');
    await submit(COMPLETE);
    await signInAs('owner-3');
    await saveDraft({ hasek: ['g5'] });

    await signInAs('owner-2');
    assert.deepEqual(await ownBallot(), { draft: {}, submitted: null, submittedAt: null });
    const view = await read();
    assert.ok(view.status === 'ballot');
    const status = [
        { franchise: { id: 1, name: 'Club 1', abbreviation: 'C1', logo: '/logos/c1.png' }, owner: 'Owner 1', submitted: true },
        { franchise: { id: 2, name: 'Club 2', abbreviation: 'C2', logo: '/logos/c2.png' }, owner: 'Owner 2', submitted: false },
        { franchise: { id: 3, name: 'Club 3', abbreviation: 'C3', logo: '/logos/c3.png' }, owner: 'Owner 3', submitted: false },
        { franchise: { id: 4, name: 'Club 4', abbreviation: 'C4', logo: '/logos/c4.png' }, owner: 'Owner 4', submitted: false },
    ];
    assert.deepEqual(view.ballotStatus, status);
    // nothing else in the read carries another franchise's rankings
    assert.deepEqual(Object.keys(view).sort(), ['awards', 'ballot', 'ballotLock', 'ballotStatus', 'lists', 'locked', 'seasonYear', 'status', 'team']);
    const preview = await admin();
    assert.deepEqual(preview.ballotStatus, status);
    assert.deepEqual(Object.keys(preview).sort(), ['ballot', 'ballotStatus', 'kind', 'vote']);
});
