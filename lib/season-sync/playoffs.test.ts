import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { daysOf, endOf, SEASON, seasonSyncLeague } from './testing/season-sync-league';
import { catalogueAward } from '@/lib/awards';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const QUARTERFINALS = 22;
const SEMIFINALS = 23;
const FINAL = 24;
/** every roster period of the playoffs */
const PLAYOFF_DAYS = [...daysOf(QUARTERFINALS), ...daysOf(SEMIFINALS), ...daysOf(FINAL)];

/** an eight-team league: fxN is franchise N, ranked N, so seeds 1–6 make the playoffs and 7 and 8 miss them */
const playoffLeague = (t: TestContext) => seasonSyncLeague(t, { teams: 8 });

/** Fantrax's Quarterfinals as seeded, played and final: 5 beats 4 and 3 beats 6; 7 v 8 is outside the bracket */
function playQuarterfinals(league: Awaited<ReturnType<typeof playoffLeague>>) {
    league.setPairings(QUARTERFINALS, [[null, 1], [5, 4], [null, 2], [6, 3], [7, 8]]);
    league.setScores(QUARTERFINALS, [[5, 4, 410.5, 398.25], [6, 3, 350, 402.1], [7, 8, 300, 200]]);
}

/** the season page's bracket: [round, slot, away franchise, home franchise, away score, home score, winner] per game */
async function bracket(league: Awaited<ReturnType<typeof playoffLeague>>) {
    const { getSeasonDetail } = await import('@/lib/data/league');
    return (await league.read(() => getSeasonDetail(SEASON))).games.map(game =>
        [game.round, game.slot, game.away.franchiseId, game.home.franchiseId, game.away.score, game.home.score, game.winnerFranchiseId]);
}

test('once the Quarterfinals week is final, its two games are stored in bracket order with scores and winners, without the byes or other games', async t => {
    const league = await playoffLeague(t);
    playQuarterfinals(league);

    const active = await league.run(endOf(QUARTERFINALS) - HOUR);
    assert.equal(active.result.outcome === 'synced' && active.result.changed.playoffGames, 0, 'a week still being played writes no game');
    assert.deepEqual(await bracket(league), []);

    const { result, revalidatedTags } = await league.run(endOf(QUARTERFINALS) + 7 * HOUR);
    assert.equal(result.outcome === 'synced' && result.changed.playoffGames, 2);
    assert.deepEqual(await bracket(league), [
        [1, 0, 5, 4, 410.5, 398.25, 5],
        [1, 1, 6, 3, 350, 402.1, 3],
    ]);
    for (const tag of ['league:banners', 'league:cups', 'league:rivalries', `league:season:${SEASON}`]) assert.ok(revalidatedTags.includes(tag), tag);

    const quiet = await league.run(endOf(QUARTERFINALS) + 31 * HOUR);
    assert.equal(quiet.result.outcome === 'synced' && quiet.result.changed.playoffGames, 0, 'an unchanged game is not rewritten');
    assert.deepEqual(quiet.revalidatedTags, []);
});

test('after the Semifinals and the Final, each round is stored, and the run after the Final gives the season its champion and publishes it', async t => {
    const league = await playoffLeague(t);
    const { getBannerSeasons, getSeasonArchive } = await import('@/lib/data/league');
    const { winners } = await import('@/lib/data/award-archive');
    league.setPlayers([['p3', 10, 1, 3]]);
    league.setRoster(3, PLAYOFF_DAYS, [['p3', 'ACTIVE']]);
    playQuarterfinals(league);
    await league.run(endOf(QUARTERFINALS) + 7 * HOUR);
    // the bye teams meet the winners; 4 v 6, both eliminated, play outside the bracket
    league.setPairings(SEMIFINALS, [[5, 1], [3, 2], [4, 6]]);
    league.setScores(SEMIFINALS, [[5, 1, 380, 420.75], [3, 2, 333.3, 333.2], [4, 6, 500, 100]]);
    await league.run(endOf(SEMIFINALS) + 7 * HOUR);
    assert.equal((await league.read(() => getSeasonArchive())).current?.year, SEASON, 'no champion before the Final');

    league.setPairings(FINAL, [[3, 1], [5, 6]]);
    league.setScores(FINAL, [[3, 1, 801.4, 799.9], [5, 6, 10, 20]]);
    const finalActive = await league.run(endOf(FINAL) - DAY);
    assert.equal(finalActive.result.outcome === 'synced' && finalActive.result.changed.playoffGames, 0);
    assert.equal((await league.read(() => getSeasonArchive())).latest?.year, 2026);

    const { result } = await league.run(endOf(FINAL) + 7 * HOUR);
    assert.deepEqual(result, { outcome: 'synced', seasonYear: SEASON, changed: { playerSeasons: 0, teamSeasons: 0, playoffGames: 1, championshipRoster: 1, skaterCategories: 0, regularSeasonGames: 0, weeks: 0 }, warnings: [] });
    assert.deepEqual(await bracket(league), [
        [1, 0, 5, 4, 410.5, 398.25, 5],
        [1, 1, 6, 3, 350, 402.1, 3],
        [2, 0, 5, 1, 380, 420.75, 1],
        [2, 1, 3, 2, 333.3, 333.2, 3],
        [3, 0, 3, 1, 801.4, 799.9, 3],
    ]);
    const archive = await league.read(() => getSeasonArchive());
    assert.deepEqual([archive.latest?.year, archive.latest?.team, archive.current], [SEASON, 'Club 3', null], 'the season is published and is the latest season');
    assert.deepEqual((await league.read(() => getBannerSeasons())).find(season => season.year === SEASON)?.franchiseId, 3, "the champion's banner");
    assert.deepEqual((await league.read(() => winners(catalogueAward('jagr-cup')))).map(winner => [winner.Year, winner.TeamID]), [[SEASON, 3], [2026, 1]], 'the Jagr Cup');
});

test("each round's games are stored beside the games that fed them, whatever order Fantrax lists them in", async t => {
    const league = await playoffLeague(t);
    playQuarterfinals(league);
    await league.run(endOf(QUARTERFINALS) + 7 * HOUR);
    // Fantrax lists the Semifinals bottom half first: 3 (the second Quarterfinal's winner) v 2, then 5 v 1
    league.setPairings(SEMIFINALS, [[3, 2], [4, 6], [5, 1]]);
    league.setScores(SEMIFINALS, [[3, 2, 333.3, 333.2], [4, 6, 500, 100], [5, 1, 380, 420.75]]);
    await league.run(endOf(SEMIFINALS) + 7 * HOUR);
    assert.deepEqual(await bracket(league), [
        [1, 0, 5, 4, 410.5, 398.25, 5],
        [1, 1, 6, 3, 350, 402.1, 3],
        [2, 0, 5, 1, 380, 420.75, 1],
        [2, 1, 3, 2, 333.3, 333.2, 3],
    ]);
});

test('a saved bracket correction decides the stored winner, and a run leaves the correction and the awards alone', async t => {
    const league = await playoffLeague(t);
    await league.league.client.exec(`
        insert into league.matchup_overrides (season_year, round, franchise_a, franchise_b, winner_franchise_id, note)
            values (${SEASON}, 1, 4, 5, 4, 'Goalie start cap');
        insert into league.players (id, name) values ('p1', 'Rookie One');
        insert into league.awards (season_year, award, player_id, team_season_id) values (${SEASON}, 'teemu-selanne', 'p1', 13);
    `);
    const { getSeasonAdmin } = await import('@/lib/admin/data');
    playQuarterfinals(league);
    await league.run(endOf(QUARTERFINALS) + 7 * HOUR);
    assert.deepEqual((await bracket(league))[0], [1, 0, 5, 4, 410.5, 398.25, 4], 'franchise 4 wins on the correction, despite the score');
    const admin = (await getSeasonAdmin(SEASON))!;
    assert.deepEqual(admin.games.find(game => game.round === 1 && game.slot === 0)!.override?.note, 'Goalie start cap', 'bracket review still has the correction');
    assert.deepEqual(admin.awards.filter(award => award.winner).map(award => [award.name, award.winner?.id]), [['Teemu Trophy', 'p1']]);
});

test('a level game goes to the team Fantrax placed in the next round', async t => {
    const league = await playoffLeague(t);
    league.setPairings(QUARTERFINALS, [[null, 1], [5, 4], [null, 2], [6, 3]]);
    league.setScores(QUARTERFINALS, [[5, 4, 400, 400], [6, 3, 350, 402.1]]);
    const unplaced = await league.run(endOf(QUARTERFINALS) + HOUR);
    assert.deepEqual((await bracket(league))[0], [1, 0, 5, 4, 400, 400, null], 'no winner until Fantrax places one');
    assert.match(unplaced.result.outcome === 'synced' ? unplaced.result.warnings.join() : '', /Quarterfinals game between Club 5 and Club 4 ended level/);

    league.setPairings(SEMIFINALS, [[4, 1], [3, 2]]);
    const placed = await league.run(endOf(QUARTERFINALS) + 7 * HOUR);
    assert.deepEqual((await bracket(league))[0], [1, 0, 5, 4, 400, 400, 4]);
    assert.deepEqual(placed.result.outcome === 'synced' && placed.result.warnings, []);
});

/** the Quarterfinals and Semifinals played and synced the morning after each, leaving 3 v 1 in the Final */
async function playToTheFinal(league: Awaited<ReturnType<typeof playoffLeague>>) {
    playQuarterfinals(league);
    await league.run(endOf(QUARTERFINALS) + 7 * HOUR);
    league.setPairings(SEMIFINALS, [[5, 1], [3, 2]]);
    league.setScores(SEMIFINALS, [[5, 1, 380, 420.75], [3, 2, 333.3, 333.2]]);
    await league.run(endOf(SEMIFINALS) + 7 * HOUR);
    league.setPairings(FINAL, [[3, 1]]);
}

test('a level Final has no champion and records a warning, and setting its winner in bracket review publishes the season', async t => {
    const league = await playoffLeague(t);
    const { getSeasonArchive, getSeasonDetail } = await import('@/lib/data/league');
    const { getSeasonSyncStatus } = await import('@/lib/admin/data');
    league.setPlayers([['p1', 10, 1, 1]]);
    league.setRoster(1, PLAYOFF_DAYS, [['p1', 'ACTIVE']]);
    await playToTheFinal(league);
    league.setScores(FINAL, [[3, 1, 800, 800]]);
    await league.run(endOf(FINAL) + 7 * HOUR);
    assert.deepEqual((await bracket(league)).at(-1), [3, 0, 3, 1, 800, 800, null]);
    assert.equal((await league.read(() => getSeasonArchive())).current?.year, SEASON);
    assert.deepEqual((await getSeasonSyncStatus(SEASON))!.warnings,
        ['The Final between Club 3 and Club 1 ended level, so there is no champion yet. Set its winner in bracket review.']);

    const { saveMatchup } = await import('@/lib/data/curated-edits');
    const final = (await league.read(() => getSeasonDetail(SEASON))).games.find(game => game.round === 3)!;
    await league.league.runAsRoute('/admin', () => saveMatchup(SEASON, final.id, 1, 'Won on the tiebreak'));
    assert.equal((await league.read(() => getSeasonArchive())).latest?.team, 'Club 1');

    const after = await league.run(endOf(FINAL) + 31 * HOUR);
    assert.deepEqual(after.result, { outcome: 'synced', seasonYear: SEASON, changed: { playerSeasons: 0, teamSeasons: 0, playoffGames: 0, championshipRoster: 1, skaterCategories: 0, regularSeasonGames: 0, weeks: 0 }, warnings: [] },
        'the next run keeps the winner set in bracket review, and writes the championship roster');
    assert.equal((await league.read(() => getSeasonArchive())).latest?.team, 'Club 1');
});

test("a playoff schedule that isn't three rounds writes no bracket and records a warning", async t => {
    const league = await playoffLeague(t);
    // Fantrax's playoffs start a week late: two rounds, weeks 23 and 24
    league.live.fantrax.core.playoffs = { lastRegularSeasonPeriod: 22, firstPlayoffPeriod: 23 };
    league.setPairings(SEMIFINALS, [[4, 1], [3, 2]]);
    league.setScores(SEMIFINALS, [[4, 1, 300, 200], [3, 2, 300, 200]]);
    const { result } = await league.run(endOf(SEMIFINALS) + 7 * HOUR);
    assert.deepEqual(result.outcome === 'synced' && [result.changed.playoffGames, result.warnings], [0,
        ["Fantrax's playoff schedule has 2 rounds, not the league's 3: no playoff bracket is written. Correct the playoff settings in Fantrax."]]);
    assert.deepEqual(await bracket(league), []);
});

test("pairings that don't fit the bracket write nothing for that round and record a warning", async t => {
    const league = await playoffLeague(t);
    // seed 7, who missed the playoffs, plays seed 3 in place of seed 6
    league.setPairings(QUARTERFINALS, [[null, 1], [5, 4], [null, 2], [7, 3]]);
    league.setScores(QUARTERFINALS, [[5, 4, 410.5, 398.25], [7, 3, 350, 402.1]]);
    const { result } = await league.run(endOf(QUARTERFINALS) + 7 * HOUR);
    assert.deepEqual(result.outcome === 'synced' && [result.changed.playoffGames, result.warnings], [0,
        ["Fantrax's Quarterfinals pairings don't fit the bracket, so none of the round's games are stored. Repair the bracket with the season import."]]);
    assert.deepEqual(await bracket(league), []);
});

test('a score correction inside the seven-day window is stored, even one that changes the winner, and after the window closes it is not', async t => {
    const league = await playoffLeague(t);
    playQuarterfinals(league);
    await league.run(endOf(QUARTERFINALS) + 7 * HOUR);

    // a stat correction three days on: 4 overtakes 5
    league.setScores(QUARTERFINALS, [[5, 4, 410.5, 412], [6, 3, 350, 402.1], [7, 8, 300, 200]]);
    const corrected = await league.run(endOf(QUARTERFINALS) + 3 * DAY);
    assert.equal(corrected.result.outcome === 'synced' && corrected.result.changed.playoffGames, 1);
    assert.deepEqual((await bracket(league))[0], [1, 0, 5, 4, 410.5, 412, 4]);

    // The window has closed and the Semifinals are final: Fantrax rescoring the Quarterfinals changes nothing
    // stored, and the stored winners decide who is alive.
    league.setScores(QUARTERFINALS, [[5, 4, 500, 412], [6, 3, 350, 402.1], [7, 8, 300, 200]]);
    league.setPairings(SEMIFINALS, [[4, 1], [3, 2]]);
    league.setScores(SEMIFINALS, [[4, 1, 300, 200], [3, 2, 300, 200]]);
    const { result } = await league.run(endOf(QUARTERFINALS) + 7 * DAY + HOUR);
    assert.deepEqual(result.outcome === 'synced' && [result.changed.playoffGames, result.warnings], [2, []]);
    assert.deepEqual(await bracket(league), [
        [1, 0, 5, 4, 410.5, 412, 4],
        [1, 1, 6, 3, 350, 402.1, 3],
        [2, 0, 4, 1, 300, 200, 4],
        [2, 1, 3, 2, 300, 200, 3],
    ]);
});

test("a playoff round isn't written from a live season the evening refresh saved more than 36 hours ago: the run fails", async t => {
    const league = await playoffLeague(t);
    const { getSeasonSyncStatus } = await import('@/lib/admin/data');
    playQuarterfinals(league);
    league.refreshStopsAt(endOf(QUARTERFINALS) - 3 * DAY);
    assert.equal((await league.run(endOf(QUARTERFINALS) - HOUR)).result.outcome, 'synced', 'with no round to write, the run goes ahead');

    const stale = await league.run(endOf(QUARTERFINALS) + 7 * HOUR);
    assert.equal(stale.result.outcome, 'failed');
    assert.match((await getSeasonSyncStatus(SEASON))!.lastError!, /more than 36 hours ago, so the Quarterfinals can't be written/);
    assert.deepEqual(await bracket(league), [], 'no game from stale scores');

    league.refreshStopsAt(null);
    const { result } = await league.run(endOf(QUARTERFINALS) + 31 * HOUR);
    assert.equal(result.outcome === 'synced' && result.changed.playoffGames, 2);
});

test('a playoff week an admin marked final is written before it ends', async t => {
    const league = await playoffLeague(t);
    playQuarterfinals(league);
    league.markFinal(QUARTERFINALS);
    await league.run(endOf(QUARTERFINALS) - HOUR);
    assert.equal((await bracket(league)).length, 2);
});
