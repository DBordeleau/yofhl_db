import { CHARACTERS, gestureAction, type CharacterId, type Delivery } from './cast';
import { spokenWords, type Timeline } from './timeline';
import { INTRO_MS } from './transport';
import type { SoundId } from './sound-bank';
import { EFFECTS } from './effects';

export interface VoiceCue {
    who: CharacterId;
    delivery: Delivery;
    /** Maximum voiced portion before the mouth closes, in show milliseconds. */
    duration: number;
    progress: number;
    variation: number;
    question: boolean;
    wordStart: boolean;
    phraseEnd: boolean;
    /** The final syllable of an unfinished line. */
    cutoff: boolean;
    /** First syllable when taking over directly from an unfinished line. */
    interrupting: boolean;
}
export interface AudioCue {
    t: number;
    id: SoundId;
    voice?: VoiceCue;
    /** Play a recorded sound at the show's rate and stop within this many show ms. Without it, a recording plays at its natural rate and length. */
    followsShow?: { duration: number };
}

/** Compile once, not on every frame. The same text produces the same new voice performance. */
export function compileAudioCues(tl: Timeline): AudioCue[] {
    const cues: AudioCue[] = [{ t: 1, id: 'sting' }];
    for (const who of CHARACTERS) {
        const lines = tl.lines.filter(line => line.speaker === who);
        let li = 0, wi = 0;
        // accents and phrase endings follow the words as said, so "2-0" accents "two", "and" and "oh"
        let said = lines.length ? spokenWords(lines[0]) : [];
        for (const [index, flap] of tl.flaps[who].entries()) {
            while (li + 1 < lines.length && lines[li + 1].t0 <= flap[0]) { li++; wi = 0; said = spokenWords(lines[li]); }
            const line = lines[li];
            if (!line) continue;
            while (wi + 1 < said.length && said[wi + 1].t <= flap[0]) wi++;
            const word = said[wi];
            const nextFlap = tl.flaps[who][index + 1];
            const wordEnd = !nextFlap || nextFlap[0] >= word.t + word.dur - 0.01;
            const lineEnd = wordEnd && wi === said.length - 1;
            const previousLine = tl.lines[line.index - 1];
            cues.push({ t: flap[0], id: who, voice: {
                who, delivery: word.delivery, duration: flap[1] - flap[0],
                progress: (flap[0] - line.t0) / Math.max(1, line.t1 - line.t0),
                variation: index, question: /[?][”’"]?$/.test(word.text),
                wordStart: Math.abs(flap[0] - word.t) < 0.01,
                phraseEnd: wordEnd && (word.pause > 0 || lineEnd),
                cutoff: lineEnd && line.cutoff,
                interrupting: Math.abs(flap[0] - line.t0) < 0.01 && !!previousLine?.cutoff
                    && previousLine.speaker !== who && line.t0 - previousLine.t1 < 1,
            } });
        }
    }
    for (const s of tl.sounds) cues.push({ t: s.t, id: s.value });
    for (const r of tl.reactions) {
        const sound = EFFECTS[r.effect].sound;
        if (sound) cues.push({ t: r.t, id: sound.id, ...sound.followsShow && { followsShow: { duration: r.duration } } });
    }
    for (const m of tl.monitor) if (m.t > 0) cues.push({ t: m.t, id: 'monitor' });
    for (const p of tl.punches) if (p.who === 'don') cues.push({ t: p.t, id: 'thud' });
    // Only this physical action gets Foley. Mouth swaps and automatic rest poses stay silent.
    for (const g of tl.gestures.don) if (g.t >= INTRO_MS && gestureAction(g.value) === 'tie') cues.push({ t: g.t, id: 'tie' });
    return cues.sort((a, b) => a.t - b.t);
}

export { audioCuesBetween } from './transport';
