import { CHARACTERS } from './cast';

// How lib/coachs-corner/goldens.test.ts and scripts/coachs-corner/export-goldens.mjs compare a
// golden timeline: as plain JSON, with the art read in host order. Snapshots taken before #43 list
// the art flat; it is now grouped by host, and both shapes read the same.
export const comparableTimeline = (timeline: object) => {
    const plain = JSON.parse(JSON.stringify(timeline));
    return { ...plain, art: Array.isArray(plain.art) ? plain.art : CHARACTERS.flatMap(who => plain.art[who]) };
};
