import type { CharacterId, Reaction } from './cast';
import { EFFECTS } from './effects';
import { HEAD, type Particle } from './particles';
import type { ReactionFrame } from './timeline';

export type { Particle, ParticleKind } from './particles';

/** Ron sits on the other side of the monitor, so his marks mirror Don's. */
const mirror = (p: Particle): Particle => ({ ...p, x: 2 * HEAD.x - p.x, rotation: p.kind === 'ray' ? 180 - p.rotation : -p.rotation });
const forHost = (particles: Particle[], who: CharacterId) => who === 'ron' ? particles.map(mirror) : particles;

export function reactionParticles(frame: ReactionFrame, who: CharacterId = 'don'): Particle[] {
    return forHost(EFFECTS[frame.effect].particles(frame), who);
}

/** The fixed marks shown instead when the viewer prefers reduced motion. */
export function reactionStill(effect: Reaction, who: CharacterId = 'don'): Particle[] {
    return forHost(EFFECTS[effect].still(), who);
}
