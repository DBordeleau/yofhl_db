import { DELIVERIES, type CharacterId } from './cast';
import type { VoiceCue } from './audio-cues';
import { DON_DELIVERY_TUNING, ROBOT_DELIVERIES, ROBOT_VOICES } from './sound-bank';

/** One articulated syllable. All times are seconds, relative to its onset.
 * Keep the quiet portion of every mouth flap, even at faster playback rates.
 * No reverb or release crosses a scripted pause or interruption.
 */
export function robotSyllable(voice: VoiceCue, rate: number, who: CharacterId = voice.who) {
    const spec = ROBOT_VOICES[who];
    const delivery = who === 'don' && voice.delivery === 'yell'
        ? { ...ROBOT_DELIVERIES.yell, ...DON_DELIVERY_TUNING.yell }
        : ROBOT_DELIVERIES[voice.delivery];
    const style = DELIVERIES[voice.delivery];
    const pattern = [0.65, -0.35, 0.15, -0.8, 0.45, -0.1, 0.9];
    const swing = pattern[voice.variation % pattern.length] * spec.pitchRange * delivery.range;
    const contour = voice.delivery === 'deadpan' ? 1 : 1.035 - voice.progress * 0.07;
    const pitch = spec.base * style.pitch * contour * (1 + swing);
    const accent = voice.wordStart ? (who === 'don' ? 1.08 : 1.04) : who === 'don' ? 0.92 : 0.88;
    const entrance = voice.interrupting && who === 'don' ? 1.08 : 1;
    const length = Math.min(spec.duration * delivery.duration, voice.duration / 1000 * 0.86) / rate;
    const attack = Math.min(spec.attack * delivery.attack / rate, length * 0.15);
    // An unfinished thought stays suspended; it does not receive a sentence-ending fall.
    const ending = voice.cutoff ? 1.02 : voice.phraseEnd && voice.question ? 1.1
        : voice.delivery === 'mock' ? 1.08 : voice.phraseEnd ? (who === 'don' ? 0.91 : 0.96)
        : who === 'don' ? 0.97 : 0.99;
    const bark = voice.delivery === 'yell' && who === 'don';
    return {
        wave: spec.wave, length, attack,
        peak: spec.peak * style.volume * accent * entrance,
        body: who === 'don' ? Math.min(0.6, delivery.body + DON_DELIVERY_TUNING.bodyLift) : delivery.body,
        bodyAt: length * 0.34,
        // A short clipped tail makes the abandoned thought audibly different.
        releaseAt: length * (voice.cutoff ? 0.86 : 0.52),
        pitch: [pitch * (bark ? 1.035 : 1), pitch * (bark ? 0.99 : 1), pitch * ending] as const,
        brightness: spec.brightness * delivery.brightness,
        vowels: spec.vowels[voice.variation % spec.vowels.length],
        formantGain: spec.formantGain,
        grit: spec.grit * delivery.grit * style.volume * accent,
        gritBand: who === 'don' ? 1050 : 2100,
    };
}
