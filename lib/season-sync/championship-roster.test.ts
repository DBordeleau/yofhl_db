import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { daysOf, endOf, SEASON, seasonSyncLeague } from './testing/season-sync-league';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const QUARTERFINALS = 22;
const SEMIFINALS = 23;
const FINAL = 24;
/** every roster period of the playoffs */
const PLAYOFF_DAYS = [...daysOf(QUARTERFINALS), ...daysOf(SEMIFINALS), ...daysOf(FINAL)];

/** an eight-team league: fxN is franchise N, ranked N, so seeds 1 and 2 have the Quarterfinals' byes */
const playoffLeague = (t: TestContext) => seasonSyncLeague(t, { teams: 8 });
type League = Awaited<ReturnType<typeof playoffLeague>>;

/**
 * The Quarterfinals (5 beats 4, 3 beats 6; 1 and 2 have byes) and Semifinals (1 beats 5, 3 beats 2), each synced
 * the morning after, then Fantrax's Final, 3 v 1, scored `[3's score, 1's score]`.
 */
async function playToTheFinal(league: League, [three, one]: [number, number]) {
    league.setPairings(QUARTERFINALS, [[null, 1], [5, 4], [null, 2], [6, 3]]);
    league.setScores(QUARTERFINALS, [[5, 4, 410.5, 398.25], [6, 3, 350, 402.1]]);
    await league.run(endOf(QUARTERFINALS) + 7 * HOUR);
    league.setPairings(SEMIFINALS, [[5, 1], [3, 2]]);
    league.setScores(SEMIFINALS, [[5, 1, 380, 420.75], [3, 2, 333.3, 333.2]]);
    await league.run(endOf(SEMIFINALS) + 7 * HOUR);
    league.setPairings(FINAL, [[3, 1]]);
    league.setScores(FINAL, [[3, 1, three, one]]);
}

/** the season page's championship roster: [player ID, name] in the page's order (FPts, then name) */
async function rings(league: League) {
    const { getChampionRoster } = await import('@/lib/data/league');
    const roster = await league.read(() => getChampionRoster(SEASON));
    return roster && { team: roster.team, players: roster.rows.map(row => [row.ID, row.Player]) };
}

test("the run that writes the champion writes the championship roster: everyone on the champion's roster outside the minors on any day of the weeks it played", async t => {
    const league = await playoffLeague(t);
    const { getPlayer } = await import('@/lib/data/league');
    league.setPlayers([['star', 100, 10, 1], ['pickup', 5, 1, null], ['hurt', 0, null, 1], ['prospect', 0, null, 1], ['byeweek', 3, 1, null]]);
    // Franchise 1 has a bye in the Quarterfinals week, so its run is the Semifinals and the Final.
    league.setRoster(1, daysOf(QUARTERFINALS), [['star', 'ACTIVE'], ['hurt', 'INJURED_RESERVE'], ['prospect', 'MINORS'], ['byeweek', 'ACTIVE']]);
    league.setRoster(1, [...daysOf(SEMIFINALS), ...daysOf(FINAL)], [['star', 'RESERVE'], ['hurt', 'INJURED_RESERVE'], ['prospect', 'MINORS']]);
    // a pickup for a single day of the Semifinals, and a player picked up for one day of the Final and dropped since with no points
    league.setRoster(1, [daysOf(SEMIFINALS)[3]], [['star', 'ACTIVE'], ['hurt', 'INJURED_RESERVE'], ['prospect', 'MINORS'], ['pickup', 'ACTIVE']]);
    league.setRoster(1, [daysOf(FINAL)[9]], [['star', 'ACTIVE'], ['hurt', 'INJURED_RESERVE'], ['prospect', 'MINORS'], ['dropped', 'RESERVE']]);
    league.fantrax.directory = { dropped: { name: 'Dee Dropped', positions: ['D'], nhlTeam: 'TOR' } };
    // the loser's roster wins no ring
    league.setRoster(3, PLAYOFF_DAYS, [['loser', 'ACTIVE']]);
    await playToTheFinal(league, [700, 799.9]);
    assert.equal(await rings(league), null, 'no roster before the champion');

    const { result, revalidatedTags } = await league.run(endOf(FINAL) + 7 * HOUR);
    assert.equal(result.outcome === 'synced' && result.changed.championshipRoster, 4);
    assert.deepEqual(await rings(league), { team: 'Club 1', players: [['star', 'Name star'], ['pickup', 'Name pickup'], ['dropped', 'Dee Dropped'], ['hurt', 'Name hurt']] },
        'a single day counts, injured reserve counts, the minors and the bye week do not');
    for (const tag of [`league:season:${SEASON}`, 'league:players']) assert.ok(revalidatedTags.includes(tag), tag);

    const star = (await league.read(() => getPlayer('star')))!;
    assert.deepEqual(star.championships, [{ season: SEASON, team: 'Club 1' }], "the ring is on the player's page");
    const dropped = (await league.read(() => getPlayer('dropped')))!;
    assert.deepEqual([dropped.name, dropped.championships], ['Dee Dropped', [{ season: SEASON, team: 'Club 1' }]], 'a dropped player with no points gets a player page');
    assert.deepEqual(dropped.playerStats.map(season => [season.Year, season.FPts, season.Position, season.YOFHLTeam]), [[SEASON, 0, 'D', 'FA']], 'and a player season');
});

/** franchise 1's roster through the playoffs: star active, hurt on injured reserve */
function rosterOne(league: League) {
    league.setPlayers([['star', 100, 10, 1], ['hurt', 0, null, 1]]);
    league.setRoster(1, PLAYOFF_DAYS, [['star', 'ACTIVE'], ['hurt', 'INJURED_RESERVE']]);
}

test("once the roster is written, later runs neither change it nor read the champion's daily rosters again", async t => {
    const league = await playoffLeague(t);
    rosterOne(league);
    await playToTheFinal(league, [700, 799.9]);
    await league.run(endOf(FINAL) + 7 * HOUR);
    const written = await rings(league);

    league.setRoster(1, daysOf(FINAL), [['star', 'ACTIVE'], ['hurt', 'INJURED_RESERVE'], ['latecomer', 'ACTIVE']]);
    league.fantrax.down.add('dayRosters');
    league.fantrax.down.add('playerDirectory');
    const { result } = await league.run(endOf(FINAL) + 31 * HOUR);
    assert.deepEqual(result.outcome === 'synced' && [result.changed.championshipRoster, result.warnings], [0, []]);
    assert.deepEqual(await rings(league), written);
});

test('a championship roster saved in admin before the Final is decided is left unchanged, with no warning', async t => {
    const league = await playoffLeague(t);
    const { saveRoster } = await import('@/lib/data/curated-edits');
    rosterOne(league);
    await playToTheFinal(league, [700, 799.9]);
    await league.league.runAsRoute('/admin', () => saveRoster(SEASON, ['star']));
    league.fantrax.down.add('dayRosters');

    const { result } = await league.run(endOf(FINAL) + 7 * HOUR);
    assert.deepEqual(result.outcome === 'synced' && [result.changed.championshipRoster, result.warnings], [0, []]);
    assert.deepEqual(await rings(league), { team: 'Club 1', players: [['star', 'Name star']] });
});

/** a stat correction three days after the Final ends flips it: 3 now beats 1 */
const flipTheFinal = (league: League) => league.setScores(FINAL, [[3, 1, 800, 799.9]]);
const AFTER_THE_FLIP = endOf(FINAL) + 3 * DAY;

test("a flipped Final replaces an automatic roster the league owner hasn't saved with the new champion's", async t => {
    const league = await playoffLeague(t);
    const { getSeasonSyncStatus } = await import('@/lib/admin/data');
    const { getPlayer } = await import('@/lib/data/league');
    rosterOne(league);
    league.setPlayers([['star', 100, 10, 1], ['hurt', 0, null, 1], ['three', 50, 5, 3]]);
    league.setRoster(3, PLAYOFF_DAYS, [['three', 'ACTIVE']]);
    await playToTheFinal(league, [700, 799.9]);
    await league.run(endOf(FINAL) + 7 * HOUR);
    assert.equal((await getSeasonSyncStatus(SEASON))!.autoRosterFranchiseId, 1);

    flipTheFinal(league);
    const { result } = await league.run(AFTER_THE_FLIP);
    assert.deepEqual(result.outcome === 'synced' && [result.changed.championshipRoster, result.warnings], [3, []], 'two removed, one added');
    assert.deepEqual(await rings(league), { team: 'Club 3', players: [['three', 'Name three']] });
    assert.deepEqual((await league.read(() => getPlayer('star')))!.championships, []);
    assert.equal((await getSeasonSyncStatus(SEASON))!.autoRosterFranchiseId, 3);
});

test('saving the roster in admin clears the automatic roster record, and a flipped Final then leaves the saved roster with a warning', async t => {
    const league = await playoffLeague(t);
    const { getSeasonSyncStatus } = await import('@/lib/admin/data');
    const { saveRoster } = await import('@/lib/data/curated-edits');
    rosterOne(league);
    league.setRoster(3, PLAYOFF_DAYS, [['three', 'ACTIVE']]);
    await playToTheFinal(league, [700, 799.9]);
    await league.run(endOf(FINAL) + 7 * HOUR);

    // the league owner trims hurt from the ring roster
    await league.league.runAsRoute('/admin', () => saveRoster(SEASON, ['star']));
    assert.equal((await getSeasonSyncStatus(SEASON))!.autoRosterFranchiseId, null);
    const quiet = await league.run(endOf(FINAL) + 31 * HOUR);
    assert.deepEqual(quiet.result.outcome === 'synced' && quiet.result.warnings, [], 'the roster saved for the champion needs no check');

    flipTheFinal(league);
    const { result } = await league.run(AFTER_THE_FLIP);
    assert.equal(result.outcome === 'synced' && result.changed.championshipRoster, 0);
    assert.deepEqual(await rings(league), { team: 'Club 3', players: [['star', 'Name star']] });
    assert.deepEqual((await getSeasonSyncStatus(SEASON))!.warnings,
        ['The championship roster was saved in admin before Club 3 won the Final, so the season sync left it alone. Check it in the roster editor.']);
    const later = await league.run(AFTER_THE_FLIP + DAY);
    assert.deepEqual(later.result.outcome === 'synced' && later.result.warnings.length, 1, 'the warning stands until the roster is saved again');
});

test('a failed roster read writes nothing in that run, the champion included, and the next run writes both', async t => {
    const league = await playoffLeague(t);
    const { getSeasonArchive } = await import('@/lib/data/league');
    rosterOne(league);
    await playToTheFinal(league, [700, 799.9]);
    league.fantrax.down.add('dayRosters');
    const failed = await league.run(endOf(FINAL) + 7 * HOUR);
    assert.equal(failed.result.outcome, 'failed');
    assert.equal((await league.read(() => getSeasonArchive())).current?.year, SEASON, 'no champion');
    assert.equal(await rings(league), null);

    league.fantrax.down.delete('dayRosters');
    const { result } = await league.run(endOf(FINAL) + 31 * HOUR);
    assert.deepEqual(result.outcome === 'synced' && [result.changed.playoffGames, result.changed.championshipRoster], [1, 2]);
    assert.equal((await league.read(() => getSeasonArchive())).latest?.team, 'Club 1');
    assert.deepEqual(await rings(league), { team: 'Club 1', players: [['star', 'Name star'], ['hurt', 'Name hurt']] });
});

test("a champion set in bracket review after a level Final gets its roster from the next run", async t => {
    const league = await playoffLeague(t);
    const { getSeasonDetail } = await import('@/lib/data/league');
    const { saveMatchup } = await import('@/lib/data/curated-edits');
    rosterOne(league);
    await playToTheFinal(league, [800, 800]);
    await league.run(endOf(FINAL) + 7 * HOUR);
    assert.equal(await rings(league), null);

    const final = (await league.read(() => getSeasonDetail(SEASON))).games.find(game => game.round === 3)!;
    await league.league.runAsRoute('/admin', () => saveMatchup(SEASON, final.id, 1, 'Won on the tiebreak'));
    const { result } = await league.run(endOf(FINAL) + 31 * HOUR);
    assert.equal(result.outcome === 'synced' && result.changed.championshipRoster, 2);
    assert.deepEqual(await rings(league), { team: 'Club 1', players: [['star', 'Name star'], ['hurt', 'Name hurt']] });
});

test("the points leader cached while the season was played is the Prime Minister's Trophy winner once the Final publishes the season", async t => {
    const league = await playoffLeague(t);
    const archive = await import('@/lib/data/award-archive');
    const { getFranchiseHonors } = await import('@/lib/data/history');
    const winners = async () => (await league.read(() => archive.winners('prime-minister')))!.map(winner => winner.Year);
    const trophies = async () => (await league.read(() => getFranchiseHonors(3))).primeMinisters.map(win => win.year);
    rosterOne(league);
    // read, and so cached, while the opened season has no points
    assert.deepEqual([await winners(), await trophies()], [[], []]);
    league.setStandings([1, 2, 3, 4, 5, 6, 7, 8].map(team => [team, team, 10, 5, 0, team === 3 ? 5000 : 4000 - team, 3000]));
    await playToTheFinal(league, [700, 799.9]);
    assert.deepEqual([await winners(), await trophies()], [[], []], 'no trophy while the season is being played');

    await league.run(endOf(FINAL) + 7 * HOUR);
    assert.deepEqual([await winners(), await trophies()], [[SEASON], [SEASON]]);
});

test('on the team page a season being played is pending, and in the team comparison its Quarterfinal games are not Finals', async t => {
    const league = await playoffLeague(t);
    const { getFranchise } = await import('@/lib/data/league');
    const { getRivalryData } = await import('@/lib/data/rivalries');
    const { roundLabel } = await import('@/lib/rivalries/model');
    const season = async (id: number) => (await league.read(() => getFranchise(id)))!.seasons.find(row => row.year === SEASON)!;
    const rounds = async () => (await league.read(() => getRivalryData())).games.filter(game => game.year === SEASON && game.stage === 'playoff').map(roundLabel);
    rosterOne(league);
    league.setPairings(QUARTERFINALS, [[null, 1], [5, 4], [null, 2], [6, 3]]);
    league.setScores(QUARTERFINALS, [[5, 4, 410.5, 398.25], [6, 3, 350, 402.1]]);
    await league.run(endOf(QUARTERFINALS) + 7 * HOUR);
    assert.deepEqual([(await season(5)).playoffStatus, (await season(1)).playoffStatus], ['pending', 'pending'], 'a Quarterfinal winner and a bye team alike');
    assert.deepEqual(await rounds(), ['Quarterfinals', 'Quarterfinals']);

    await playToTheFinal(league, [700, 799.9]);
    await league.run(endOf(FINAL) + 7 * HOUR);
    assert.deepEqual([(await season(1)).playoffStatus, (await season(1)).playoffRound, (await season(1)).finalRound], ['complete', 3, 3]);
    assert.deepEqual(await rounds(), ['Final', 'Semifinals', 'Semifinals', 'Quarterfinals', 'Quarterfinals']);
});
