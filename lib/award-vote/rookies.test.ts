import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AFTER_FINAL, awardVoteLeague, goalie, nhlRecord, SEASON, skater } from './testing/award-vote-league';

const teemu = <T extends { award: string }>(ballot: T[] | null) => ballot!.find(award => award.award === 'teemu-selanne')!;

test('the Teemu Trophy lists every Calder-eligible rookie with no top-50 cut, skaters and goalies with their own stats', async t => {
    const { act, vote, setRegularSeason, prepareFully, nhl } = await awardVoteLeague(t);
    const rookies = Array.from({ length: 55 }, (_, index) => skater(`r${index}`, 200 - index, { age: 21 }));
    setRegularSeason([
        ...rookies,
        // 300 NHL games before this season
        skater('veteran', 250, { age: 24 }),
        // too old by Fantrax's age to be looked up
        skater('old', 150, { age: 31 }),
        // a rookie who never scored is no candidate
        skater('quiet', 0, { age: 20 }),
    ], [goalie('rookie-g', 120, { age: 23, gamesPlayed: 9, wins: 5, goalsAgainst: 20, saves: 240, shutouts: 1 }), goalie('old-g', 130)]);
    for (const { id } of rookies) nhl.players[id] = nhlRecord([[20252026, 10]]);
    nhl.players['rookie-g'] = nhlRecord([[20242025, 3], [20252026, 20]], '2003-01-10');
    nhl.players.veteran = nhlRecord([[20232024, 82], [20242025, 82], [20252026, 82]]);
    nhl.players.old = nhlRecord();

    assert.deepEqual((await prepareFully()).result.ok, true);
    // only players young enough by Fantrax's age are looked up
    assert.deepEqual([...nhl.lookups].sort(), [...rookies.map(({ id }) => id), 'rookie-g', 'veteran'].sort());

    const award = teemu((await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot);
    assert.equal(award.label, 'Teemu Selanne Trophy');
    assert.equal(award.shown, null);
    assert.deepEqual(award.statSets, [{ name: 'regularSeason', label: 'Regular season' }]);
    assert.deepEqual(award.candidates.map(candidate => candidate.playerId), [...rookies.map(({ id }) => id), 'rookie-g']);
    assert.deepEqual(award.candidates.at(-1)!.stats, {
        regularSeason: { group: 'goalie', points: 120, perGame: 12, gamesPlayed: 9, wins: 5, goalsAgainst: 20, saves: 240, shutouts: 1 },
    });
});

test('the rookie review lists the computed rookies and, separately, the young players with no NHL match', async t => {
    const { act, vote, setRegularSeason, prepareFully, nhl } = await awardVoteLeague(t);
    setRegularSeason([
        skater('rookie', 190, { name: 'Macklin Celebrini', age: 20 }),
        skater('unknown', 180, { name: 'Ivan Ivanov', positions: 'LW,RW', nhlTeam: 'MTL', age: 22 }),
        skater('veteran', 170, { age: 24 }),
        skater('old', 160, { age: 33 }),
    ], [goalie('young-g', 150, { age: 21 })]);
    nhl.players.rookie = nhlRecord([[20252026, 20]], '2006-06-13', 8484801);
    nhl.players.veteran = nhlRecord([[20242025, 30]], '2002-01-01', 8482000);

    // nothing to review before a prepare finishes
    assert.equal(await act(() => vote.readRookieReview({ seasonYear: SEASON })), null);
    await prepareFully();
    const player = (playerId: string, name: string, positions: string[], nhlTeam: string, age: number, nhlId: number | null, candidate: boolean) =>
        ({ playerId, name, positions, nhlTeam, age, nhlId, adjustment: null, candidate });
    assert.deepEqual(await act(() => vote.readRookieReview({ seasonYear: SEASON })), {
        adjustable: true,
        rookies: [player('rookie', 'Macklin Celebrini', ['C'], 'EDM', 20, 8484801, true)],
        unmatched: [
            player('unknown', 'Ivan Ivanov', ['LW', 'RW'], 'MTL', 22, null, false),
            player('young-g', 'Goalie young-g', ['G'], 'TOR', 21, null, false),
        ],
        failed: [],
        ineligible: [player('veteran', 'Skater veteran', ['C'], 'EDM', 24, 8482000, false)],
    });
});

test("the admin's additions and removals change the Teemu Trophy at once and survive preparing again", async t => {
    const { act, vote, setRegularSeason, prepareFully, nhl, clock } = await awardVoteLeague(t);
    setRegularSeason([skater('rookie', 190, { age: 20 }), skater('unknown', 180, { age: 22 }), skater('veteran', 170, { age: 24 }), skater('other', 160, { age: 21 })]);
    nhl.players.rookie = nhlRecord();
    nhl.players.other = nhlRecord();
    nhl.players.veteran = nhlRecord([[20242025, 30]]);
    await prepareFully();
    const candidates = async () => teemu((await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot).candidates.map(candidate => candidate.playerId);
    assert.deepEqual(await candidates(), ['rookie', 'other']);

    // a missed match, a wrong match, and a wrongly admitted rookie
    assert.deepEqual(await act(() => vote.adjustRookie({ seasonYear: SEASON, playerId: 'unknown', change: 'add' })), { ok: true });
    assert.deepEqual(await act(() => vote.adjustRookie({ seasonYear: SEASON, playerId: 'veteran', change: 'add' })), { ok: true });
    assert.deepEqual(await act(() => vote.adjustRookie({ seasonYear: SEASON, playerId: 'rookie', change: 'remove' })), { ok: true });
    assert.deepEqual(await candidates(), ['unknown', 'veteran', 'other']);

    const adjustments = async () => {
        const review = (await act(() => vote.readRookieReview({ seasonYear: SEASON })))!;
        return [...review.rookies, ...review.unmatched, ...review.failed, ...review.ineligible].map(player => [player.playerId, player.adjustment, player.candidate]);
    };
    const adjusted = [['rookie', 'removed', false], ['other', null, true], ['unknown', 'added', true], ['veteran', 'added', true]];
    assert.deepEqual(await adjustments(), adjusted);

    clock.time += 3600_000;
    assert.equal((await prepareFully()).result.ok, true);
    assert.deepEqual(await candidates(), ['unknown', 'veteran', 'other']);
    assert.deepEqual(await adjustments(), adjusted);

    // adding back a removed rookie undoes the removal
    await act(() => vote.adjustRookie({ seasonYear: SEASON, playerId: 'rookie', change: 'add' }));
    assert.deepEqual(await candidates(), ['rookie', 'unknown', 'veteran', 'other']);
});

test('the rookie list can only be changed while the award vote is prepared, and only for players in its snapshot', async t => {
    const { act, vote, setRegularSeason, prepareFully, nhl, league } = await awardVoteLeague(t);
    const adjust = (playerId: string, change: 'add' | 'remove' = 'add') => act(() => vote.adjustRookie({ seasonYear: SEASON, playerId, change }));
    assert.deepEqual(await adjust('unknown'), { ok: false, reason: 'not-prepared' });

    setRegularSeason([skater('rookie', 190, { age: 20 }), skater('unknown', 180, { age: 22 })]);
    nhl.players.rookie = nhlRecord();
    await prepareFully();
    assert.deepEqual(await adjust('nobody'), { ok: false, reason: 'unknown-player' });

    await league.client.exec(`update league.award_votes set state = 'open', ballot_lock = now() + interval '1 day' where season_year = ${SEASON}`);
    assert.deepEqual(await adjust('unknown'), { ok: false, reason: 'not-prepared' });
    assert.deepEqual(await adjust('rookie', 'remove'), { ok: false, reason: 'not-prepared' });
    const review = (await act(() => vote.readRookieReview({ seasonYear: SEASON })))!;
    assert.equal(review.adjustable, false);
    assert.deepEqual([...review.rookies, ...review.unmatched].map(player => [player.playerId, player.adjustment, player.candidate]),
        [['rookie', null, true], ['unknown', null, false]]);
});

test("a player whose NHL lookup fails every time is tried three times, then left to the admin as a failed lookup, and preparing finishes", async t => {
    const logged = t.mock.method(console, 'error', () => {});
    const { act, vote, setRegularSeason, prepareFully, nhl } = await awardVoteLeague(t);
    setRegularSeason(Array.from({ length: 12 }, (_, index) => skater(`r${index}`, 200 - index, { age: 21 })));
    for (let index = 0; index < 12; index++) nhl.players[`r${index}`] = nhlRecord();
    // in the first batch of lookups, and failing every time
    nhl.failing.add('r3');
    assert.equal((await prepareFully()).result.ok, true);
    assert.ok(logged.mock.calls.some(call => String(call.arguments[0]).includes('r3')));
    // each young player is looked up once, and the failing one three times in all
    assert.equal(nhl.lookups.length, 14);
    assert.equal(nhl.lookups.filter(id => id === 'r3').length, 3);
    const review = (await act(() => vote.readRookieReview({ seasonYear: SEASON })))!;
    assert.deepEqual(review.failed.map(player => [player.playerId, player.nhlId, player.candidate]), [['r3', null, false]]);
    assert.deepEqual(review.unmatched, []);
    assert.equal(review.rookies.length, 11);
    const candidates = async () => teemu((await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot).candidates.map(candidate => candidate.playerId);
    assert.ok(!(await candidates()).includes('r3'));
    assert.equal((await candidates()).length, 11);

    // the admin can still add them
    assert.deepEqual(await act(() => vote.adjustRookie({ seasonYear: SEASON, playerId: 'r3', change: 'add' })), { ok: true });
    assert.ok((await candidates()).includes('r3'));
});

test('a failed NHL lookup is tried again on a later prepare call, and matches once the NHL answers', async t => {
    t.mock.method(console, 'error', () => {});
    const { act, vote, setRegularSeason, prepareFully, nhl } = await awardVoteLeague(t);
    setRegularSeason(Array.from({ length: 5 }, (_, index) => skater(`r${index}`, 200 - index, { age: 21 })));
    for (let index = 0; index < 5; index++) nhl.players[`r${index}`] = nhlRecord();
    nhl.failing.add('r1');
    // call by call, up to the one that first looks the young players up
    let result;
    do result = await act(() => vote.prepare({ seasonYear: SEASON }));
    while (result.ok && !result.done && !nhl.lookups.includes('r1'));
    // that call doesn't try r1 again, so it doesn't finish
    assert.equal(result.ok && result.done, false);
    assert.deepEqual([...nhl.lookups].sort(), ['r0', 'r1', 'r2', 'r3', 'r4']);

    nhl.failing.delete('r1');
    assert.equal((await prepareFully()).result.ok, true);
    assert.equal(nhl.lookups.filter(id => id === 'r1').length, 2);
    const review = (await act(() => vote.readRookieReview({ seasonYear: SEASON })))!;
    assert.deepEqual(review.failed, []);
    assert.deepEqual(review.rookies.map(player => player.playerId), ['r0', 'r1', 'r2', 'r3', 'r4']);
    assert.deepEqual(teemu((await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot).candidates.map(candidate => candidate.playerId),
        ['r0', 'r1', 'r2', 'r3', 'r4']);
});

test("retrying failed lookups looks them up again and rebuilds the candidates, keeping the admin's changes", async t => {
    t.mock.method(console, 'error', () => {});
    const { act, vote, setRegularSeason, prepareFully, nhl, league } = await awardVoteLeague(t);
    setRegularSeason([skater('rookie', 190, { age: 20 }), skater('flaky', 180, { age: 21 }), skater('down', 175, { age: 21 }), skater('unknown', 170, { age: 22 })]);
    nhl.players.rookie = nhlRecord();
    nhl.players.flaky = nhlRecord();
    nhl.players.down = nhlRecord();
    nhl.failing.add('flaky');
    nhl.failing.add('down');
    const retry = () => act(() => vote.retryFailedLookups({ seasonYear: SEASON }));
    // nothing to retry before a prepare finishes
    assert.deepEqual(await retry(), { ok: false, reason: 'not-prepared' });
    await act(() => vote.prepare({ seasonYear: SEASON }));
    assert.deepEqual(await retry(), { ok: false, reason: 'nothing-to-retry' });
    await prepareFully();
    await act(() => vote.adjustRookie({ seasonYear: SEASON, playerId: 'unknown', change: 'add' }));
    await act(() => vote.adjustRookie({ seasonYear: SEASON, playerId: 'rookie', change: 'remove' }));
    const review = async () => {
        const { rookies, unmatched, failed } = (await act(() => vote.readRookieReview({ seasonYear: SEASON })))!;
        return { rookies: rookies.map(player => player.playerId), unmatched: unmatched.map(player => player.playerId), failed: failed.map(player => player.playerId) };
    };
    assert.deepEqual(await review(), { rookies: ['rookie'], unmatched: ['unknown'], failed: ['flaky', 'down'] });

    // the NHL answers for one of them now
    nhl.failing.delete('flaky');
    const lookedUp = nhl.lookups.length;
    let result = await retry();
    while (result.ok && !result.done) result = await act(() => vote.prepare({ seasonYear: SEASON }));
    assert.equal(result.ok && result.done, true);
    // only the failed players were looked up again, the one still failing three times more
    assert.deepEqual(nhl.lookups.slice(lookedUp).sort(), ['down', 'down', 'down', 'flaky']);
    assert.deepEqual(await review(), { rookies: ['rookie', 'flaky'], unmatched: ['unknown'], failed: ['down'] });
    assert.deepEqual(teemu((await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot).candidates.map(candidate => candidate.playerId),
        ['flaky', 'unknown']);

    // refused once voting is open
    await league.client.exec(`update league.award_votes set state = 'open', ballot_lock = now() + interval '1 day' where season_year = ${SEASON}`);
    assert.deepEqual(await retry(), { ok: false, reason: 'not-prepared' });
});

test('retrying failed lookups is refused when no lookup failed', async t => {
    const { act, vote, setRegularSeason, prepareFully, nhl } = await awardVoteLeague(t);
    setRegularSeason([skater('rookie', 190, { age: 20 })]);
    nhl.players.rookie = nhlRecord();
    await prepareFully();
    assert.deepEqual(await act(() => vote.retryFailedLookups({ seasonYear: SEASON })), { ok: false, reason: 'nothing-to-retry' });
});

test('rookie progress stored before failed lookups were kept apart still reads, a null being no NHL match', async t => {
    const { act, vote, setRegularSeason, prepareFully, nhl, league } = await awardVoteLeague(t);
    setRegularSeason([skater('rookie', 190, { age: 20 }), skater('unknown', 180, { age: 22 })]);
    nhl.players.rookie = nhlRecord();
    nhl.players.unknown = nhlRecord();
    await prepareFully();
    // as an earlier prepare stored it: a matched rookie, and null for a player with no match or a failed lookup
    await league.client.exec(`update league.award_votes
        set prepare_progress = jsonb_set(prepare_progress, '{rookies}', '{"rookie": {"nhlId": 8480000, "eligible": true}, "unknown": null}'::jsonb)
        where season_year = ${SEASON}`);
    const review = (await act(() => vote.readRookieReview({ seasonYear: SEASON })))!;
    assert.deepEqual([review.rookies, review.unmatched, review.failed].map(players => players.map(player => player.playerId)), [['rookie'], ['unknown'], []]);
    assert.deepEqual(await act(() => vote.retryFailedLookups({ seasonYear: SEASON })), { ok: false, reason: 'nothing-to-retry' });
    // and the candidates are rebuilt from it
    assert.deepEqual(await act(() => vote.adjustRookie({ seasonYear: SEASON, playerId: 'unknown', change: 'remove' })), { ok: true });
    assert.deepEqual(teemu((await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot).candidates.map(candidate => candidate.playerId), ['rookie']);
});

test('only young players with at least 100 regular-season FPts are looked up, and an added rookie below that is no candidate', async t => {
    const { act, vote, setRegularSeason, prepareFully, nhl } = await awardVoteLeague(t);
    setRegularSeason([skater('rookie', 100, { age: 20 }), skater('short', 99.75, { age: 20 }), skater('veteran', 300, { age: 30 })], [goalie('short-g', 50, { age: 22 })]);
    nhl.players.rookie = nhlRecord();
    nhl.players.short = nhlRecord();
    nhl.players['short-g'] = nhlRecord();
    await prepareFully();
    assert.deepEqual(nhl.lookups, ['rookie']);
    const review = (await act(() => vote.readRookieReview({ seasonYear: SEASON })))!;
    assert.deepEqual([...review.rookies, ...review.unmatched, ...review.failed, ...review.ineligible].map(player => player.playerId), ['rookie']);
    assert.deepEqual(await act(() => vote.adjustRookie({ seasonYear: SEASON, playerId: 'short', change: 'add' })), { ok: true });
    assert.deepEqual(teemu((await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot).candidates.map(candidate => candidate.playerId), ['rookie']);
});

test("young players are looked up three at a time with a pause between batches, as many as a call's time budget allows", async t => {
    const { act, vote, setRegularSeason, prepareFully, nhl, clock } = await awardVoteLeague(t);
    setRegularSeason(Array.from({ length: 90 }, (_, index) => skater(`r${String(index).padStart(2, '0')}`, 300 - index, { age: 21 })));
    // up to the first call that looks anyone up (no Fantrax read takes any time here)
    let result;
    do result = await act(() => vote.prepare({ seasonYear: SEASON }));
    while (result.ok && !result.done && !nhl.lookups.length);
    // every batch after the first waits a second first, and the last starts before the 25-second budget is spent
    assert.equal(nhl.lookups.length, 26 * 3);
    assert.equal(clock.time - AFTER_FINAL, 25_000);
    assert.equal(result.ok && result.done, false);
    assert.equal((await prepareFully()).result.ok, true);
    assert.equal(nhl.lookups.length, 90);
});
