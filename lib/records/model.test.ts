import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChases, buildRecords, longestRun, matchupFormat, matchupFormats, rankEntries, type RecordSource, type Entry } from './model';
import type { FranchiseCard } from '../data/league';
import type { LeagueSnapshot, RosterStats } from '../fantrax/model';
import type { RivalryGame } from '../rivalries/model';
import history from '../rivalries/regular-season-history.json';
import periods from './periods.json';

const team = (ID: number, championships: number[] = []): FranchiseCard => ({ ID, Team: `Team ${ID}`, Abbreviation: `T${ID}`, Owner: null, defunct: false, Wins: 10, Losses: 5, Ties: 0, FPF: 1000, championships, finals: championships, LogoUrl: null });
const source = (): RecordSource => ({ teams: [team(1, [2019, 2021]), team(2)], players: [], seasons: [2019, 2020, 2021, 2022].flatMap(year => [1, 2].map(team => ({ year, team, name: `Team ${team}`, wins: 10, losses: 5, ties: 0, points: 1000 }))), awards: [], competitions: [2019, 2021, 2022], games: [], periods: [] });
const entry = (id: string, value: number): Entry => ({ id, name: id, value, detail: '', team: null, href: '/' });

test('records share ranks for ties and preserve inputs', () => {
    const entries = [entry('b', 10), entry('c', 9), entry('a', 10)];
    assert.deepEqual(rankEntries(entries).map(e => [e.id, e.rank]), [['a', 1], ['b', 1], ['c', 3]]);
    assert.equal(rankEntries(entries, true)[0].id, 'c');
    assert.deepEqual(entries.map(e => e.id), ['b', 'c', 'a']);
});

test('team season record names link to the franchise independently of their season details', () => {
    const records = buildRecords(source());
    for (const id of ['season-points', 'win-percentage', 'season-wins']) {
        const entry = records.find(record => record.id === id)!.entries[0];
        assert.equal(entry.href, `/teams/${entry.team}`);
        assert.match(entry.detail, /\d{4}–\d{2}/);
    }
});

test('cancelled playoffs do not break title runs and consecutive championships require at least two', () => {
    assert.deepEqual(longestRun([2019, 2021], [2019, 2021, 2022]), [2019, 2021]);
    const data = source();
    data.teams.push(team(3, [2022]));
    data.awards = [{ player: 'a', name: 'A', award: 'Teemu Selanne Trophy', year: 2022, team: 1 }, { player: 'a', name: 'A', award: 'Bobby Orr Award', year: 2022, team: 1 }];
    const records = buildRecords(data);
    assert.equal(records.find(r => r.id === 'repeat-cups')!.entries[0].value, 2);
    assert(records.find(r => r.id === 'repeat-cups')!.entries.every(e => e.value >= 2));
    assert(!records.some(r => ['drought', 'closest-win'].includes(r.id) || /selanne/i.test(r.title)));
    assert(records.some(r => r.title === 'Bobby Orr Award'));
    assert.equal(records.find(r => r.id === 'scoring-titles')!.entries.length, 0, 'a tied points lead cannot invent a trophy winner');
});

test('player season streaks cannot skip a missed scoring season', () => {
    const data = source();
    data.players = [2019, 2020, 2021, 2022].map(year => ({ id: '*a*', name: 'A', year, points: year === 2020 ? 499.75 : 500, positions: ['C'] }));
    const records = buildRecords(data);
    assert.equal(records.find(r => r.id === 'five-hundred')!.entries[0].value, 3);
    assert.equal(records.find(r => r.id === 'five-hundred-run')!.entries[0].value, 2);
    assert.equal(buildRecords(data, { position: 'G' }).find(r => r.id === 'player-career')!.entries.length, 0);
});

test('matchup records combine split-week periods across scoring rules and exclude extended and playoff games', () => {
    const data = source();
    const game = (id: number, score: number, against: number): RivalryGame => ({ id, year: 2022, round: id, stage: 'regular', finalRound: 6, away: 1, home: 2, awayName: 'A', homeName: 'B', awayScore: score, homeScore: against, winner: score > against ? 1 : score < against ? 2 : null, adjusted: false, note: null });
    data.games = [game(1, 100, 90), game(2, 0, 0), game(3, 110, 100), game(4, 900, 800), game(5, 500, 400), game(6, 50, 50), game(7, 1000, 900), { ...game(8, 999, 900), stage: 'playoff' }];
    data.periods = data.games.map(g => ({ year: g.year, period: g.round, days: g.id === 4 ? 21 : g.id === 7 ? 7 : g.id === 5 ? 4 : 3, era: g.id === 5 ? 2020 : 2022, start: '2022-01-01', end: '2022-01-04' }));
    const records = buildRecords(data, { format: 'biweekly' });
    assert.equal(records.find(r => r.id === 'matchup-score')!.entries[0].value, 500);
    assert.equal(records.find(r => r.id === 'winning-margin')!.entries[0].value, 100);
    assert.equal(buildRecords(data, { team: 2, format: 'biweekly' }).find(r => r.id === 'matchup-score')!.entries[0].value, 400);
    assert(!records.some(r => r.id === 'closest-win'));
    const period = { year: 2019, period: 1, days: 7, era: 2019, start: '', end: '' };
    assert.equal(matchupFormat(period), 'weekly');
    assert.equal(matchupFormat({ ...period, days: 5 }), 'weekly');
    assert.equal(matchupFormat({ ...period, days: 14 }), null);
    assert.equal(matchupFormat({ ...period, year: 2020, days: 2 }), 'biweekly');
    assert.equal(matchupFormat({ ...period, year: 2021, days: 5 }), 'biweekly');
    assert.equal(matchupFormat({ ...period, year: 2023 }), null);
});

test('all archived games have period evidence and only valid comparable formats are offered', () => {
    const data = { ...source(), games: history.games.map(g => ({ ...g, stage: 'regular' as const })), periods };
    assert(data.games.every(g => data.periods.some(p => p.year === g.year && p.period === g.round)));
    assert.deepEqual(matchupFormats(data).map(f => f.id), ['biweekly', 'weekly']);
    for (const format of ['biweekly', 'weekly']) {
    const records = buildRecords(data, { format });
    for (const r of records.filter(r => r.category === 'matchups')) for (const e of r.entries) {
        const game = data.games.find(g => `/records/game/${g.id}` === e.href)!;
        assert(game, 'record links resolve to an archived matchup');
        const period = periods.find(p => p.year === game.year && p.period === game.round)!;
        assert.equal(matchupFormat(period), format);
        assert(period.days <= 7);
        assert(game.awayScore || game.homeScore);
    }
    }
});

test('raw player categories rank independently of FPts and respect season position eligibility', () => {
    const data = source();
    const stats = (goals: number) => ({ goals, assists: 10, shots: 100, hits: 20, blocks: 30 });
    data.players = [
        { id: 'a', name: 'A', year: 2025, points: 400, positions: ['C'], stats: stats(50) },
        { id: 'a', name: 'A', year: 2026, points: 300, positions: ['LW'], stats: stats(40) },
        { id: 'b', name: 'B', year: 2026, points: 800, positions: ['C'], stats: stats(60) },
        { id: 'c', name: 'Missing stats', year: 2026, points: 1000, positions: ['C'] },
    ];
    const records = buildRecords(data, { stat: 'goals' });
    assert.equal(records.find(r => r.id === 'player-career-goals')!.entries[0].value, 90);
    assert.equal(records.find(r => r.id === 'player-season-goals')!.entries[0].value, 60);
    assert(!records.find(r => r.id === 'player-career-goals')!.entries.some(e => e.id === 'c'));
    assert.equal(buildRecords(data, { stat: 'goals', position: 'C' }).find(r => r.id === 'player-career-goals')!.entries[0].id, 'b');
    assert.equal(buildRecords(data).find(r => r.id === 'player-career')!.entries[0].id, 'c');
});

test('live milestones replace the current season, preserve cents, and never turn missing stats into zero', () => {
    const data = source();
    data.players = [
        { id: '*abc*', name: 'Player', year: 2026, points: 3950.75, positions: ['RW'] },
        { id: '*abc*', name: 'Player', year: 2027, points: 10, positions: ['RW'] },
    ];
    const live: LeagueSnapshot = { fetchedAt: '2026-10-16T12:00:00Z', seasonYear: 2026, teams: [{ id: 't1', franchiseId: 1, name: 'Team 1', abbreviation: 'T1', logo: null, owner: null, rank: 1, record: '2-0-0', points: 100,
        players: [{ id: 'abc', name: 'Player', position: 'RW', lineupPosition: 'RW', nhlTeam: 'BOS', status: 'ACTIVE', archiveId: '*abc*' }] }], scoringPeriods: [], rosterPeriod: null, schedule: [], playoffTeams: 4, lastRegularSeasonPeriod: 22, finalPeriods: [] };
    const stats: RosterStats = { fetchedAt: live.fetchedAt, players: { abc: { points: 42.75, perGame: 6.11 } } };
    const chase = buildChases(data, live, stats).find(c => c.id === 'player-abc')!;
    assert.deepEqual([chase.total, chase.target, chase.gap], [3993.5, 4000, 6.5]);
    assert.equal(buildChases(data, live, null).some(c => c.id === 'player-abc'), false);
    assert.deepEqual(buildChases(data, null, stats), []);
    assert.deepEqual(buildChases(data, live, stats, 2), []);
    assert.equal(buildChases(data, live, { ...stats, players: { abc: { points: 49.25, perGame: 7 } } }).find(c => c.id === 'player-abc')!.target, 5000);
});
