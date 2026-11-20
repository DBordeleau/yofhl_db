import assert from 'node:assert/strict';
import test from 'node:test';
import { AWARD_CATALOGUE, awardFromSlug, awardHref, awardSlug, findAward } from './awards';

test('an award is found by its ID, name or label', () => {
    assert.equal(findAward('hasek')?.id, 'hasek');
    assert.equal(findAward('Teemu Trophy')?.id, 'teemu-selanne');
    assert.equal(findAward('Teemu Selanne Trophy')?.id, 'teemu-selanne');
});

test('finding an award ignores case and accents', () => {
    assert.equal(findAward('HASEK TROPHY')?.id, 'hasek');
    assert.equal(findAward('Hašek Trophy')?.id, 'hasek');
    assert.equal(findAward('Prime Minister’s Trophy')?.id, 'prime-minister');
});

test('an award is found by its URL slug', () => {
    assert.equal(findAward('Wayne_Gretzky_Award')?.id, 'wayne-gretzky');
    assert.equal(findAward("Prime_Minister%27s_Trophy")?.id, 'prime-minister');
});

test('the old Hasek and Danny Briere labels no longer find an award', () => {
    assert.equal(findAward('Hasek Award'), undefined);
    assert.equal(findAward('Danny Briere Trophy'), undefined);
    assert.equal(awardHref('Hasek Award'), '/awards/Hasek_Award');
});

test('the Hasek and Danny Briere awards show their names as labels', () => {
    assert.equal(findAward('hasek')?.label, 'Hasek Trophy');
    assert.equal(findAward('danny-briere')?.label, 'Danny Briere Award');
});

test('every award round-trips through its slug and link', () => {
    for (const award of AWARD_CATALOGUE) {
        assert.equal(awardFromSlug(awardSlug(award.name)), award.name);
        const segment = awardHref(award.label).split('/').pop()!;
        assert.equal(findAward(segment)?.id, award.id);
        assert.equal(awardFromSlug(segment), award.name);
    }
});

test('a canonical award name keeps its existing URL', () => {
    assert.equal(awardHref('Wayne Gretzky Award'), '/awards/Wayne_Gretzky_Award');
    assert.equal(awardHref("Prime Minister's Trophy"), "/awards/Prime_Minister's_Trophy");
});

test('an unknown award name is URL-encoded', () => {
    assert.equal(awardHref('Rookie & Sophomore #1'), '/awards/Rookie_%26_Sophomore_%231');
});

test('a decoded href segment parses back to the award name', () => {
    const segment = decodeURIComponent(awardHref('Rookie & Sophomore #1').split('/').pop()!);
    assert.equal(awardFromSlug(segment), 'Rookie & Sophomore #1');
});
