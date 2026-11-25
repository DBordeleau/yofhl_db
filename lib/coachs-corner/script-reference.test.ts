import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGraphic, parseScript } from './script';
import { FX_REFERENCE, LAPEL_REFERENCE } from './script-reference';

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
