// GM of the Year (GLOSSARY.md): its candidates, every franchise's team season with how its season went beside the
// season before; ranking three other franchises on a ballot; and its 5-3-1 tally.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardVoteLeague, BASELINE_TRADE, COMPLETE, completeFor, SEASON, skater, votingLeague } from './testing/award-vote-league';

// The 2027 championship bracket the voting league's seed leaves (franchise 1, team season 11, beat franchise 2 in
// the Final, round 3), filled in: franchise 3 lost in the Semifinals and franchise 4 in the Quarterfinals. A
// consolation game doesn't make franchise 4 a semifinalist.
const BRACKET_2027 = `
    insert into league.matchups (season_year, stage, round, bracket, slot, away_team_season_id, home_team_season_id, away_score, home_score, winner_team_season_id)
    values (${SEASON}, 'playoff', 1, 'championship', 1, 13, 14, 300, 200, 13),
           (${SEASON}, 'playoff', 2, 'championship', 1, 11, 13, 300, 200, 11),
           (${SEASON}, 'playoff', 2, 'consolation', 1, 14, 12, 300, 200, 14);`;

test("preparing stores each franchise's record, FPts for and playoff finish for this season and the one before, and the preview lists every team season under its season identity and owner", async t => {
    const { act, vote, league, setRegularSeason, prepareFully } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 300)]);
    await league.client.exec(`${BRACKET_2027}
        update league.team_seasons set wins = 12, losses = 3, ties = 1, fpts_for = 1234.5 where id = 11;
        update league.team_seasons set wins = 6, losses = 9, ties = 1, fpts_for = 987.25 where id = 3;`);
    await prepareFully();
    const { gmOfTheYear } = await act(() => vote.readPreview({ seasonYear: SEASON }));
    assert.equal(gmOfTheYear?.award, 'gm-of-the-year');
    assert.equal(gmOfTheYear?.label, 'GM of the Year');
    const line = (wins: number, losses: number, ties: number, fptsFor: number, playoffFinish: string) => ({ wins, losses, ties, fptsFor, playoffFinish });
    // the only move is the seeded pick from franchise 4 to franchise 3 (move-value.test.ts covers the rest)
    const empty = { trades: [], claims: [], drops: [], otherMoves: null, draftClass: [] };
    const pick = (team: string) => ({ kind: 'pick', label: BASELINE_TRADE, team });
    assert.deepEqual(gmOfTheYear?.candidates, [
        {
            teamSeasonId: 11, franchiseId: 1, name: 'Club 1', abbreviation: 'C1', logo: '/logos/c1.png', owner: 'Owner 1',
            summary: { season: line(12, 3, 1, 1234.5, 'champion'), previous: line(10, 5, 1, 1000, 'champion'), transactions: empty },
        },
        {
            teamSeasonId: 12, franchiseId: 2, name: 'Club 2', abbreviation: 'C2', logo: '/logos/c2.png', owner: 'Owner 2',
            summary: { season: line(10, 5, 1, 1000, 'finalist'), previous: line(10, 5, 1, 1000, 'finalist'), transactions: empty },
        },
        {
            teamSeasonId: 13, franchiseId: 3, name: 'Club 3', abbreviation: 'C3', logo: '/logos/c3.png', owner: 'Owner 3',
            summary: {
                season: line(10, 5, 1, 1000, 'semifinalist'), previous: line(6, 9, 1, 987.25, 'missed'),
                transactions: { ...empty, trades: [{ occurredOn: '2026-10-12', received: [pick('Club 4')], sent: [] }] },
            },
        },
        {
            teamSeasonId: 14, franchiseId: 4, name: 'Club 4', abbreviation: 'C4', logo: '/logos/c4.png', owner: 'Owner 4',
            summary: {
                season: line(10, 5, 1, 1000, 'quarterfinalist'), previous: line(10, 5, 1, 1000, 'missed'),
                transactions: { ...empty, trades: [{ occurredOn: '2026-10-12', received: [], sent: [pick('Club 3')] }] },
            },
        },
    ]);
});

test("GM of the Year's candidates are only the franchises taking part, a new franchise has no season before, and preparing again picks up a corrected record", async t => {
    const { act, vote, league, setRegularSeason, prepareFully } = await awardVoteLeague(t);
    setRegularSeason([skater('s1', 300)]);
    // franchise 3 didn't play 2025–26, and franchise 4 folded after 2026–27
    await league.client.exec(`
        delete from league.team_seasons where id = 3;
        update league.franchises set folded_after_season = ${SEASON} where id = 4;`);
    await prepareFully();
    const candidates = async () => (await act(() => vote.readPreview({ seasonYear: SEASON }))).gmOfTheYear?.candidates
        .map(candidate => [candidate.teamSeasonId, candidate.summary.season.wins, candidate.summary.previous?.wins ?? null]);
    assert.deepEqual(await candidates(), [[11, 10, 10], [12, 10, 10], [13, 10, null]]);

    await league.client.exec(`update league.team_seasons set wins = 11, losses = 4 where id = 12`);
    await prepareFully();
    assert.deepEqual(await candidates(), [[11, 10, 10], [12, 11, 10], [13, 10, null]]);
});

test("an owner ranks three other franchises for GM of the Year: their own isn't a candidate, a ballot ranking it is refused, and a complete ballot ranks it", async t => {
    const { signInAs, read, saveDraft, submit, ownBallot } = await votingLeague(t);
    await signInAs('owner-1');
    const view = await read();
    assert.ok(view.status === 'ballot');
    assert.equal(view.gmOfTheYear?.depth, 3);
    assert.deepEqual(view.gmOfTheYear?.candidates.map(candidate => [candidate.teamSeasonId, candidate.name, candidate.owner]),
        [[12, 'Club 2', 'Owner 2'], [13, 'Club 3', 'Owner 3'], [14, 'Club 4', 'Owner 4']]);

    const players = Object.fromEntries(Object.entries(COMPLETE).filter(([award]) => award !== 'gm-of-the-year'));
    assert.deepEqual(await submit(players), { ok: false, reason: 'incomplete', problems: [{ award: 'gm-of-the-year', emptyRanks: [1, 2, 3], repeated: [] }] });
    for (const own of [['11', '12', '13'], [null, '11']]) {
        assert.deepEqual(await saveDraft({ 'gm-of-the-year': own }), { ok: false, reason: 'own-franchise' });
        assert.deepEqual(await submit({ ...players, 'gm-of-the-year': own }), { ok: false, reason: 'own-franchise' });
    }
    assert.deepEqual(await submit({ ...players, 'gm-of-the-year': ['13', '14', '13'] }),
        { ok: false, reason: 'incomplete', problems: [{ award: 'gm-of-the-year', emptyRanks: [], repeated: ['13'] }] });
    assert.deepEqual(await saveDraft({ 'gm-of-the-year': ['14'] }), { ok: true });
    assert.deepEqual((await ownBallot())?.draft, { 'gm-of-the-year': ['14', null, null] });
    assert.deepEqual(await submit({ ...players, 'gm-of-the-year': ['14', '12', '13'] }), { ok: true });

    // franchise 2 sees franchise 1 among its candidates, and not itself
    await signInAs('owner-2');
    const second = await read();
    assert.ok(second.status === 'ballot');
    assert.deepEqual(second.gmOfTheYear?.candidates.map(candidate => candidate.teamSeasonId), [11, 13, 14]);
    assert.deepEqual(await submit(COMPLETE), { ok: false, reason: 'own-franchise' });
    assert.deepEqual(await submit(completeFor(2)), { ok: true });
});

test("GM of the Year scores 5, 3 and 1, and its tally is in the admin's review with the other awards, by team season and owner", async t => {
    const { act, vote, submitFor, score, tallies } = await votingLeague(t);
    const gm = { 1: ['12', '13', '14'], 2: ['13', '11', '14'], 3: ['12', '11', '14'], 4: ['12', '13', '11'] };
    for (const [franchise, ranks] of Object.entries(gm)) await submitFor(Number(franchise), { ...COMPLETE, 'gm-of-the-year': ranks });
    assert.deepEqual(await score(), { ok: true });
    const result = await tallies();
    assert.ok(result.ok);
    assert.deepEqual(result.tallies.map(tally => tally.award),
        ['wayne-gretzky', 'le-magnifique', 'bobby-orr', 'hasek', 'teemu-selanne', 'danny-briere', 'gm-of-the-year']);
    const tally = result.tallies.at(-1)!;
    assert.ok(tally.award === 'gm-of-the-year');
    assert.equal(tally.label, 'GM of the Year');
    assert.deepEqual(tally.lines.map(line => [line.team.teamSeasonId, line.team.name, line.owner, line.points, line.votes, line.place]), [
        [12, 'Club 2', 'Owner 2', 15, [3, 0, 0], 1],
        [13, 'Club 3', 'Owner 3', 11, [1, 2, 0], 2],
        [11, 'Club 1', 'Owner 1', 7, [0, 2, 1], 3],
        [14, 'Club 4', 'Owner 4', 3, [0, 0, 3], 4],
    ]);

    // voiding franchise 4's ballot recomputes it with the others
    assert.deepEqual(await act(() => vote.voidBallot({ seasonYear: SEASON, franchiseId: 4, reason: 'Bad faith' })), { ok: true });
    const voided = await tallies();
    assert.ok(voided.ok);
    const gmLines = voided.tallies.find(item => item.award === 'gm-of-the-year')?.lines;
    assert.deepEqual(gmLines?.map(line => 'team' in line && [line.team.teamSeasonId, line.points, line.votes, line.place]), [
        [12, 10, [2, 0, 0], 1],
        [13, 8, [1, 1, 0], 2],
        [11, 6, [0, 2, 0], 3],
        [14, 3, [0, 0, 3], 4],
    ]);
});
