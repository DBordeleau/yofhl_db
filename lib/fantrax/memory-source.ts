// The in-memory live season source, for tests. `fantrax` is what Fantrax would return right now and `saved` is
// the saved snapshot; `down` lists the Fantrax requests that are failing.
import type { FantraxTeamRow, FranchiseIdentity, LiveSeasonSource, RosterStats, SourceCore, SourceLeaders, WeekScores } from './live-season-source';

interface MemoryCapture {
    core: SourceCore;
    scores: Record<number, WeekScores>;
    leaders: SourceLeaders;
    rosterStats: RosterStats;
}

export interface MemoryState {
    fantraxTeams: FantraxTeamRow[];
    franchises: FranchiseIdentity[];
    archivedPlayerIds: string[];
    fantrax: MemoryCapture;
    saved: MemoryCapture | null;
    /** by season year */
    manualFinalWeeks: Record<number, number[]>;
    down: Set<'core' | 'scores' | 'leaders' | 'rosterStats'>;
}

export function createMemorySource(state: MemoryState): LiveSeasonSource {
    const fantrax = (request: 'core' | 'scores' | 'leaders' | 'rosterStats') => {
        if (state.down.has(request)) throw new Error(`Fantrax ${request} is down`);
        return state.fantrax;
    };
    const savedFor = (seasonYear: number) => state.saved?.core.seasonYear === seasonYear ? state.saved : null;
    return {
        fantraxTeams: async () => structuredClone(state.fantraxTeams),
        franchises: async () => structuredClone(state.franchises),
        archivedPlayerIds: async () => [...state.archivedPlayerIds],
        core: async ({ fresh }) => structuredClone(!fresh && state.saved ? state.saved.core : fantrax('core').core),
        weekScores: async week => {
            const scores = state.saved?.scores[week.number] ?? fantrax('scores').scores[week.number];
            if (!scores) throw new Error(`Fantrax has no scores for week ${week.number}`);
            return structuredClone(scores);
        },
        scoringLeaders: async ({ seasonYear }) => structuredClone(savedFor(seasonYear)?.leaders ?? fantrax('leaders').leaders),
        rosterStats: async ({ seasonYear }) => structuredClone(savedFor(seasonYear)?.rosterStats ?? fantrax('rosterStats').rosterStats),
        manualFinalWeeks: async seasonYear => [...state.manualFinalWeeks[seasonYear] ?? []],
        setManualFinalWeek: async (seasonYear, week, final) => {
            const weeks = new Set(state.manualFinalWeeks[seasonYear] ?? []);
            if (final) weeks.add(week); else weeks.delete(week);
            state.manualFinalWeeks[seasonYear] = [...weeks].sort((a, b) => a - b);
        },
        capture: async () => {
            for (const request of ['core', 'scores', 'leaders', 'rosterStats'] as const) fantrax(request);
            state.saved = structuredClone(state.fantrax);
            return structuredClone(state.saved.core);
        },
    };
}
