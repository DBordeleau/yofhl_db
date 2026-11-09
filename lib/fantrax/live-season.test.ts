import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveSeason, type LiveSeason } from './assemble-live-season';
import { createMemorySource, type MemoryState } from './memory-source';
import type { SourceCore } from './live-season-source';

// A 26-week season of eight teams: weeks 1–23 are the regular season, 24–26 the three playoff rounds.
const DAY = 86400 * 1000;
const OPENING = Date.parse('2026-10-05T04:00:00.000Z');
const iso = (time: number) => new Date(time).toISOString();
const WEEKS = Array.from({ length: 26 }, (_, index) => ({
    number: index + 1, startDate: iso(OPENING + index * 7 * DAY), endDate: iso(OPENING + (index + 1) * 7 * DAY - 1000),
}));
/** `days` into a week */
const during = (week: number, days = 3) => OPENING + (week - 1) * 7 * DAY + days * DAY;
const TEAMS = ['fx1', 'fx2', 'fx3', 'fx4', 'fx5', 'fx6', 'fx7', 'fx8'];

function league(options: { played?: number } = {}): MemoryState {
    const played = options.played ?? 0;
    const core: SourceCore = {
        fetchedAt: '2026-10-07T00:00:00.000Z',
        seasonYear: 2027,
        teams: TEAMS.map((id, index) => ({ id, name: index === 7 ? 'Expansion Hopefuls Club' : `Fantrax Name ${index + 1}` })),
        weeks: WEEKS,
        lineupPeriod: { number: 3, startDate: WEEKS[0].startDate, endDate: WEEKS[0].endDate },
        schedule: WEEKS.filter(week => week.number <= 23).map(week => ({
            week: week.number, matchups: [[0, 1], [2, 3], [4, 5], [6, 7]].map(([away, home]) => ({ away: { id: TEAMS[away] }, home: { id: TEAMS[home] } })),
        })),
        standings: TEAMS.map((teamId, index) => ({ teamId, rank: index + 1, record: `${played}-0-0`, points: 1000 - index })),
        rosters: { fx1: [{ id: 'p1', position: 'C', status: 'ACTIVE' }, { id: 'p9', position: 'G', status: 'RESERVE' }] },
        players: { p1: { name: 'McDavid, Connor', position: 'C', team: 'EDM' }, p9: { name: 'Rookie, Goalie', position: 'G' } },
        playoffs: { numPlayoffTeams: 6, lastRegularSeasonPeriod: 23, firstPlayoffPeriod: 24 },
    };
    return {
        fantraxTeams: TEAMS.slice(0, 7).map((fantraxTeamId, index) => ({ seasonYear: 2027, fantraxLeagueId: 'league27', fantraxTeamId, franchiseId: index + 1 })),
        franchises: TEAMS.slice(0, 7).map((_, index) => ({ id: index + 1, name: `Franchise ${index + 1}`, abbreviation: `F${index + 1}`, logo: `/logos/f${index + 1}.png`, owner: `Owner ${index + 1}` })),
        archivedPlayerIds: ['*p1*', 'p2'],
        fantrax: {
            core,
            scores: Object.fromEntries(WEEKS.map(week => [week.number, { fetchedAt: core.fetchedAt, week: week.number, matchups: [
                { away: { teamId: 'fx1', score: 10 + week.number, gamesPlayed: 5 }, home: { teamId: 'fx2', score: 8, gamesPlayed: 5 } },
            ] }])),
            leaders: { fetchedAt: core.fetchedAt, players: [
                { id: 'p1', name: 'Connor McDavid', position: 'C', points: 50, perGame: 5, teamId: 'fx1', team: 'F1' },
                { id: 'p9', name: 'Free Agent', position: 'LW', points: 20, perGame: null, teamId: null, team: 'FA' },
            ] },
            rosterStats: { fetchedAt: core.fetchedAt, players: { p1: { points: 50, perGame: 5 } } },
        },
        saved: null,
        manualFinalWeeks: {},
        down: new Set(),
    };
}

function setup(t: TestContext, state = league()) {
    const warnings: string[] = [];
    t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); });
    t.mock.method(console, 'error', () => {});
    let now = during(5);
    const live = createLiveSeason(createMemorySource(state), { now: () => now });
    const season = async (options: { now?: number; fresh?: boolean } = {}) => {
        const result = await live.getLiveSeason({ now: options.now ?? now, fresh: options.fresh });
        assert.equal(result.status, 'available');
        return (result as { value: LiveSeason }).value;
    };
    return { state, live, season, warnings, setNow: (time: number) => { now = time; } };
}

const weekView = (season: LiveSeason, number: number) => {
    const week = season.weeks.find(item => item.number === number)!;
    return { name: week.name, fullName: week.fullName, stage: week.stage, phase: week.phase };
};

test('week 23 is a regular-season week and the last three weeks are the playoff rounds', async t => {
    const { season } = setup(t);
    const live = await season({ now: during(5) });
    assert.deepEqual(weekView(live, 1), { name: 'Week 1', fullName: 'Week 1', stage: 'regular', phase: 'final' });
    assert.deepEqual(weekView(live, 23), { name: 'Week 23', fullName: 'Week 23', stage: 'regular', phase: 'upcoming' });
    assert.deepEqual(weekView(live, 24), { name: 'Quarterfinals', fullName: 'Jagr Cup Playoff Quarterfinals', stage: 'Quarterfinals', phase: 'upcoming' });
    assert.deepEqual(weekView(live, 25), { name: 'Semifinals', fullName: 'Jagr Cup Playoff Semifinals', stage: 'Semifinals', phase: 'upcoming' });
    assert.deepEqual(weekView(live, 26), { name: 'Final', fullName: 'Jagr Cup Playoff Final', stage: 'Final', phase: 'upcoming' });
    assert.equal(live.seasonYear, 2027);
    assert.equal(live.weeks.length, 26);
});

test('the current week is week 1 before the season, the week in play during it and the Final after it', async t => {
    const { season } = setup(t);
    const before = await season({ now: OPENING - 10 * DAY });
    assert.deepEqual([before.currentWeek.name, before.currentWeek.phase], ['Week 1', 'upcoming']);
    assert.ok(before.weeks.every(week => week.phase === 'upcoming'));
    const during5 = await season({ now: during(5) });
    assert.deepEqual([during5.currentWeek.name, during5.currentWeek.phase], ['Week 5', 'active']);
    const after = await season({ now: Date.parse(WEEKS[25].endDate) + 30 * DAY });
    assert.deepEqual([after.currentWeek.name, after.currentWeek.phase], ['Final', 'final']);
    assert.ok(after.weeks.every(week => week.phase === 'final'));
});

test('a week turns final as soon as the standings count its results, through week 23 but never in the playoffs', async t => {
    // On the last day of week 5, every team's record already includes it.
    const early = setup(t, league({ played: 5 }));
    assert.equal(weekView(await early.season({ now: during(5, 6) }), 5).phase, 'final');
    assert.equal(weekView(await setup(t, league({ played: 4 })).season({ now: during(5, 6) }), 5).phase, 'active', 'results still to come');
    // Fantrax says its regular season ends at week 22; the league's ends at week 23, which still finalizes itself.
    const state = league({ played: 23 });
    state.fantrax.core.playoffs = { numPlayoffTeams: 4, lastRegularSeasonPeriod: 22 };
    assert.equal(weekView(await setup(t, state).season({ now: during(23, 6) }), 23).phase, 'final');
    // Even if the standings counted a playoff week, the Quarterfinals stay live until they end.
    const playoffs = league({ played: 24 });
    playoffs.fantrax.core.schedule.push({ week: 24, matchups: [{ away: { id: 'fx3' }, home: { id: 'fx6' } }, { away: { id: 'fx4' }, home: { id: 'fx5' } }] });
    const quarterfinals = weekView(await setup(t, playoffs).season({ now: during(24, 6) }), 24);
    assert.deepEqual([quarterfinals.name, quarterfinals.phase], ['Quarterfinals', 'active']);
});

test('a week marked final by hand is final, and clearing it returns the week to its automatic status', async t => {
    const { live, season, setNow } = setup(t);
    setNow(during(24));
    await live.setWeekFinal(24, true);
    let quarterfinals = (await season({ now: during(24) })).weeks[23];
    assert.deepEqual([quarterfinals.phase, quarterfinals.manualFinal], ['final', true]);
    await live.setWeekFinal(24, false);
    quarterfinals = (await season({ now: during(24) })).weeks[23];
    assert.deepEqual([quarterfinals.phase, quarterfinals.manualFinal], ['active', false]);
    await assert.rejects(live.setWeekFinal(25, true), RangeError, 'a week that has not started');
    await assert.rejects(live.setWeekFinal(99, true), RangeError, 'a week outside the season');
});

test('marking a week final refreshes first, and a failed refresh leaves the week unmarked', async t => {
    const { state, live, season } = setup(t);
    state.down.add('leaders');
    await assert.rejects(live.setWeekFinal(5, true));
    assert.equal((await season()).weeks[4].phase, 'active');
    state.down.clear();
    state.fantrax.core.fetchedAt = '2026-11-04T03:00:00.000Z';
    await live.setWeekFinal(5, true);
    const marked = await season();
    assert.equal(marked.weeks[4].phase, 'final');
    assert.equal(marked.fetchedAt, '2026-11-04T03:00:00.000Z', 'scores were captured before the week was marked');
});

test('live teams show their franchise\'s current identity, and an owner rename shows without a new capture', async t => {
    const { state, live, season } = setup(t);
    await live.refreshLiveSeason();
    const first = (await season()).teams[0];
    assert.deepEqual({ name: first.name, abbreviation: first.abbreviation, logo: first.logo, owner: first.owner, href: first.href },
        { name: 'Franchise 1', abbreviation: 'F1', logo: '/logos/f1.png', owner: 'Owner 1', href: '/teams/1' });
    state.franchises[0] = { ...state.franchises[0], name: 'Paddyville Inferno', logo: '/logos/uploads/inferno.webp' };
    const renamed = (await season()).teams[0];
    assert.deepEqual([renamed.name, renamed.logo, renamed.href], ['Paddyville Inferno', '/logos/uploads/inferno.webp', '/teams/1']);
});

test('a Fantrax team with no franchise shows its Fantrax name and initials, with no logo or team page, and is logged', async t => {
    const { season, warnings } = setup(t);
    const unmapped = (await season()).teams.find(team => team.id === 'fx8')!;
    assert.deepEqual({ name: unmapped.name, abbreviation: unmapped.abbreviation, logo: unmapped.logo, href: unmapped.href, franchiseId: unmapped.franchiseId },
        { name: 'Expansion Hopefuls Club', abbreviation: 'EHC', logo: null, href: null, franchiseId: null });
    assert.deepEqual(warnings.filter(message => message.includes('fx8')).map(message => /league\.fantrax_teams/.test(message)), [true]);
});

test('a Fantrax team mapped to a franchise missing from current_teams is logged as such', async t => {
    const state = league();
    state.franchises = state.franchises.filter(franchise => franchise.id !== 2);
    const { season, warnings } = setup(t, state);
    assert.equal((await season()).teams.find(team => team.id === 'fx2')!.href, null);
    const logged = warnings.filter(message => message.includes('fx2'));
    assert.equal(logged.length, 1);
    assert.match(logged[0], /franchise 2\b.*league\.current_teams/);
    assert.doesNotMatch(logged[0], /fantrax_teams/);
});

test('rostered players and scoring leaders link to their archive player pages when they have one', async t => {
    const { season } = setup(t);
    const live = await season();
    const roster = live.teams[0].players.map(player => [player.name, player.archiveId]);
    assert.deepEqual(roster, [['Connor McDavid', '*p1*'], ['Goalie Rookie', null]]);
    assert.ok(live.leaders.status === 'available');
    assert.deepEqual(live.leaders.value.players.map(player => [player.name, player.archiveId, player.team?.name ?? player.fantraxTeam]),
        [['Connor McDavid', '*p1*', 'Franchise 1'], ['Free Agent', null, 'FA']]);
});

test('the standings draw the playoff line under 6th and give the top 2 seeds byes', async t => {
    const { season } = setup(t);
    const { standings } = await season();
    assert.deepEqual(standings.rows.map(row => [row.team.name, row.bye, row.playoffLineBelow]), [
        ['Franchise 1', true, false], ['Franchise 2', true, false], ['Franchise 3', false, false], ['Franchise 4', false, false],
        ['Franchise 5', false, false], ['Franchise 6', false, true], ['Franchise 7', false, false], ['Expansion Hopefuls Club', false, false],
    ]);
    assert.deepEqual([standings.playoffTeams, standings.byeTeams], [6, 2]);
});

test('a scores, scoring leaders or roster stats outage hides only that section', async t => {
    for (const outage of ['scores', 'leaders', 'rosterStats'] as const) {
        const state = league();
        state.down.add(outage);
        const live = await setup(t, state).season();
        const sections = { scores: live.scores.status, leaders: live.leaders.status, rosterStats: live.rosterStats.status };
        assert.deepEqual(sections, { scores: 'available', leaders: 'available', rosterStats: 'available', [outage]: 'unavailable' }, outage);
        assert.equal(live.standings.rows.length, 8, `standings still show during a ${outage} outage`);
        assert.equal(live.currentWeek.matchups.length, 4, `matchups still show during a ${outage} outage`);
    }
});

test('the current week has no scores until it starts', async t => {
    const { season } = setup(t);
    const before = await season({ now: OPENING - DAY });
    assert.deepEqual(before.scores, { status: 'available', value: null });
    const live = await season({ now: during(5) });
    assert.ok(live.scores.status === 'available' && live.scores.value);
    assert.deepEqual([live.scores.value.week, live.scores.value.matchups[0].away.score], [5, 15]);
});

test('the whole live season is unavailable when the core snapshot cannot be loaded', async t => {
    const state = league();
    state.down.add('core');
    const { live } = setup(t, state);
    assert.deepEqual(await live.getLiveSeason({ now: during(5) }), { status: 'unavailable', fantraxLeagueId: 'league27' });
});

test('fresh reads skip the saved snapshot', async t => {
    const { state, live, season } = setup(t);
    await live.refreshLiveSeason();
    state.fantrax.core.rosters.fx1.push({ id: 'p2', position: 'D', status: 'ACTIVE' });
    state.fantrax.core.players.p2 = { name: 'Traded, Just', position: 'D' };
    const rosterNames = (live: LiveSeason) => live.teams[0].players.map(player => player.name);
    assert.deepEqual(rosterNames(await season()), ['Connor McDavid', 'Goalie Rookie'], 'pages read the saved snapshot');
    assert.deepEqual(rosterNames(await season({ fresh: true })), ['Connor McDavid', 'Goalie Rookie', 'Just Traded']);
});

test('week scores: an unknown week is a RangeError and a week that has not started has none', async t => {
    const { live } = setup(t);
    await assert.rejects(live.getWeekScores(27), RangeError);
    assert.equal(await live.getWeekScores(6), null);
    assert.deepEqual((await live.getWeekScores(2))?.matchups[0].away.score, 12);
});

test('refresh warns once when Fantrax\'s playoff settings disagree with the league, and page reads never do', async t => {
    const state = league();
    state.fantrax.core.playoffs = { numPlayoffTeams: 4, lastRegularSeasonPeriod: 22, firstPlayoffPeriod: 23 };
    const { live, season, warnings } = setup(t, state);
    const drift = () => warnings.filter(message => /playoff settings/.test(message));
    await season();
    await season({ fresh: true });
    assert.equal(drift().length, 0);
    await live.refreshLiveSeason();
    assert.equal(drift().length, 1);
    assert.match(drift()[0], /4 playoff teams.*week 22/);
    await season();
    assert.equal(drift().length, 1);
    state.fantrax.core.playoffs = { numPlayoffTeams: 6, lastRegularSeasonPeriod: 23, firstPlayoffPeriod: 24 };
    await live.refreshLiveSeason();
    assert.equal(drift().length, 1, 'no warning once Fantrax agrees');
});

test('a failed refresh publishes nothing', async t => {
    const { state, live, season } = setup(t);
    await live.refreshLiveSeason();
    state.fantrax.core.fetchedAt = '2026-11-04T03:00:00.000Z';
    state.down.add('rosterStats');
    await assert.rejects(live.refreshLiveSeason());
    assert.equal((await season()).fetchedAt, '2026-10-07T00:00:00.000Z');
});
