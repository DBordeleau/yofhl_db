// Seasons: a season's Pick'em completes when its last regular-season week freezes and names its winner, the next
// season starts empty on its own, past seasons read from Pick'em's own record, and an entry belongs to its franchise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, liveSeasonState, pickemLeague, SEASON, weeksAroundNow } from './testing/pickem-league';

const now = () => Date.now();
type League = Awaited<ReturnType<typeof pickemLeague>>;
const NEXT = SEASON + 1;
// Weeks 5 and 6 are this season's Pick'em: week 5 starts tomorrow, week 6 a week later, and week 6 is the last
// regular-season week (7–9 are playoff rounds).
const launch = { seasonYear: SEASON, week: 5 };
const shortSeason = () => liveSeasonState(weeksAroundNow(5, 9));

/** each owner's Pick'em picks on week `week` of `seasonYear`, saved now: [owner N, matchup, picked] */
async function savePicks({ act, signInAs, signOut }: League, week: number, picks: [number, [number, number], number][], seasonYear = SEASON) {
    for (const [owner, matchup, picked] of picks) {
        await signInAs(`owner-${owner}`);
        assert.deepEqual(await act(p => p.savePickemPick({ now: now(), seasonYear, week, matchup, picked })), { ok: true });
    }
    await signOut();
}

async function leaderboardAt(league: League, time: number, seasonYear?: number) {
    const read = await league.act(p => p.readPickemLeaderboard({ now: time, seasonYear }));
    assert.ok(read.status === 'leaderboard', `the ${seasonYear ?? 'current'} leaderboard reads`);
    return read;
}

async function weekAt(league: League, time: number, seasonYear: number | undefined, week?: number | 'last-locked') {
    const read = await league.act(p => p.readWeek({ now: time, seasonYear, week, asker: 'nobody' }));
    assert.ok(read.status === 'week', `week ${week ?? 'next'} of ${seasonYear ?? 'the current season'} reads`);
    return read;
}

/** entries as [rank, franchise, correct, wrong] */
const records = (entries: { rank: number; franchise: { id: number }; correct: number; wrong: number }[]) =>
    entries.map(entry => [entry.rank, entry.franchise.id, entry.correct, entry.wrong]);

/** 1 beats 2, 3 beats 4, 6 beats 5, 8 beats 7, 10 beats 9 */
const SCORES: [number, number, number, number][] = [[1, 2, 9, 1], [3, 4, 9, 1], [5, 6, 1, 9], [7, 8, 1, 9], [9, 10, 1, 9]];

/**
 * Plays this season's Pick'em to the end: weeks 5 and 6 picked while open, then both played and scored, week 5's
 * correction window closed and week 6's closing at the returned moment. Owner 1 calls 3 right, owner 2 calls 2
 * right and 1 wrong, owner 3 calls 1 right.
 */
async function playSeason(league: League) {
    await savePicks(league, 5, [[1, [1, 2], 1], [1, [3, 4], 3], [2, [1, 2], 1], [2, [5, 6], 5], [3, [1, 2], 1]]);
    await savePicks(league, 6, [[1, [5, 6], 6], [2, [3, 4], 3]]);
    league.playWeek(5, 9);
    league.playWeek(6, 8);
    league.setScores(5, SCORES);
    league.setScores(6, SCORES);
    return Date.parse(league.weekOf(6).endDate) + 7 * DAY;
}

const settleAt = (league: League, time: number) => league.act(p => p.settle({ now: time }));

test('settle marks a season complete once its last regular-season week freezes, and from then the Pick\'em leaderboard names the winner', async t => {
    const league = await pickemLeague(t, { launch, live: shortSeason() });
    const lastWindowCloses = await playSeason(league);

    const early = await settleAt(league, lastWindowCloses - 1000);
    assert.deepEqual(early.frozen.map(item => item.week), [5], 'week 5 freezes; the last week is still inside its window');
    assert.deepEqual(early.completed, []);
    const before = await leaderboardAt(league, lastWindowCloses - 1000);
    assert.deepEqual(records(before.leaderboard.entries), [[1, 1, 3, 0], [2, 2, 2, 1], [3, 3, 1, 0]]);
    assert.deepEqual(before.leaderboard.winners, [], 'no winner before the season is complete');

    const last = await settleAt(league, lastWindowCloses);
    assert.deepEqual(last.frozen.map(item => item.week), [6]);
    assert.deepEqual(last.completed, [SEASON]);
    assert.deepEqual((await settleAt(league, lastWindowCloses + DAY)).completed, [], 'a season is marked complete once');

    const after = await leaderboardAt(league, lastWindowCloses + DAY);
    assert.deepEqual(records(after.leaderboard.entries), [[1, 1, 3, 0], [2, 2, 2, 1], [3, 3, 1, 0]]);
    assert.deepEqual(records(after.leaderboard.winners), [[1, 1, 3, 0]]);
    assert.equal(after.leaderboard.winners[0].owner, 'Owner 1');
    assert.equal(after.beingPlayed, true, 'the playoffs are still to come');
});

test('entries level in first place are joint winners', async t => {
    const league = await pickemLeague(t, { launch: { seasonYear: SEASON, week: 6 }, live: shortSeason() });
    await savePicks(league, 6, [[1, [1, 2], 1], [1, [3, 4], 3], [2, [1, 2], 1], [2, [5, 6], 6], [3, [7, 8], 8]]);
    league.playWeek(6, 8);
    league.setScores(6, SCORES);
    const windowCloses = Date.parse(league.weekOf(6).endDate) + 7 * DAY;
    assert.deepEqual((await settleAt(league, windowCloses)).completed, [SEASON]);

    const read = await leaderboardAt(league, windowCloses);
    assert.deepEqual(records(read.leaderboard.winners), [[1, 1, 2, 0], [1, 2, 2, 0]]);
});

test('the next season starts at its first week with an empty Pick\'em leaderboard, and the season before stays readable from Pick\'em\'s own record', async t => {
    const league = await pickemLeague(t, { launch, live: shortSeason() });
    const lastWindowCloses = await playSeason(league);
    await settleAt(league, lastWindowCloses);
    const finished = await leaderboardAt(league, lastWindowCloses);
    const lockedWeek5 = await weekAt(league, lastWindowCloses, SEASON, 5);

    // Fantrax moves on: the live season is the next one, and this season is no longer in it.
    league.moveToSeason(NEXT, weeksAroundNow(1));

    const current = await leaderboardAt(league, now());
    assert.equal(current.leaderboard.seasonYear, NEXT);
    assert.deepEqual(current.leaderboard.entries, []);
    assert.deepEqual(current.leaderboard.winners, []);
    assert.equal(current.beingPlayed, true);
    assert.deepEqual(current.seasons, [NEXT, SEASON], 'newest first');
    const opening = await weekAt(league, now(), undefined);
    assert.deepEqual([opening.week.seasonYear, opening.week.week, opening.weeks[0].week], [NEXT, 1, 1],
        'the launch setting\'s start week was only for the first season');
    await savePicks(league, 1, [[1, [1, 2], 2]], NEXT);

    const past = await leaderboardAt(league, now(), SEASON);
    assert.equal(past.beingPlayed, false);
    assert.deepEqual(past.seasons, [NEXT, SEASON]);
    assert.deepEqual(past.leaderboard.entries, finished.leaderboard.entries);
    assert.deepEqual(past.leaderboard.winners, finished.leaderboard.winners);
    const week5 = await weekAt(league, now(), SEASON, 5);
    assert.equal(week5.week.phase, 'locked');
    assert.equal(week5.week.lock, lockedWeek5.week.lock);
    assert.deepEqual(week5.week.breakdown, lockedWeek5.week.breakdown);
    assert.deepEqual(week5.weeks.map(item => [item.week, item.phase]), [[5, 'locked'], [6, 'locked']]);
    assert.equal((await weekAt(league, now(), SEASON, 'last-locked')).week.week, 6);
    assert.equal((await weekAt(league, now(), SEASON)).week.week, 6, 'a past season has no week left to lock, so shows its last');

    // A past season needs nothing from the live season.
    league.live.down.add('core');
    assert.deepEqual(await league.act(p => p.readPickemLeaderboard({ now: now() })), { status: 'unavailable' });
    assert.deepEqual((await leaderboardAt(league, now(), SEASON)).leaderboard.winners, finished.leaderboard.winners);
    assert.deepEqual((await weekAt(league, now(), SEASON, 5)).week.breakdown, lockedWeek5.week.breakdown);
});

test('a past season shows its franchises\' season identities; the season being played shows current identities', async t => {
    const league = await pickemLeague(t, { launch, live: shortSeason() });
    const lastWindowCloses = await playSeason(league);
    await settleAt(league, lastWindowCloses);
    league.moveToSeason(NEXT, weeksAroundNow(1));
    for (const team of league.live.franchises) Object.assign(team, { name: `Renamed ${team.id}`, abbreviation: `R${team.id}` });

    // Until the season is imported it has no season identities, so its franchises show their current ones.
    const unimported = await leaderboardAt(league, now(), SEASON);
    assert.equal(unimported.leaderboard.entries[0].franchise.name, 'Franchise 1');

    // The season import adds its team seasons, then expires every league read.
    await league.league.client.exec(`
        insert into league.seasons values (${SEASON}, '2026–27', 'complete');
        insert into league.owners (id, name) values (11, 'Season Owner');
        insert into league.team_seasons (id, season_year, franchise_id, owner_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against, logo_url)
            values ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id => `(${100 + id}, ${SEASON}, ${id}, ${id === 1 ? 11 : id}, 'Club ${id}', 'Club ${id}', 'C${id}', 1, ${id}, 0, 0, 0, 0, 0, '/logos/c${id}.png')`).join(', ')};
    `);
    league.league.expire('league');

    const past = await leaderboardAt(league, now(), SEASON);
    assert.deepEqual(past.leaderboard.entries[0], {
        rank: 1, franchise: { id: 1, name: 'Club 1', abbreviation: 'C1', logo: '/logos/c1.png' }, owner: 'Season Owner',
        correct: 3, wrong: 0, percentage: 1,
    });
    const week5 = await weekAt(league, now(), SEASON, 5);
    assert.deepEqual([week5.week.matchups[0].away.name, week5.week.breakdown![0].away[0].franchise.name], ['Club 1', 'Club 1']);

    const current = await weekAt(league, now(), undefined);
    assert.equal(current.week.matchups[0].away.name, 'Renamed 1');
});

test('a new owner account managing a franchise reads and continues its existing Pick\'em picks', async t => {
    const league = await pickemLeague(t);
    await savePicks(league, 6, [[1, [1, 2], 1], [1, [3, 4], 4]]);
    // The admin hands franchise 1 to a new owner account.
    await league.league.client.exec(`update league.team_management set owner_uid = 'owner-new' where franchise_id = 1`);
    const yours = async () => {
        const read = await league.act(p => p.readWeek({ now: now(), seasonYear: SEASON, week: 6, asker: 'session' }));
        assert.ok(read.status === 'week');
        return read.week.yours;
    };

    await league.signInAs('owner-new');
    assert.deepEqual(await yours(), { status: 'entry', franchiseId: 1, picks: [{ matchup: [1, 2], picked: 1 }, { matchup: [3, 4], picked: 4 }] });
    assert.deepEqual(await league.act(p => p.savePickemPick({ now: now(), seasonYear: SEASON, week: 6, matchup: [3, 4], picked: 3 })), { ok: true });
    assert.deepEqual(await yours(), { status: 'entry', franchiseId: 1, picks: [{ matchup: [1, 2], picked: 1 }, { matchup: [3, 4], picked: 3 }] });

    await league.signInAs('owner-1');
    assert.deepEqual(await yours(), { status: 'no-team' });
});

test('a season with no Pick\'em has no Pick\'em leaderboard and no weeks', async t => {
    const league = await pickemLeague(t, { launch });
    assert.deepEqual(await league.act(p => p.readPickemLeaderboard({ now: now(), seasonYear: SEASON - 1 })), { status: 'no-season' });
    assert.deepEqual(await league.act(p => p.readWeek({ now: now(), seasonYear: SEASON - 1, asker: 'nobody' })), { status: 'no-week' });
});
