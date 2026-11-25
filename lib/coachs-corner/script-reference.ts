import { CHARACTERS, LAPELS, type Lapel } from './cast';
import { EFFECTS, scriptLength, type Reaction } from './effects';

// The editor's Script reference, as data. Lists that have a registry (effects, lapels, monitor
// graphics) are derived from it, so a new entry shows up here with no edit to this file.

export interface FxReference {
    effect: Reaction;
    /** the default length, as a script writes it */
    length: string;
    /** a stage-line cue at the default length */
    example: string;
}

/** one entry per effect in the registry, taking turns between the hosts */
export const FX_REFERENCE: FxReference[] = (Object.keys(EFFECTS) as Reaction[]).map((effect, i) => ({
    effect,
    length: scriptLength(EFFECTS[effect].defaultMs),
    example: `fx: ${CHARACTERS[i % CHARACTERS.length]} ${effect}`,
}));

/** every lapel the lapel list holds */
export const LAPEL_REFERENCE: readonly Lapel[] = LAPELS;
