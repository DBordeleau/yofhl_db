import assert from 'node:assert/strict';
import test from 'node:test';
import { awardFromSlug, awardHref } from './awards';

test('a canonical award name keeps its existing URL', () => {
    assert.equal(awardHref('Wayne Gretzky Award'), '/awards/Wayne_Gretzky_Award');
    assert.equal(awardHref("Prime Minister's Trophy"), "/awards/Prime_Minister's_Trophy");
});

test('an alias links to the canonical award page', () => {
    assert.equal(awardHref('Hasek Award'), '/awards/Hasek_Trophy');
});

test('an unknown award name is URL-encoded', () => {
    assert.equal(awardHref('Rookie & Sophomore #1'), '/awards/Rookie_%26_Sophomore_%231');
});

test('a decoded href segment parses back to the award name', () => {
    const segment = decodeURIComponent(awardHref('Rookie & Sophomore #1').split('/').pop()!);
    assert.equal(awardFromSlug(segment), 'Rookie & Sophomore #1');
});
