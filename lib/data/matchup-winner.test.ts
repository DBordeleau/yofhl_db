import assert from 'node:assert/strict';
import test from 'node:test';
import { matchupWinner } from './matchup-winner';

test('the winner follows the score unless overridden', () => {
    assert.equal(matchupWinner({ id: 7, score: 301.5 }, { id: 9, score: 288 }), 7, 'away wins');
    assert.equal(matchupWinner({ id: 7, score: 250 }, { id: 9, score: 250.25 }), 9, 'home wins');
    assert.equal(matchupWinner({ id: 7, score: 240 }, { id: 9, score: 240 }), null, 'a tie has no winner');
    assert.equal(matchupWinner({ id: 7, score: 301.5 }, { id: 9, score: 288 }, 9), 9, 'an override beats the score');
    assert.equal(matchupWinner({ id: 7, score: 240 }, { id: 9, score: 240 }, 7), 7, 'an override settles a tie');
    assert.equal(matchupWinner({ id: 7, score: 301.5 }, { id: 9, score: 288 }, null), 7, 'no override follows the score');
});
