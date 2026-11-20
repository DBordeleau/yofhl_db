import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeKey } from './memory-fantrax';
import type { FantraxRosterSlot } from '@/lib/season-sync/ports';
import { awardVoteLeague, FINAL, goalie, PLAYOFF_ROUNDS, ROSTER_PERIODS, SEASON, skater } from './testing/award-vote-league';

type League = Awaited<ReturnType<typeof awardVoteLeague>>;

/** the Final's roster periods (week 6's seven days) */
const FINAL_PERIODS = ROSTER_PERIODS.slice(-7).map(period => period.number);

/** franchise `franchise` (Fantrax team fxN) had these players in these slots on these days of the Final (0 to 6) */
function rostered({ fantrax }: League, franchise: number, days: number[], players: [string, FantraxRosterSlot][]) {
    for (const day of days) {
        fantrax.rosters[FINAL_PERIODS[day]][`fx${franchise}`].push(...players.map(([id, status]) => ({ id, status })));
    }
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const CLUB_1 = { teamSeasonId: 11, franchiseId: 1, name: 'Club 1', abbreviation: 'C1', logo: '/logos/c1.png' };
const CLUB_2 = { teamSeasonId: 12, franchiseId: 2, name: 'Club 2', abbreviation: 'C2', logo: '/logos/c2.png' };

async function briere(league: League) {
    const { ballot } = await league.act(() => league.vote.readPreview({ seasonYear: SEASON }));
    return ballot!.find(award => award.award === 'danny-briere')!;
}

test("the Danny Briere Award lists everyone outside the minors on either finalist's roster on any day of the Final, credited to that finalist", async t => {
    const league = await awardVoteLeague(t);
    const { fantrax, setRegularSeason, prepareFully } = league;
    setRegularSeason([skater('champ', 200), skater('elsewhere', 150)]);
    fantrax.skaters[rangeKey(PLAYOFF_ROUNDS)] = [skater('champ', 60), skater('runner', 40), skater('dropped', 25), skater('elsewhere', 90), skater('minors', 30), skater('benched', 0)];
    fantrax.skaters[rangeKey(FINAL)] = [skater('champ', 20), skater('dropped', 5), skater('runner', 10), skater('elsewhere', 30), skater('minors', 10), skater('benched', 0)];
    fantrax.goalies[rangeKey(PLAYOFF_ROUNDS)] = [goalie('tender', 35)];
    fantrax.goalies[rangeKey(FINAL)] = [goalie('tender', 12)];
    // franchise 1 beat franchise 2 in the Final
    rostered(league, 1, EVERY_DAY, [['champ', 'ACTIVE'], ['tender', 'ACTIVE'], ['minors', 'MINORS'], ['benched', 'RESERVE']]);
    rostered(league, 2, EVERY_DAY, [['runner', 'INJURED_RESERVE']]);
    // franchise 2 dropped him after the Final's third day
    rostered(league, 2, [0, 1, 2], [['dropped', 'ACTIVE']]);
    // a non-finalist's player, however good
    rostered(league, 3, EVERY_DAY, [['elsewhere', 'ACTIVE']]);

    assert.deepEqual((await prepareFully()).result, { ok: true, done: true, stepsDone: 31, steps: 31 });
    // only the Final's rosters are read
    assert.deepEqual(fantrax.reads.filter(read => read.startsWith('dayRosters')), FINAL_PERIODS.map(period => `dayRosters ${period}`));

    const award = await briere(league);
    assert.equal(award.label, 'Danny Briere Award');
    assert.deepEqual(award.statSets, [{ name: 'playoffRounds', label: 'Playoffs' }, { name: 'final', label: 'Final' }]);
    assert.equal(award.shown, 50);
    assert.deepEqual(award.candidates.map(candidate => [candidate.playerId, candidate.team, candidate.stats.playoffRounds?.points, candidate.stats.final?.points]), [
        ['champ', CLUB_1, 60, 20],
        ['runner', CLUB_2, 40, 10],
        ['tender', CLUB_1, 35, 12],
        ['dropped', CLUB_2, 25, 5],
        ['benched', CLUB_1, 0, 0],
    ]);
    // playoff stats only, each position group with its own columns
    const champ = award.candidates[0];
    assert.deepEqual(Object.keys(champ.stats), ['playoffRounds', 'final']);
    assert.deepEqual(champ.stats.final, { group: 'skater', points: 20, perGame: 2, gamesPlayed: 10, goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0 });
    assert.deepEqual(award.candidates[2].stats.playoffRounds, { group: 'goalie', points: 35, perGame: 3.5, gamesPlayed: 10, wins: 0, goalsAgainst: 0, saves: 0, shutouts: 0 });

    // the regular-season awards are unchanged: regular-season stats, the last franchise to roster them
    const gretzky = (await league.act(() => league.vote.readPreview({ seasonYear: SEASON }))).ballot!.find(item => item.award === 'wayne-gretzky')!;
    assert.deepEqual(gretzky.candidates.map(candidate => [candidate.playerId, Object.keys(candidate.stats), candidate.team]), [
        ['champ', ['regularSeason'], null],
        ['elsewhere', ['regularSeason'], null],
    ]);
});

test('a player on both finalists\' rosters during the Final is credited to the finalist that had him last', async t => {
    const league = await awardVoteLeague(t);
    league.fantrax.skaters[rangeKey(PLAYOFF_ROUNDS)] = [skater('moved', 30), skater('back', 20)];
    league.fantrax.skaters[rangeKey(FINAL)] = [skater('moved', 10), skater('back', 5)];
    // dropped by franchise 2 after day 1, claimed by franchise 1 for the rest of the Final
    rostered(league, 2, [0, 1], [['moved', 'ACTIVE']]);
    rostered(league, 1, [2, 3, 4, 5, 6], [['moved', 'ACTIVE']]);
    // claimed by franchise 1 for days 1 to 3, back with franchise 2 for the last day
    rostered(league, 2, [0], [['back', 'ACTIVE']]);
    rostered(league, 1, [1, 2, 3], [['back', 'RESERVE']]);
    rostered(league, 2, [6], [['back', 'ACTIVE']]);
    await league.prepareFully();
    assert.deepEqual((await briere(league)).candidates.map(candidate => [candidate.playerId, candidate.team?.teamSeasonId]), [
        ['moved', 11],
        ['back', 12],
    ]);
});

test("preparing stops with a reason when a finalist's roster is missing from a day of the Final", async t => {
    t.mock.method(console, 'error', () => {});
    const league = await awardVoteLeague(t);
    delete league.fantrax.rosters[FINAL_PERIODS[3]].fx2;
    assert.deepEqual((await league.prepareFully()).result,
        { ok: false, reason: 'fantrax-failed', message: `Fantrax's rosters for roster period ${FINAL_PERIODS[3]} have no team fx2` });
});
