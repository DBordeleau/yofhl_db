import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardVoteLeague, goalie, nhlRecord, SEASON, skater } from './testing/award-vote-league';

const teemu = <T extends { award: string }>(ballot: T[] | null) => ballot!.find(award => award.award === 'teemu-selanne')!;

test('the Teemu Trophy lists every Calder-eligible rookie with no top-50 cut, skaters and goalies with their own stats', async t => {
    const { act, vote, setRegularSeason, prepareFully, nhl } = await awardVoteLeague(t);
    const rookies = Array.from({ length: 55 }, (_, index) => skater(`r${index}`, 150 - index, { age: 21 }));
    setRegularSeason([
        ...rookies,
        // 300 NHL games before this season
        skater('veteran', 200, { age: 24 }),
        // too old by Fantrax's age to be looked up
        skater('old', 150, { age: 31 }),
        // a rookie who never scored is no candidate
        skater('quiet', 0, { age: 20 }),
    ], [goalie('rookie-g', 60, { age: 23, gamesPlayed: 9, wins: 5, goalsAgainst: 20, saves: 240, shutouts: 1 }), goalie('old-g', 70)]);
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
        regularSeason: { group: 'goalie', points: 60, perGame: 6, gamesPlayed: 9, wins: 5, goalsAgainst: 20, saves: 240, shutouts: 1 },
    });
});

test('the rookie review lists the computed rookies and, separately, the young players with no NHL match', async t => {
    const { act, vote, setRegularSeason, prepareFully, nhl } = await awardVoteLeague(t);
    setRegularSeason([
        skater('rookie', 90, { name: 'Macklin Celebrini', age: 20 }),
        skater('unknown', 80, { name: 'Ivan Ivanov', positions: 'LW,RW', nhlTeam: 'MTL', age: 22 }),
        skater('veteran', 70, { age: 24 }),
        skater('old', 60, { age: 33 }),
    ], [goalie('young-g', 50, { age: 21 })]);
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
        ineligible: [player('veteran', 'Skater veteran', ['C'], 'EDM', 24, 8482000, false)],
    });
});

test("the admin's additions and removals change the Teemu Trophy at once and survive preparing again", async t => {
    const { act, vote, setRegularSeason, prepareFully, nhl, clock } = await awardVoteLeague(t);
    setRegularSeason([skater('rookie', 90, { age: 20 }), skater('unknown', 80, { age: 22 }), skater('veteran', 70, { age: 24 }), skater('other', 60, { age: 21 })]);
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
        return [...review.rookies, ...review.unmatched, ...review.ineligible].map(player => [player.playerId, player.adjustment, player.candidate]);
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

    setRegularSeason([skater('rookie', 90, { age: 20 }), skater('unknown', 80, { age: 22 })]);
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

test('a failed NHL lookup stops preparing with its reason, and the next call carries on', async t => {
    t.mock.method(console, 'error', () => {});
    const { act, vote, setRegularSeason, prepareFully, nhl } = await awardVoteLeague(t);
    setRegularSeason(Array.from({ length: 12 }, (_, index) => skater(`r${index}`, 100 - index, { age: 21 })));
    for (let index = 0; index < 12; index++) nhl.players[`r${index}`] = nhlRecord();
    nhl.down = true;
    assert.deepEqual(await act(() => vote.prepare({ seasonYear: SEASON })), { ok: false, reason: 'nhl-failed', message: 'The NHL player search returned 503' });
    nhl.down = false;
    nhl.lookups.length = 0;
    assert.equal((await prepareFully()).result.ok, true);
    // each young player is looked up once
    assert.equal(nhl.lookups.length, 12);
    assert.equal(teemu((await act(() => vote.readPreview({ seasonYear: SEASON }))).ballot).candidates.length, 12);
});
