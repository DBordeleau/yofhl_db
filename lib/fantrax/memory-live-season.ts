// The live season on the in-memory source, for tests outside the live season module. It has the same operations
// as the production binding in live-season.ts; `now` is the module's own clock, which getWeekScores and
// setWeekFinal read. Only test files and test harnesses may import it (see .eslintrc.js).
import { createLiveSeason } from './assemble-live-season';
import { createMemorySource, type MemoryState } from './memory-source';

export type { MemoryState } from './memory-source';
export type { SourceCore, SourceWeek } from './live-season-source';

export const createMemoryLiveSeason = (state: MemoryState, options: { now?: () => number } = {}) =>
    createLiveSeason(createMemorySource(state), options);
