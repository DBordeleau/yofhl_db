import assert from 'node:assert/strict';
import test from 'node:test';
import { AUDIO_PREVIEW_SCRIPT } from './audio-preview';
import { audioCuesBetween, compileAudioCues } from './audio-cues';
import { parseScript } from './script';
import { compile } from './timeline';

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
