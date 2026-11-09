import { CHARACTERS } from './cast';

// How lib/coachs-corner/goldens.test.ts and scripts/coachs-corner/export-goldens.mjs compare a
// golden timeline: as plain JSON, with the art read in host order. Older snapshots list the
// art flat, from before it was grouped by host; both shapes read the same.
export const comparableTimeline = (timeline: object) => {
    const plain = JSON.parse(JSON.stringify(timeline));
    return { ...plain, art: Array.isArray(plain.art) ? plain.art : CHARACTERS.flatMap(who => plain.art[who]) };
};
