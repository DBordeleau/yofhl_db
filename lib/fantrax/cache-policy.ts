import type { SavedSchedule, SourceWeek } from './live-season-source';

export const FANTRAX_TAG = 'fantrax-public';
export const FANTRAX_CURRENT_TAG = 'fantrax-current-season';
export const finalWeeksTag = (seasonYear: number) => `fantrax-final-weeks:${seasonYear}`;
export const DAY = 86400;
export const CORRECTION_WINDOW_MS = 7 * DAY * 1000;

export function scoresAreArchived(endDate: string, now = Date.now()) {
    return now >= Date.parse(endDate) + CORRECTION_WINDOW_MS;
}

/**
 * Whether a season's schedule is over for good (GLOSSARY.md, "Frozen season"): its last week has ended and that
 * week's correction window has closed. False for a schedule with no weeks.
 */
export function scheduleIsFrozen(weeks: Pick<SourceWeek, 'endDate'>[], now: number) {
    if (!weeks.length) return false;
    return now >= Math.max(...weeks.map(week => Date.parse(week.endDate))) + CORRECTION_WINDOW_MS;
}

/**
 * Whether a saved season is a frozen season (GLOSSARY.md): its schedule is over for good, and it is still the
 * live season (`liveSeasonYear`, the latest season year in the Fantrax team mapping), so the next season hasn't
 * been opened.
 */
export function isFrozenSeason(saved: SavedSchedule | null, liveSeasonYear: number | undefined, now: number) {
    return !!saved && saved.seasonYear === liveSeasonYear && scheduleIsFrozen(saved.weeks, now);
}
