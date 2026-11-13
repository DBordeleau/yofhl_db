import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundName } from './league';

test('names the last three playoff rounds by their distance from the Final', () => {
    assert.equal(roundName(3, 3), 'Final');
    assert.equal(roundName(2, 3), 'Semifinals');
    assert.equal(roundName(1, 3), 'Quarterfinals');
});

test('falls back to the round number before the Quarterfinals', () => {
    assert.equal(roundName(1, 4), 'Round 1');
    assert.equal(roundName(2, 5), 'Round 2');
});

test('counts back from the final round, so a two-round bracket opens with the Semifinals', () => {
    assert.equal(roundName(1, 2), 'Semifinals');
    assert.equal(roundName(2, 2), 'Final');
});
