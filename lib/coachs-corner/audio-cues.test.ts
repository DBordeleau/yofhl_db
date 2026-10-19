import assert from 'node:assert/strict';
import test from 'node:test';
import { AUDIO_PREVIEW_SCRIPT } from './audio-preview';
import { audioCuesBetween, compileAudioCues } from './audio-cues';
import { parseScript } from './script';
import { compile, frameAt } from './timeline';
import { frameSignature } from '../../components/coachs-corner/use-show';

test('a desk-pound is one explicit contact cue during a silent pose, with no sound on seek', () => {
    const script = parseScript('---\ntitle: Desk contact\n---\nRON (deadpan): You did.\n[don: pound-ready, 220ms]\n[don: pound, sfx: desk-pound, 480ms]\nDON (point): I looked at the rest!');
    assert.deepEqual(script.diagnostics, []);
    const tl = compile(script);
    const cues = compileAudioCues(tl);
    const knocks = cues.filter(cue => cue.id === 'desk-pound');
    assert.equal(knocks.length, 1);
    const contact = knocks[0].t;
    assert.equal(frameAt(tl, contact - 1).hosts.don.gesture, 'pound-ready');
    assert.equal(frameAt(tl, contact - 1).hosts.don.open, false);
    assert.equal(frameAt(tl, contact).hosts.don.gestureMs, 0);
    assert.equal(frameAt(tl, contact + 90).hosts.don.gestureMs, 90);
    assert.equal(frameAt(tl, contact - 100).hosts.don.gestureMs, 120, 'backward seeks restore the anticipation');
    const signatureAt = (ms: number) => frameSignature(frameAt(tl, contact + ms));
    assert.notEqual(signatureAt(0), signatureAt(80), 'live playback publishes the silent settle');
    assert.notEqual(signatureAt(144), signatureAt(160), 'the last update removes the impact marks');
    assert.equal(signatureAt(160), signatureAt(170), 'the settled hold returns to sparse updates');
    assert.equal(frameAt(tl, contact + 300).hosts.don.gesture, 'pound');
    assert.equal(frameAt(tl, contact + 300).hosts.don.open, false);
    assert.equal(tl.lines[1].t0 - contact, 480);
    assert.equal(tl.lines[1].t0 - tl.lines[0].end, 700);
    assert.equal(frameAt(tl, tl.lines[1].t0).hosts.don.gesture, 'point');
    assert.equal(cues.filter(cue => cue.id === 'thud').length, 0);
    assert.deepEqual(audioCuesBetween(cues, contact, contact, 1), []);
    assert.deepEqual(audioCuesBetween(cues, contact + 500, contact - 500, 1), []);
    assert.equal(audioCuesBetween(cues, contact - 1, contact, 1).filter(cue => cue.id === 'desk-pound').length, 1);
});

test('the short comparison includes both speakers, a yell and one timed tie adjustment', () => {
    const script = parseScript(AUDIO_PREVIEW_SCRIPT);
    assert.deepEqual(script.diagnostics, []);
    const tl = compile(script);
    assert.ok(tl.showEnd > 30000 && tl.showEnd < 45000);
    const cues = compileAudioCues(tl);
    for (const who of ['don', 'ron'] as const) {
        const voice = cues.filter(cue => cue.id === who);
        assert.equal(voice.length, tl.flaps[who].length);
        assert.ok(voice.every(cue => cue.voice && cue.voice.duration > 0));
    }
    assert.ok(cues.some(cue => cue.voice?.delivery === 'yell'));
    const ties = cues.filter(cue => cue.id === 'tie');
    assert.equal(ties.length, 1);
    assert.equal(ties[0].t, tl.gestures.don.find(cue => cue.value === 'tie')!.t);
    assert.deepEqual(compileAudioCues(tl), cues);
});

test('dispatch excludes the prior boundary and drops stale events after a stalled frame', () => {
    const cues = [10, 20, 900, 990, 1000].map(t => ({ t, id: 'monitor' as const }));
    assert.deepEqual(audioCuesBetween(cues, 10, 20, 1).map(cue => cue.t), [20]);
    assert.deepEqual(audioCuesBetween(cues, 20, 1000, 1).map(cue => cue.t), [900, 990, 1000]);
    assert.deepEqual(audioCuesBetween(cues, 1000, 20, 1), []);
});

test('a tie present before playback is silent, and automatic rest poses have no Foley', () => {
    const tl = compile(parseScript('[don: tie]\nDON: Hello.\nRON (deadpan): No.'));
    const cues = compileAudioCues(tl);
    assert.ok(tl.gestures.don.some(cue => cue.value === 'tie'));
    assert.equal(cues.filter(cue => cue.id === 'tie').length, 0);
});

test('word accents, phrase endings and interruptions follow the script, including real pauses', () => {
    const tl = compile(parseScript('RON: Saturday, really?\nDON: I thought--\nRON: No.\nDON: But--\n[1s]\nRON: Anyway.'));
    const voices = compileAudioCues(tl).filter(cue => cue.voice);
    for (const line of tl.lines) {
        const spoken = voices.filter(cue => cue.id === line.speaker && cue.t >= line.t0 && cue.t < line.t1);
        assert.equal(spoken.filter(cue => cue.voice!.wordStart).length, line.words.length);
        assert.equal(spoken.at(-1)!.voice!.cutoff, line.cutoff);
    }
    const firstLine = voices.filter(cue => cue.t < tl.lines[0].t1);
    assert.equal(firstLine.filter(cue => cue.voice!.phraseEnd).length, 2);
    assert.equal(firstLine.find(cue => cue.voice!.phraseEnd)!.voice!.question, false);
    assert.equal(firstLine.at(-1)!.voice!.question, true);
    assert.equal(voices.find(cue => cue.t === tl.lines[2].t0)!.voice!.interrupting, true);
    assert.equal(voices.find(cue => cue.t === tl.lines[4].t0)!.voice!.interrupting, false);
});
