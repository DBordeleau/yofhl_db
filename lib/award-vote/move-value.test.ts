// GM of the Year's transaction summary (GLOSSARY.md, "Move value"): each franchise's trades in full, its most
// valuable free-agent claims and costliest drops with the rest rolled into one line, and its draft class, each move
// valued from one all-positions points read per regular-season day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardVoteLeague, goalie, REGULAR_SEASON_DAYS, SEASON, skater } from './testing/award-vote-league';

/** a league with no imported transactions but the test's own */
async function movesLeague(t: Parameters<typeof awardVoteLeague>[0]) {
    const harness = await awardVoteLeague(t, { transactions: false });
    /** franchise `franchise`'s transaction summary in the admin's preview */
    const summaryOf = async (franchise: number) => {
        const { gmOfTheYear } = await harness.act(() => harness.vote.readPreview({ seasonYear: SEASON }));
        return gmOfTheYear?.candidates.find(candidate => candidate.franchiseId === franchise)?.summary.transactions;
    };
    return { ...harness, summaryOf };
}

test("a claim is worth the points scored from the day of the claim until the player was dropped, and the drop what they scored from then to the season's end", async t => {
    const { claimed, dropped, scoredOn, prepareFully, summaryOf } = await movesLeague(t);
    await claimed('c1', 2, '2026-10-14');
    await dropped('c1', 2, '2026-10-20');
    // before the claim: nobody's
    scoredOn('2026-10-13', [['c1', 5], ['other', 9]]);
    // the claim's
    scoredOn('2026-10-14', [['c1', 3]]);
    scoredOn('2026-10-19', [['other', 2], ['c1', -1.5]]);
    // from the drop on: what dropping him cost
    scoredOn('2026-10-20', [['c1', 6.25]]);
    scoredOn('2026-11-01', [['c1', 2]]);
    assert.equal((await prepareFully()).result.ok, true);
    assert.deepEqual(await summaryOf(2), {
        trades: [],
        claims: [{ playerId: 'c1', name: 'Archive c1', occurredOn: '2026-10-14', moveValue: 1.5 }],
        drops: [{ playerId: 'c1', name: 'Archive c1', occurredOn: '2026-10-20', moveValue: 8.25 }],
        otherMoves: null,
        draftClass: [],
    });
});

test("each regular-season day's all-positions points are read in a call of their own, a page per call, and a move counts every page", async t => {
    const { act, vote, fantrax, claimed, scoredOn, summaryOf } = await movesLeague(t);
    await claimed('deep', 1, '2026-10-12');
    // three players scored on October 20, so its table is two pages of two, the claimed player's on the second
    scoredOn('2026-10-20', [['a', 9], ['b', 8], ['deep', 4]]);
    scoredOn('2026-10-21', [['deep', -2]]);
    fantrax.pageSize = 2;
    const calls: string[][] = [];
    let result;
    do {
        const before = fantrax.reads.length;
        result = await act(() => vote.prepare({ seasonYear: SEASON }));
        calls.push(fantrax.reads.slice(before));
    } while (result.ok && !result.done);
    // the dates, the six stat set reads and the Final's rosters, then a step a day
    assert.deepEqual(result, { ok: true, done: true, stepsDone: 31, steps: 31 });
    const pointCalls = calls.filter(reads => reads.some(read => read.startsWith('points')));
    assert.ok(pointCalls.every(reads => reads.length === 1));
    assert.deepEqual(pointCalls.flat(), REGULAR_SEASON_DAYS.flatMap(day =>
        [`points ${day}..${day}`, ...day === '2026-10-20' ? [`points ${day}..${day} page 2`] : []]));
    assert.deepEqual((await summaryOf(1))?.claims.map(move => move.moveValue), [2]);
});

test('every trade is shown with both sides: a traded player gained by the franchise receiving them and lost by the one sending them, a pick by its label alone', async t => {
    const { trade, scoredOn, prepareFully, summaryOf } = await movesLeague(t);
    // franchise 1 sends p1 to franchise 2 for p2 and a pick; franchise 2 later sends p1 on to franchise 3
    await trade('2026-10-15', [{ player: 'p1', from: 1, to: 2 }, { player: 'p2', from: 2, to: 1 }, { pick: '2028 Draft Pick, Round 2 (Club 2)', from: 2, to: 1 }]);
    await trade('2026-10-25', [{ player: 'p1', from: 2, to: 3 }, { pick: '2028 Draft Pick, Round 1 (Club 3)', from: 3, to: 2 }]);
    scoredOn('2026-10-14', [['p1', 50], ['p2', 40]]);
    scoredOn('2026-10-15', [['p1', 10], ['p2', 1]]);
    scoredOn('2026-10-24', [['p1', 5]]);
    scoredOn('2026-10-25', [['p1', 20]]);
    scoredOn('2026-10-31', [['p1', 2.5], ['p2', 3]]);
    assert.equal((await prepareFully()).result.ok, true);
    const p1At2 = 15, p1At3 = 22.5, p2At1 = 4;
    assert.deepEqual((await summaryOf(1))?.trades, [{
        occurredOn: '2026-10-15',
        received: [
            { kind: 'player', playerId: 'p2', name: 'Archive p2', moveValue: p2At1, team: 'Club 2' },
            { kind: 'pick', label: '2028 Draft Pick, Round 2 (Club 2)', team: 'Club 2' },
        ],
        sent: [{ kind: 'player', playerId: 'p1', name: 'Archive p1', moveValue: p1At2, team: 'Club 2' }],
    }]);
    assert.deepEqual((await summaryOf(2))?.trades, [
        {
            occurredOn: '2026-10-15',
            received: [{ kind: 'player', playerId: 'p1', name: 'Archive p1', moveValue: p1At2, team: 'Club 1' }],
            sent: [
                { kind: 'player', playerId: 'p2', name: 'Archive p2', moveValue: p2At1, team: 'Club 1' },
                { kind: 'pick', label: '2028 Draft Pick, Round 2 (Club 2)', team: 'Club 1' },
            ],
        },
        {
            occurredOn: '2026-10-25',
            received: [{ kind: 'pick', label: '2028 Draft Pick, Round 1 (Club 3)', team: 'Club 3' }],
            sent: [{ kind: 'player', playerId: 'p1', name: 'Archive p1', moveValue: p1At3, team: 'Club 3' }],
        },
    ]);
    assert.deepEqual((await summaryOf(3))?.trades, [{
        occurredOn: '2026-10-25',
        received: [{ kind: 'player', playerId: 'p1', name: 'Archive p1', moveValue: p1At3, team: 'Club 2' }],
        sent: [{ kind: 'pick', label: '2028 Draft Pick, Round 1 (Club 3)', team: 'Club 2' }],
    }]);
    // nobody else traded
    assert.deepEqual((await summaryOf(4))?.trades, []);
});

test("a move between the draft and opening night counts from the season's first day", async t => {
    const { claimed, traded, scoredOn, prepareFully, summaryOf } = await movesLeague(t);
    await claimed('early', 4, '2026-09-28');
    await traded('early', 4, 1, '2026-10-05');
    scoredOn('2026-10-12', [['early', 7]]);
    scoredOn('2026-10-20', [['early', 3]]);
    assert.equal((await prepareFully()).result.ok, true);
    // franchise 4 never had him in the regular season; franchise 1 had him from its first day
    assert.deepEqual((await summaryOf(4))?.claims, [{ playerId: 'early', name: 'Archive early', occurredOn: '2026-09-28', moveValue: 0 }]);
    assert.deepEqual((await summaryOf(1))?.trades.map(trade => trade.received), [[{ kind: 'player', playerId: 'early', name: 'Archive early', moveValue: 10, team: 'Club 4' }]]);
});

test("a move after the regular season's last day is left out of the summary", async t => {
    const { claimed, dropped, traded, scoredOn, prepareFully, summaryOf } = await movesLeague(t);
    await claimed('late', 2, '2026-11-01');
    // the day after the regular season ends: playoffs
    await dropped('late', 2, '2026-11-02');
    await claimed('playoff', 2, '2026-11-02');
    await traded('dealt', 3, 2, '2026-11-03');
    scoredOn('2026-11-01', [['late', 4]]);
    assert.equal((await prepareFully()).result.ok, true);
    assert.deepEqual(await summaryOf(2), {
        trades: [],
        claims: [{ playerId: 'late', name: 'Archive late', occurredOn: '2026-11-01', moveValue: 4 }],
        drops: [],
        otherMoves: null,
        draftClass: [],
    });
    assert.deepEqual((await summaryOf(3))?.trades, []);
});

test("a franchise's five most valuable claims and five costliest drops are shown in full, and the rest in one line with a count and net FPts", async t => {
    const { claimed, dropped, scoredOn, prepareFully, summaryOf } = await movesLeague(t);
    // claims c1..c7 on October 13, worth 70, 60, ... 10; drops d1..d6 on October 13, costing 6, 5, ... 1
    const claims = [70, 60, 50, 40, 30, 20, 10];
    const drops = [6, 5, 4, 3, 2, 1];
    for (const [index] of claims.entries()) await claimed(`c${index + 1}`, 2, '2026-10-13');
    for (const [index] of drops.entries()) await dropped(`d${index + 1}`, 2, '2026-10-13');
    scoredOn('2026-10-16', [...claims.map((points, index): [string, number] => [`c${index + 1}`, points]), ...drops.map((points, index): [string, number] => [`d${index + 1}`, points])]);
    assert.equal((await prepareFully()).result.ok, true);
    const summary = await summaryOf(2);
    assert.deepEqual(summary?.claims.map(move => [move.playerId, move.moveValue]), [['c1', 70], ['c2', 60], ['c3', 50], ['c4', 40], ['c5', 30]]);
    assert.deepEqual(summary?.drops.map(move => [move.playerId, move.moveValue]), [['d1', 6], ['d2', 5], ['d3', 4], ['d4', 3], ['d5', 2]]);
    // c6 and c7 gained 30, d6 cost 1
    assert.deepEqual(summary?.otherMoves, { count: 3, netFpts: 29 });
});

test("the draft class lists the franchise's picks that season in draft order with each player's regular-season FPts, a pick who never scored at nothing", async t => {
    const { league, claimed, drafted, setRegularSeason, prepareFully, summaryOf } = await movesLeague(t);
    await claimed('anyone', 3, '2026-10-13');
    setRegularSeason([skater('star', 180.5), skater('other', 90)], [goalie('keeper', 60)]);
    await drafted('star', 1, 1);
    await drafted('other', 2, 2);
    await drafted('keeper', 1, 8);
    await drafted('bust', 1, 5);
    // an empty selection, and the season before's draft
    await drafted(null, 1, 9);
    await league.client.exec(`
        insert into league.draft_picks (season_year, overall, round, pick, franchise_id, team_name, player_id, player_name, positions, drafted_on, source_time, source_file)
        values (2026, 1, 1, 1, 1, 'Old 1', 'other', 'Drafted other', 'C', '2025-09-20', '7:00', 'draft.csv');`);
    assert.equal((await prepareFully()).result.ok, true);
    assert.deepEqual((await summaryOf(1))?.draftClass, [
        { overall: 1, round: 1, pick: 1, playerId: 'star', name: 'Drafted star', fpts: 180.5 },
        { overall: 5, round: 2, pick: 1, playerId: 'bust', name: 'Drafted bust', fpts: 0 },
        { overall: 8, round: 2, pick: 4, playerId: 'keeper', name: 'Drafted keeper', fpts: 60 },
    ]);
    assert.deepEqual((await summaryOf(2))?.draftClass.map(pick => [pick.playerId, pick.fpts]), [['other', 90]]);
    // a franchise with neither moves nor picks has an empty summary
    assert.deepEqual(await summaryOf(4), { trades: [], claims: [], drops: [], otherMoves: null, draftClass: [] });
});
