import assert from 'node:assert/strict';
import test from 'node:test';
import { GAMES_PLAYED_HISTORY, matchGamesPlayed, readGamesPlayedHistory } from './games-played';

// The games-played export's match of a season's exported player seasons to Fantrax's skater and goalie tables.

const TABLES = [
    { id: 'skater', gamesPlayed: 82 },
    { id: 'goalie', gamesPlayed: 40 },
    { id: 'scoreless', gamesPlayed: 6 },
    { id: 'benched', gamesPlayed: 0 },
    { id: 'elsewhere', gamesPlayed: 70 }, // not in the league's export
];

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
    assert.throws(() => matchGamesPlayed(2026, [], [...TABLES, { id: 'skater', gamesPlayed: 1 }]), /player skater with 82 and 1 games played/);
});

test("a player eligible as a skater and a goalie, in both tables with the same games played, is matched once", () => {
    assert.deepEqual(matchGamesPlayed(2026, [{ id: 'both', fpts: 5 }], [{ id: 'both', gamesPlayed: 3 }, { id: 'both', gamesPlayed: 3 }]),
        [{ id: 'both', year: 2026, gamesPlayed: 3 }]);
});

test('the checked-in history covers 2018–19 through 2025–26 with one positive games played per player season', () => {
    const history = readGamesPlayedHistory(GAMES_PLAYED_HISTORY);
    assert.deepEqual(history.coverage.map((season) => season.year), [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    assert.ok(history.coverage.every((season) => season.players > 700), 'every season has its skaters and goalies');
    assert.ok(history.players.every((row) => row.gamesPlayed <= 90), 'no one plays much more than a season, trades included');
});
