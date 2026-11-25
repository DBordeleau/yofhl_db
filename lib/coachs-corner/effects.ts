import { happyParticles, happyStill, shockedParticles, shockedStill, type Particle } from './particles';
import type { ReactionFrame } from './timeline';

// The effect registry: everything an fx: reaction is, in one entry. The script parser, the audio
// cues and the reaction particles all read from here, and the reaction names come from its keys. A
// new effect is one entry below plus its particle drawing (particles.ts); `satisfies` refuses an
// entry missing its default, its sound decision or its particles.

/** recorded sounds that belong to an effect; scripts can't name them in sfx: */
export const EFFECT_SOUNDS = ['happy-twinkle'] as const;
export type EffectSound = typeof EFFECT_SOUNDS[number];

export interface EffectSoundRule {
    id: EffectSound;
    /** play at the show's rate and stop by the reaction's end, not at the recording's own rate and length */
    followsShow: boolean;
}

export interface Effect {
    /** length when a script names none, in show ms */
    defaultMs: number;
    sound: EffectSoundRule | null;
    /** the moving particles, drawn from Don's seat */
    particles: (frame: ReactionFrame) => Particle[];
    /** the fixed marks for reduced motion */
    still: () => Particle[];
}

export const EFFECTS = {
    happy: {
        defaultMs: 4500,
        sound: { id: 'happy-twinkle', followsShow: true },
        particles: happyParticles,
        still: happyStill,
    },
    shocked: {
        defaultMs: 800,
        sound: null,
        particles: shockedParticles,
        still: shockedStill,
    },
} satisfies Record<string, Effect>;

export type Reaction = keyof typeof EFFECTS;
