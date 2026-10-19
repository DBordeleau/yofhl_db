export const FANTRAX_TAG = 'fantrax-public';
export const FANTRAX_CURRENT_TAG = 'fantrax-current-season';
export const finalWeeksTag = (seasonYear: number) => `fantrax-final-weeks:${seasonYear}`;
export const DAY = 86400;
export const CORRECTION_WINDOW_MS = 7 * DAY * 1000;

export function scoresAreArchived(endDate: string, now = Date.now()) {
    return now >= Date.parse(endDate) + CORRECTION_WINDOW_MS;
}
