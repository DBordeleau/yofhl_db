export const FANTRAX_TAG = 'fantrax-public';
export const FANTRAX_CURRENT_TAG = 'fantrax-current-season';
export const finalWeeksTag = (seasonYear: number) => `fantrax-final-weeks:${seasonYear}`;
export const DAY = 86400;
export const CORRECTION_WINDOW_MS = 7 * DAY * 1000;

export function scoresAreArchived(endDate: string, now = Date.now()) {
    return now >= Date.parse(endDate) + CORRECTION_WINDOW_MS;
}

/**
 * Whether a saved season is a frozen season (GLOSSARY.md): its last week has ended and that week's correction
 * window has closed, and it is still the live season (`liveSeasonYear`, the latest season year in the Fantrax team
 * mapping), so the next season hasn't been opened.
 */
export function isFrozenSeason(saved: { seasonYear: number; weeks: { endDate: string }[] } | null, liveSeasonYear: number | undefined, now: number) {
    if (!saved?.weeks.length || saved.seasonYear !== liveSeasonYear) return false;
    const lastEnd = Math.max(...saved.weeks.map(week => Date.parse(week.endDate)));
    return now >= lastEnd + CORRECTION_WINDOW_MS;
}
