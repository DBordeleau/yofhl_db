import assert from 'node:assert/strict';
import test from 'node:test';
import { parseScript } from './script';
import { compile, frameAt, INTRO_MS, frameSignature } from './timeline';
import { compileAudioCues } from './audio-cues';
import { reactionParticles } from './reactions';

test('reaction cues validate their host, effect and bounded duration', () => {
    for (const cue of ['don happy', 'ron shocked', 'don happy 6s', 'don shocked 800ms']) {
        assert.deepEqual(parseScript(`---\ntitle: Reactions\n---\n[fx: ${cue}]\nDON: Good.`).diagnostics, []);
    }
    for (const cue of ['pat happy', 'don angry', 'don happy 0ms', 'don happy 13s', 'don happy later']) {
        assert.ok(parseScript(`---\ntitle: Reactions\n---\n[fx: ${cue}]\nDON: Good.`).diagnostics.some(d => d.severity === 'error'), cue);
    }
});

test('a shock replaces a happy reaction and ends its twinkle at the same show time', () => {
    const tl = compile(parseScript('[fx: don happy 6s, 1s]\n[fx: don shocked 800ms, 1s]\nDON: Oh no.'));
    const [happy, shocked] = tl.reactions;
    assert.equal(happy.t, INTRO_MS);
    assert.equal(happy.duration, 1000);
    assert.equal(shocked.t, INTRO_MS + 1000);
    assert.equal(frameAt(tl, happy.t + 999).hosts.don.reaction?.effect, 'happy');
    assert.equal(frameAt(tl, shocked.t).hosts.don.reaction?.effect, 'shocked');
    assert.equal(frameAt(tl, shocked.t + 800).hosts.don.reaction, null);
    assert.deepEqual(compileAudioCues(tl).filter(c => c.id === 'happy-twinkle'),
        [{ t: happy.t, id: 'happy-twinkle', followsShow: { duration: 1000 } }]);
});

const head = '---\ntitle: Effects\n---\n';

test('reactions without a duration default to 4.5 s for happy and 800 ms for shocked', () => {
    const tl = compile(parseScript(`${head}[fx: don happy, fx: ron shocked, 6s]\nDON: Good.`));
    assert.deepEqual(tl.reactions.map(r => [r.effect, r.duration]), [['happy', 4500], ['shocked', 800]]);
});

test('the fx: error names every effect', () => {
    const [error] = parseScript(`${head}[fx: don angry]\nDON: Good.`).diagnostics;
    assert.match(error.message, /happy/);
    assert.match(error.message, /shocked/);
    assert.match(error.message, /100ms–12s/);
});

test('a happy reaction brings its twinkle and a shocked one stays silent', () => {
    const tl = compile(parseScript(`${head}[fx: don happy 2s, 3s]\n[fx: ron shocked, 2s]\nDON: Good.`));
    const reactionSounds = compileAudioCues(tl).filter(c => tl.reactions.some(r => r.t === c.t));
    assert.deepEqual(reactionSounds, [{ t: tl.reactions[0].t, id: 'happy-twinkle', followsShow: { duration: 2000 } }]);
});

test('sfx: takes only the authoring sounds, not an effect’s twinkle', () => {
    const script = parseScript(`${head}DON: Good.\n[sfx: happy-twinkle]\n[sfx: desk-pound]\nDON: Again.`);
    assert.deepEqual(script.diagnostics.map(d => [d.line, d.severity]), [[5, 'error']]);
    const [said, list] = script.diagnostics[0].message.split('Use one of:');
    assert.match(said, /isn’t a sound/);
    assert.equal(list.trim(), 'horn, whistle, buzzer, organ, sting, thud, desk-pound.');
});

test('particles restore the exact frame on seek and publish animation through silent holds', () => {
    const tl = compile(parseScript('[fx: don happy 2s, 3s]\nDON: Hello.'));
    const at = (elapsed: number) => frameAt(tl, INTRO_MS + elapsed);
    const particles = reactionParticles(at(500).hosts.don.reaction!);
    assert.deepEqual(reactionParticles(at(500).hosts.don.reaction!), particles);
    assert.notDeepEqual(reactionParticles(at(600).hosts.don.reaction!), particles);
    assert.notEqual(frameSignature(at(500)), frameSignature(at(600)));
    assert.notEqual(frameSignature(at(1990)), frameSignature(at(2000)));
    assert.equal(frameSignature(at(2000)), frameSignature(at(2100)));
    assert.equal(at(500).hosts.ron.reaction, null);
    assert.equal(at(2000).hosts.don.reaction, null);
    assert.ok(particles.every(p => p.opacity >= 0 && p.opacity <= 1));
});
