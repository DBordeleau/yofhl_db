import { mediaUrl } from './media';
import type { CharacterId, Sound } from './cast';

export type SoundId = CharacterId | 'room' | 'tie' | 'monitor' | Sound;
export type SynthId = 'classic-don' | 'classic-ron' | 'robot-don' | 'robot-ron' | 'studio-room' | 'tie-rustle' | 'monitor' | Exclude<Sound, 'desk-pound'>;
export type SoundSource = { synth: SynthId } | { files: readonly string[] };
export interface SoundSlot { source: SoundSource; gain: number }
export type SoundBank = Record<SoundId, SoundSlot>;

/** Replace a source with { files: [mediaUrl('/coachs-corner/audio/my-sound.wav')] }
 * and run npm run coachs:assets to create its immutable URL.
 * Multiple files rotate deterministically. Gains are linear; 0 mutes that sound.
 * Voice files are short syllables; room files loop. See docs/coachs-corner.md.
 */
export const CLASSIC_SOUND_BANK: SoundBank = {
    don: { source: { synth: 'classic-don' }, gain: 1 },
    ron: { source: { synth: 'classic-ron' }, gain: 1 },
    room: { source: { synth: 'studio-room' }, gain: 0 },
    tie: { source: { synth: 'tie-rustle' }, gain: 0 },
    monitor: { source: { synth: 'monitor' }, gain: 1 },
    horn: { source: { synth: 'horn' }, gain: 1 },
    whistle: { source: { synth: 'whistle' }, gain: 1 },
    buzzer: { source: { synth: 'buzzer' }, gain: 1 },
    organ: { source: { synth: 'organ' }, gain: 1 },
    sting: { source: { synth: 'sting' }, gain: 1 },
    thud: { source: { synth: 'thud' }, gain: 1 },
    'desk-pound': { source: { files: [mediaUrl('/coachs-corner/audio/desk-pound.wav')] }, gain: 0.8 },
};

/** Approved studio mix, shared by episodes and the sound-check baseline. */
export const STUDIO_SOUND_BANK: SoundBank = {
    ...CLASSIC_SOUND_BANK,
    don: { source: { synth: 'robot-don' }, gain: 1.2 },
    ron: { source: { synth: 'robot-ron' }, gain: 2 },
    room: { source: { synth: 'studio-room' }, gain: 0.45 },
    tie: { source: { files: [mediaUrl('/coachs-corner/audio/tie-cloth-7.wav')] }, gain: 1 },
};

/** Every episode uses this mix: robot hosts, quiet room, cloth 7, original TV cue. */
export const CURRENT_SOUND_BANK = STUDIO_SOUND_BANK;

/** Sound design controls, kept apart from scheduling and Web Audio plumbing. */
export const ROBOT_VOICES = {
    // Don has a chesty buzz with softened attacks. Ron has a rounder,
    // understated tone and a much narrower pitch range, including when he cuts in.
    don: { wave: 'sawtooth', base: 112, duration: 0.12, attack: 0.0055, peak: 0.052, grit: 0.0045, brightness: 1900, formantGain: 3.5, pitchRange: 0.045, vowels: [[640, 1150], [430, 1050], [740, 1450], [350, 1650]] },
    ron: { wave: 'triangle', base: 196, duration: 0.085, attack: 0.006, peak: 0.055, grit: 0.0012, brightness: 2700, formantGain: 3, pitchRange: 0.018, vowels: [[440, 1800], [360, 2100], [550, 1500], [390, 1250]] },
} as const;

// Multipliers on each host's voice. Delivery changes colour and articulation as
// well as loudness; a yell should not just be the normal voice turned up.
export const ROBOT_DELIVERIES = {
    normal: { duration: 1, attack: 1, body: 0.32, brightness: 1, grit: 1, range: 1 },
    yell: { duration: 1.12, attack: 0.65, body: 0.48, brightness: 1.55, grit: 2.6, range: 1.8 },
    sneak: { duration: 0.7, attack: 1.2, body: 0.22, brightness: 0.7, grit: 0.5, range: 0.5 },
    deadpan: { duration: 0.82, attack: 1, body: 0.22, brightness: 0.8, grit: 0.45, range: 0.2 },
    firm: { duration: 0.92, attack: 0.75, body: 0.37, brightness: 1.12, grit: 1.25, range: 0.65 },
    mock: { duration: 1.06, attack: 1, body: 0.3, brightness: 1.15, grit: 0.9, range: 1.4 },
    warm: { duration: 1, attack: 1.3, body: 0.38, brightness: 0.8, grit: 0.55, range: 0.6 },
} as const;

/** Don keeps the clearer cadence, with a fuller vowel body and less abrasive shout. */
export const DON_DELIVERY_TUNING = { bodyLift: 0.16, yell: { brightness: 1.2, grit: 1.5, range: 1.2 } };

export const STUDIO_ROOM = { noiseGain: 0.014, lowpass: 680, highpass: 95, humGain: 0.0012, fadeSeconds: 0.35 };
// Uneven swishes for grasp, pull and release. No pitched mechanical layer.
export const TIE_RUSTLE = { clothGain: 0.055, strokes: [
    { offset: 0, duration: 0.14, attack: 0.025, band: 1250, gain: 0.55 },
    { offset: 0.075, duration: 0.22, attack: 0.045, band: 2100, gain: 1 },
    { offset: 0.245, duration: 0.13, attack: 0.02, band: 1600, gain: 0.35 },
] };

export function sourceKey(source: SoundSource): string {
    return 'synth' in source ? source.synth : JSON.stringify(source.files);
}
