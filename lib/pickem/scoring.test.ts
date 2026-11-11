// Scoring: final weeks are scored from the live season until settle freezes them, and the Pick'em leaderboard
// ranks the season's entries by their records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, pickemLeague, SEASON } from './testing/pickem-league';

const now = () => Date.now();
type League = Awaited<ReturnType<typeof pickemLeague>>;
// Weeks before 6 are not part of these seasons' Pick'em, so only the week a test plays is scored.
const launch = { seasonYear: SEASON, week: 6 };

/** each owner's Pick'em picks on week `week`, saved now: [owner N, matchup, picked] */
async function savePicks({ act, signInAs, signOut }: League, week: number, picks: [number, [number, number], number][]) {
    for (const [owner, matchup, picked] of picks) {
        await signInAs(`owner-${owner}`);
        assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week, matchup, picked })), { ok: true });
    }
    await signOut();
}

async function leaderboardAt(league: League, time = now()) {
    const read = await league.act(p => p.readPickemLeaderboard({ now: time, seasonYear: SEASON }));
    assert.ok(read.status === 'leaderboard', 'the leaderboard reads');
    return read.leaderboard;
}

/** the leaderboard as [rank, franchise, correct, wrong, percentage] per entry */
const records = (leaderboard: Awaited<ReturnType<typeof leaderboardAt>>) =>
    leaderboard.entries.map(entry => [entry.rank, entry.franchise.id, entry.correct, entry.wrong, entry.percentage]);

async function readAt(league: League, week: number, time = now(), asker: 'nobody' | 'session' = 'nobody') {
    const read = await league.act(p => p.readWeek({ now: time, seasonYear: SEASON, week, asker }));
    assert.ok(read.status === 'week', `week ${week} reads`);
    return read.week;
}

const results = (week: Awaited<ReturnType<typeof readAt>>) => week.breakdown?.map(item => item.result);
/** the breakdown's scores as [away, home] per matchup */
const scores = (week: Awaited<ReturnType<typeof readAt>>) => week.breakdown?.map(item => item.scores && [item.scores.away, item.scores.home]);
const yourPicks = (week: Awaited<ReturnType<typeof readAt>>) => week.yours?.status === 'entry' ? week.yours.picks : null;

/** 1 beats 2, 3 and 4 tie, 6 beats 5, 8 beats 7, 9 and 10 tie */
const SCORES: [number, number, number, number][] = [[1, 2, 10, 5], [3, 4, 6, 6], [5, 6, 1, 7], [7, 8, 3, 9], [9, 10, 4, 4]];
const SCORED = SCORES.map(([, , away, home]) => [away, home]);

test('the Pick\'em leaderboard ranks entries by correct picks, then fewer wrong, and entries level on both share the place', async t => {
    const league = await pickemLeague(t, { launch });
    await savePicks(league, 6, [
        [1, [1, 2], 1], [1, [3, 4], 3], [1, [5, 6], 6], [1, [7, 8], 8],
        [2, [1, 2], 1], [2, [5, 6], 6], [2, [7, 8], 7], [2, [9, 10], 9], [2, [3, 4], 4], [2, [5, 6], 5],
        [3, [1, 2], 1], [3, [5, 6], 6],
        [4, [1, 2], 2], [4, [5, 6], 5],
        [5, [5, 6], 6], [5, [7, 8], 8],
        [6, [3, 4], 3],
    ]);
    await savePicks(league, 7, [[7, [7, 8], 7]]);
    league.playWeek(6, 1);
    league.setScores(6, SCORES);

    const leaderboard = await leaderboardAt(league);
    assert.equal(leaderboard.seasonYear, SEASON);
    assert.deepEqual(records(leaderboard), [
        [1, 1, 3, 0, 1],
        [2, 3, 2, 0, 1],
        [2, 5, 2, 0, 1],
        [4, 2, 1, 2, 1 / 3],
        [5, 6, 0, 0, null],
        [6, 4, 0, 2, 0],
    ], 'owner 7 picked only a week that has not locked, so has no entry');
    assert.deepEqual(leaderboard.entries[0], {
        rank: 1, franchise: { id: 1, name: 'Franchise 1', abbreviation: 'F1', logo: '/logos/f1.png' }, owner: 'Owner 1',
        correct: 3, wrong: 0, percentage: 1,
    });
});

test('a locked week that is not yet final contributes nothing; a final week follows the live season\'s score', async t => {
    const league = await pickemLeague(t, { launch });
    await savePicks(league, 6, [[1, [1, 2], 1], [1, [3, 4], 3], [1, [5, 6], 5], [2, [1, 2], 2]]);
    league.weekOf(6).startDate = new Date(now() - DAY).toISOString();
    league.setScores(6, SCORES);

    assert.deepEqual(records(await leaderboardAt(league)), [[1, 1, 0, 0, null], [1, 2, 0, 0, null]]);
    await league.signInAs('owner-1');
    const locked = await readAt(league, 6, now(), 'session');
    assert.deepEqual(results(locked), [null, null, null, null, null], 'no results before the week is final');
    assert.deepEqual(scores(locked), SCORED, 'the scores as they stand while the week is played');
    assert.deepEqual(yourPicks(locked), [{ matchup: [1, 2], picked: 1 }, { matchup: [3, 4], picked: 3 }, { matchup: [5, 6], picked: 5 }]);

    league.playWeek(6, 1);
    assert.deepEqual(records(await leaderboardAt(league)), [[1, 1, 1, 1, 0.5], [2, 2, 0, 1, 0]], 'a tie and an unpicked matchup are neither');
    const final = await readAt(league, 6, now(), 'session');
    assert.deepEqual(results(final), ['away', 'tie', 'home', 'home', 'tie']);
    assert.deepEqual(yourPicks(final), [
        { matchup: [1, 2], picked: 1, outcome: 'correct' },
        { matchup: [3, 4], picked: 3, outcome: 'neither' },
        { matchup: [5, 6], picked: 5, outcome: 'wrong' },
    ]);

    // A stat correction inside the window turns 1 v 2 around, with Fantrax now listing the pair the other way round.
    league.setScores(6, [[2, 1, 10, 5], ...SCORES.slice(1)]);
    assert.deepEqual(records(await leaderboardAt(league)), [[1, 2, 1, 0, 1], [2, 1, 0, 2, 0]]);
    const corrected = await readAt(league, 6);
    assert.deepEqual(results(corrected), ['home', 'tie', 'home', 'home', 'tie']);
    assert.deepEqual(scores(corrected), [[5, 10], ...SCORED.slice(1)], 'scores follow the correction, in the pairing\'s own order');
});

test('a locked week still being played shows its breakdown without scores while Fantrax can\'t be read', async t => {
    const league = await pickemLeague(t, { launch });
    await savePicks(league, 6, [[1, [1, 2], 1]]);
    league.weekOf(6).startDate = new Date(now() - DAY).toISOString();
    league.setScores(6, SCORES);
    league.live.down.add('scores');

    const locked = await readAt(league, 6);
    assert.deepEqual(scores(locked), [null, null, null, null, null]);
    assert.deepEqual(locked.breakdown![0].away.map(entry => entry.franchise.id), [1]);
});

test('settle freezes a final week once its correction window closes, and later corrections change nothing', async t => {
    const league = await pickemLeague(t, { launch });
    await savePicks(league, 6, [[1, [1, 2], 1], [1, [3, 4], 3], [1, [5, 6], 5], [2, [1, 2], 2]]);
    league.playWeek(6, 1);
    league.setScores(6, SCORES);
    const settle = async (time: number) => (await league.act(p => p.settle({ now: time }))).frozen.map(item => [item.seasonYear, item.week]);
    const windowCloses = Date.parse(league.weekOf(6).endDate) + 7 * DAY;

    assert.deepEqual(await settle(now()), []);
    assert.deepEqual(await settle(windowCloses - 1000), [], 'a second before the window closes');
    assert.deepEqual(await settle(windowCloses), [[SEASON, 6]]);
    assert.deepEqual(await settle(windowCloses + DAY), [], 'a second run changes nothing');

    // Fantrax corrects every score afterwards; the frozen week keeps its results, tie included.
    league.setScores(6, [[1, 2, 5, 10], [3, 4, 9, 1], [5, 6, 7, 1], [7, 8, 9, 3], [9, 10, 1, 4]]);
    assert.deepEqual(await settle(windowCloses + 2 * DAY), []);
    assert.deepEqual(records(await leaderboardAt(league)), [[1, 1, 1, 1, 0.5], [2, 2, 0, 1, 0]]);
    const frozen = await readAt(league, 6);
    assert.deepEqual(results(frozen), ['away', 'tie', 'home', 'home', 'tie']);
    assert.deepEqual(scores(frozen), SCORED, 'the scores froze with the results');
    // Frozen scores need nothing from the live season.
    league.live.down.add('scores');
    assert.deepEqual(scores(await readAt(league, 6)), SCORED);
});

test('the Pick\'em leaderboard is empty before any pick locks, and absent while Pick\'em is switched off', async t => {
    const league = await pickemLeague(t, { launch });
    await savePicks(league, 6, [[1, [1, 2], 1]]);
    assert.deepEqual(records(await leaderboardAt(league)), []);
    const off = await pickemLeague(t, { launch: null });
    assert.deepEqual(await off.act(p => p.readPickemLeaderboard({ now: now(), seasonYear: SEASON })), { status: 'no-season' });
});

test('settle reads the saved snapshot and asks Fantrax for no league of its own', async t => {
    const league = await pickemLeague(t, { launch });
    league.playWeek(6, 8);
    league.setScores(6, SCORES);
    // The evening capture has saved its snapshot; Fantrax's league endpoints then fail.
    league.live.saved = structuredClone(league.live.fantrax);
    league.live.down.add('core');

    const settled = await league.act(p => p.settle({ now: now() }));
    assert.deepEqual(settled.frozen, [{ seasonYear: SEASON, week: 6 }]);
});

test('settle holds a week with a pairing Fantrax has no score for, and freezes it once every pairing is scored', async t => {
    const league = await pickemLeague(t, { launch });
    await savePicks(league, 6, [[1, [1, 2], 1], [2, [1, 2], 2]]);
    league.playWeek(6, 8);
    league.setScores(6, SCORES);
    const week6 = [{ seasonYear: SEASON, week: 6 }];
    const settle = (time = now()) => league.act(p => p.settle({ now: time }));
    t.mock.method(console, 'warn', () => {});

    // Recorded while its correction window is open; then Fantrax team fx1 loses its franchise, so 1 v 2 can't be scored.
    const early = await settle(now() - 2 * DAY);
    assert.deepEqual([early.recorded, early.frozen], [week6, []]);
    const mapping = league.live.fantraxTeams;
    league.live.fantraxTeams = mapping.filter(row => row.fantraxTeamId !== 'fx1');
    const held = await settle();
    assert.deepEqual([held.frozen, held.held, held.completed], [[], week6, []]);

    league.live.fantraxTeams = mapping;
    const frozen = await settle();
    assert.deepEqual([frozen.frozen, frozen.held], [week6, []]);
    assert.deepEqual(records(await leaderboardAt(league)), [[1, 1, 1, 0, 1], [2, 2, 0, 1, 0]]);
});
