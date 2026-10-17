import assert from 'node:assert/strict';
import test from 'node:test';
import { PILOT_SCRIPT } from './pilot';
import { pullQuote } from './pull-quote';

test('pull quote prefers the longest all-caps yell that fits a plate', () => {
    assert.deepEqual(pullQuote(PILOT_SCRIPT), { who: 'don', text: 'I KNOW IT’S A KEEPER LEAGUE, RON.' });
});

test('pull quote falls back to a mixed-case yell, then a short first line', () => {
    assert.deepEqual(pullQuote('---\ntitle: T\n---\nRON: Morning.\n\nDON: !!Well, get going then!!\n'), { who: 'don', text: 'Well, get going then' });
    assert.deepEqual(pullQuote('---\ntitle: T\n---\nRON: The draft was Saturday, Don.\n'), { who: 'ron', text: 'The draft was Saturday, Don.' });
});
