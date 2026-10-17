import assert from 'node:assert/strict';
import test from 'node:test';
import { compileAudioCues, type VoiceCue } from './audio-cues';
import { AUDIO_PREVIEW_SCRIPT } from './audio-preview';
import { PILOT_SCRIPT } from './pilot';
import { parseScript } from './script';
import { compile } from './timeline';
import { robotSyllable } from './robot-voice';

const voice: VoiceCue = { who: 'don', delivery: 'normal', duration: 120, progress: 0.5, variation: 0,
    question: false, wordStart: true, phraseEnd: false, cutoff: false, interrupting: false };

test('preview and full pilot syllables leave quiet gaps and ordered envelopes at every supported speed', () => {
    const cues = [AUDIO_PREVIEW_SCRIPT, PILOT_SCRIPT].flatMap(script => compileAudioCues(compile(parseScript(script))));
    for (const cue of cues) {
        if (!cue.voice) continue;
        for (const rate of [0.75, 1, 1.25, 1.5, 2]) {
            const syllable = robotSyllable(cue.voice, rate);
            assert.ok(syllable.attack > 0 && syllable.attack < syllable.bodyAt);
            assert.ok(syllable.bodyAt < syllable.releaseAt && syllable.releaseAt < syllable.length);
            assert.ok(syllable.length < cue.voice.duration / 1000 / rate);
            assert.ok(syllable.pitch.every(pitch => Number.isFinite(pitch) && pitch > 0));
        }
    }
});

test('hosts have distinct timbres and Don has a stronger emotional and word-accent contrast', () => {
    const don = robotSyllable(voice, 1);
    const ron = robotSyllable({ ...voice, who: 'ron' }, 1);
    const yell = robotSyllable({ ...voice, delivery: 'yell' }, 1);
    const deadpan = robotSyllable({ ...voice, delivery: 'deadpan' }, 1);
    assert.notEqual(don.wave, ron.wave);
    assert.ok(don.pitch[0] < ron.pitch[0] && don.grit > ron.grit);
    assert.ok(don.attack < ron.attack);
    assert.ok(yell.peak > don.peak * 1.5 && yell.brightness > don.brightness && yell.grit > don.grit);
    assert.ok(deadpan.peak < don.peak && deadpan.grit < don.grit);
    assert.ok(robotSyllable({ ...voice, wordStart: false }, 1).peak < don.peak);
    assert.ok(robotSyllable({ ...voice, interrupting: true }, 1).peak > don.peak);
    assert.equal(robotSyllable({ ...voice, who: 'ron', interrupting: true }, 1).peak, ron.peak);
});

test('unfinished lines stay suspended, questions rise, and completed statements fall', () => {
    const statement = robotSyllable({ ...voice, phraseEnd: true }, 1);
    const question = robotSyllable({ ...voice, phraseEnd: true, question: true }, 1);
    const cutoff = robotSyllable({ ...voice, phraseEnd: true, cutoff: true }, 1);
    assert.ok(statement.pitch[2] < statement.pitch[0]);
    assert.ok(question.pitch[2] > question.pitch[0]);
    assert.ok(cutoff.pitch[2] >= cutoff.pitch[0]);
    assert.ok(cutoff.length - cutoff.releaseAt < statement.length - statement.releaseAt);
    assert.deepEqual(robotSyllable(voice, 1), robotSyllable(voice, 1));
});
