import assert from 'node:assert/strict';
import test from 'node:test';
import { gamesPlayedByPlayer } from '@/lib/season-sync/games-played';
import { GAMES_PLAYED_HISTORY, matchGamesPlayed, readGamesPlayedHistory } from './games-played';

// The games-played export's match of a season's exported player seasons to Fantrax's skater and goalie tables,
// merged by the rule the season sync uses.

const SKATERS = [
    { id: 'skater', gamesPlayed: 82, categories: null },
    { id: 'scoreless', gamesPlayed: 6, categories: null },
    { id: 'benched', gamesPlayed: 0, categories: null },
    { id: 'elsewhere', gamesPlayed: 70, categories: null }, // not in the league's export
];
const GOALIES = [{ id: 'goalie', gamesPlayed: 40 }];
const TABLES = gamesPlayedByPlayer(SKATERS, GOALIES);

test("the export keeps each exported player season's games played, negative and zero totals included, and leaves out one with none", () => {
    const archive = [
        { id: 'skater', fpts: 300 },
        { id: 'goalie', fpts: -12.5 },
        { id: 'scoreless', fpts: 0 },
        { id: 'benched', fpts: 0 },
        { id: 'unlisted', fpts: 0 },
    ];
    assert.deepEqual(matchGamesPlayed(2026, archive, TABLES), [
        { id: 'skater', year: 2026, gamesPlayed: 82 },
        { id: 'goalie', year: 2026, gamesPlayed: 40 },
        { id: 'scoreless', year: 2026, gamesPlayed: 6 },
    ]);
});

test('the export fails when a player season with FPts has no games played in either table', () => {
    assert.throws(() => matchGamesPlayed(2026, [{ id: 'skater', fpts: 300 }, { id: 'missing', fpts: 4 }], TABLES), /1 player seasons with FPts in 2025–26 have no games played in Fantrax's tables: missing/);
    assert.throws(() => matchGamesPlayed(2026, [{ id: 'benched', fpts: -1 }], TABLES), /benched/, 'zero games played is none');
});

test('a player eligible as a skater and a goalie is in both tables with the same games played, and different counts are refused', () => {
    const both = (goalieGames: number) => gamesPlayedByPlayer([{ id: 'both', gamesPlayed: 3, categories: null }], [{ id: 'both', gamesPlayed: goalieGames }]);
    assert.deepEqual(matchGamesPlayed(2026, [{ id: 'both', fpts: 5 }], both(3)), [{ id: 'both', year: 2026, gamesPlayed: 3 }]);
    assert.throws(() => both(1), /player both with 3 games played in its skater table and 1 in its goalie table/);
});

test('the checked-in history covers 2018–19 through 2025–26 with one positive games played per player season', () => {
    const history = readGamesPlayedHistory(GAMES_PLAYED_HISTORY);
    assert.deepEqual(history.coverage.map((season) => season.year), [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    assert.ok(history.coverage.every((season) => season.players > 700), 'every season has its skaters and goalies');
    assert.ok(history.players.every((row) => row.gamesPlayed <= 90), 'no one plays much more than a season, trades included');
});
