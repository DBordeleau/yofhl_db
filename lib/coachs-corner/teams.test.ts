import assert from 'node:assert/strict';
import test from 'node:test';
import { findPlayer, findTeam, resolveTeams, teamDiagnostics, type StudioPlayer, type StudioTeam } from './teams';

const player = (id: string | undefined, name: string, fpts: number): StudioPlayer =>
    ({ ...(id === undefined ? {} : { id }), name, headshot: null, nhlTeam: 'VAN', positions: ['C'], season: 2026, fpts, fpg: 4, games: null });

test('two players with the same name each show their own stats', () => {
    const players = [player('048x9', 'Elias Pettersson', 309.75), player('0ab12', 'Elias Pettersson', 134)];
    assert.equal(findPlayer(players, { name: 'Elias Pettersson', id: '048x9' })?.fpts, 309.75);
    assert.equal(findPlayer(players, { name: 'Elias Pettersson', id: '0ab12' })?.fpts, 134);
    assert.equal(findPlayer(players.slice(0, 1), { name: 'Elias Pettersson', id: '0ab12' }), null, 'never the other namesake');
});

test('a bare name, or a row stored before ids, still resolves by name', () => {
    const legacy = [player(undefined, 'Tom Wilson', 372)];
    assert.equal(findPlayer(legacy, { name: 'tom wilson' })?.fpts, 372);
    assert.equal(findPlayer(legacy, { name: 'Tom Wilson', id: '003vz' })?.fpts, 372);
    assert.equal(findPlayer(legacy, { name: 'Nico Hischier' }), null);
});

const team = (id: number, abbreviation: string, name: string, owner: string | null): StudioTeam =>
    ({ id, name, abbreviation, owner, ownerFirst: owner?.split(' ')[0] ?? null, logo: null, primary: '#000000', secondary: '#FFFFFF' });
const league = [
    team(3, 'HH', 'Hooterville Honkers', 'Jeremy Smith'),
    team(9, 'Reapers', 'Carolina Reapers', 'Brian Jones'),
    team(5, 'JAGR', 'Jagrtown Ice Fellas', 'Nick Brown'),
    team(13, 'HUNG', 'Hamhung Hall Monitors', 'Andrew White'),
];
const at = (ref: string, line = 1) => ({ ref, line });

test('a cue matches by abbreviation, owner first name, full name, then a word of the name', () => {
    const matched = (teams: StudioTeam[], ref: string) => {
        const [result] = resolveTeams(teams, [at(ref)]);
        return result.kind === 'team' ? result.team.id : result.kind;
    };
    assert.equal(matched(league, 'hh'), 3);
    assert.equal(matched(league, 'Jeremy'), 3);
    assert.equal(matched(league, 'Jagrtown Ice Fellas'), 5);
    assert.equal(matched(league, 'Hooterville'), 3);
    assert.equal(matched(league, 'Ice'), 5);
    assert.equal(matched([...league, team(7, 'HOF', 'Hall of Famers', null)], 'of'), 'unknown', 'a word of two letters is too short');
});

test('a cue with no match is unknown, and only the current abbreviation matches', () => {
    // the 2026-10-26 episode wrote Carolina's league.yml abbreviation; the site's is Reapers
    assert.deepEqual(resolveTeams(league, [at('Reaper', 109)]), [{ kind: 'unknown', ref: 'Reaper', line: 109 }]);
    assert.equal(findTeam(league, 'Reaper'), null);
    assert.equal(findTeam(league, 'Reapers')?.id, 9);
});

test('two teams matching in the same tier are ambiguous, listing both', () => {
    const twoNicks = [...league, team(1, 'PVLS', 'Paddyville Lucifers', 'Nick Green')];
    const [result] = resolveTeams(twoNicks, [at('Nick', 4)]);
    assert.equal(result.kind, 'ambiguous');
    assert.deepEqual(result.kind === 'ambiguous' && result.candidates.map(t => t.id), [5, 1]);
    assert.equal(findTeam(twoNicks, 'Nick'), null, 'never a team by guess');
    const twoHalls = [...league, team(7, 'HOF', 'Hall of Famers', null)];
    assert.equal(resolveTeams(twoHalls, [at('Hall')])[0].kind, 'ambiguous', 'a word in two team names');
});

test('an earlier tier wins over a later one', () => {
    // HUNG is Hamhung's abbreviation and a word of another team's name; the abbreviation decides
    const teams = [...league, team(2, 'NPD', 'Hung Jury', 'Hung Lee')];
    assert.equal(findTeam(teams, 'Hung')?.id, 13);
    // an owner's first name beats a word of another team's name
    assert.equal(findTeam([...league, team(4, 'VWIZ', 'Varrock Jeremy Wizards', null)], 'Jeremy')?.id, 3);
});

test('unknown and ambiguous cues are errors on their line, with what to write instead', () => {
    const twoNicks = [...league, team(1, 'PVLS', 'Paddyville Lucifers', null)];
    twoNicks[4] = { ...twoNicks[4], ownerFirst: 'Nick' };
    const diagnostics = teamDiagnostics(twoNicks, [at('HH', 2), at('Reaper', 7), at('Nick', 9)]);
    assert.deepEqual(diagnostics.map(d => [d.line, d.severity]), [[7, 'error'], [9, 'error']]);
    assert.equal(diagnostics[0].message, 'No team matches “Reaper”. Use an abbreviation (HH, Reapers, JAGR, HUNG, PVLS), an owner’s first name or a team name.');
    assert.equal(diagnostics[1].message, '“Nick” matches 2 teams: JAGR (Jagrtown Ice Fellas, Nick Brown), PVLS (Paddyville Lucifers, no owner). Use the abbreviation of the one you mean.');
});
