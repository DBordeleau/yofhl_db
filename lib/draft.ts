export const DRAFT_STARTS_AT = '2026-10-10T21:00:00-04:00';

export function draftCountdown(now: number) {
    const remaining = Date.parse(DRAFT_STARTS_AT) - now;
    if (remaining <= 0) return null;
    const seconds = Math.ceil(remaining / 1000);
    return [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
}
