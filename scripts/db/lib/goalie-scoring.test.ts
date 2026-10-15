import assert from 'node:assert/strict';
import test from 'node:test';
import audit from '../../../league/playoff-goalie-audit.json';
import { removeExtraGoalieStarts } from './goalie-scoring';
import { findByAbbreviation, loadLeagueConfig } from './league-config';

test('daily goalie reconstruction restores the recorded semifinal winners', () => {
    for (const game of audit.games) {
        const teams = game.teams.map(team => ({ ...team, result: removeExtraGoalieStarts(team.exported, team.starts, game.limit) }));
        teams.forEach(team => assert.equal(team.result.score, team.reconstructed));
        assert.equal(teams.reduce((winner, team) => winner.result.score > team.result.score ? winner : team).franchise, game.winner);
    }
    const varrock2022 = audit.games[0].teams[1];
    assert.equal(varrock2022.starts.length, 5);
    assert.deepEqual(removeExtraGoalieStarts(varrock2022.exported, varrock2022.starts, 4).excluded, [], 'Both starts on the cap day must count');
    const skellige2025 = audit.games.find(game => game.year === 2025)!.teams.find(team => team.franchise === 8)!;
    const excluded = removeExtraGoalieStarts(skellige2025.exported, skellige2025.starts, 4).excluded;
    assert.equal(excluded.length, 2);
    assert(excluded.every(start => start.date === '2025-03-29'));
    assert.equal(excluded.reduce((total, start) => total + start.points, 0), 20);
});

test('only verified reconstructions replace the importer placeholders', () => {
    const config = loadLeagueConfig();
    for (const override of config.scoreOverrides.filter(o => o.verified)) {
        const game = audit.games.find(g => g.year === override.season && g.round === override.round);
        assert.equal(game?.status, 'reconstructed');
        const franchise = findByAbbreviation(config, override.season, override.team)?.franchise.id;
        assert.equal(override.score, game?.teams.find(t => t.franchise === franchise)?.reconstructed);
    }
    assert.equal(config.scoreOverrides.filter(o => o.verified).length, 3);
    assert.equal(config.scoreOverrides.find(o => o.season === 2025)?.verified, true);
});

test('excluded negative starts increase the score; duplicate or invalid input is rejected', () => {
    assert.equal(removeExtraGoalieStarts(100, [
        { date: '2024-03-01', player: 'A', points: 10 },
        { date: '2024-03-02', player: 'B', points: -4 },
    ], 1).score, 104);
    const start = { date: '2024-03-01', player: 'A', points: 10 };
    assert.throws(() => removeExtraGoalieStarts(100, [start, start], 4), /Duplicate/);
    assert.throws(() => removeExtraGoalieStarts(100, [start], 0), /Invalid/);
    assert.throws(() => removeExtraGoalieStarts(NaN, [], 4), /Invalid/);
});
