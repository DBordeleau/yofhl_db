import assert from 'node:assert/strict';
import test from 'node:test';
import { GRAPHIC_TYPES, parseGraphic, parseScript } from './script';
import { FLASHBACK_EXAMPLE, FX_REFERENCE, GRAPHIC_REFERENCE, LAPEL_REFERENCE } from './script-reference';

const head = '---\ntitle: Reference\n---\n';

test('the fx: reference lists every effect at its default length, each one a cue the parser accepts', () => {
    assert.deepEqual(FX_REFERENCE.map(e => [e.effect, e.length]), [['happy', '4.5s'], ['shocked', '800ms']]);
    for (const { example } of FX_REFERENCE) {
        assert.deepEqual(parseScript(`${head}[${example}]\nDON: Good.`).diagnostics, [], example);
    }
});

test('the lapel reference offers every lapel the front matter accepts', () => {
    assert.deepEqual(LAPEL_REFERENCE, ['poppy']);
    for (const lapel of LAPEL_REFERENCE) {
        assert.deepEqual(parseScript(`---\ntitle: Reference\nlapel: ${lapel}\n---\nDON: Good.`).diagnostics, [], lapel);
    }
});

test('the monitor reference gives a working example of every graphic the parser accepts, final scores included', () => {
    const parsed = GRAPHIC_REFERENCE.map(example => {
        const { graphic, error } = parseGraphic(example);
        assert.equal(error, undefined, example);
        return graphic!;
    });
    assert.deepEqual([...new Set(parsed.map(g => g.type))].sort(), [...GRAPHIC_TYPES].sort());
    assert.ok(parsed.some(g => g.type === 'matchup' && g.status === 'final'));
});

test('the flashback example parses cleanly in an episode a few weeks later', () => {
    assert.deepEqual(parseScript(`---
title: Reference
season: 2027
week: 6
---
DON: Now.

${FLASHBACK_EXAMPLE}

RON: Back.`).diagnostics, []);
});
