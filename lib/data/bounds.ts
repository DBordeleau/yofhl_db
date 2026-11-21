export const MAX_INT4 = 2147483647;
export const MAX_LEADERBOARD_PAGE = 1000;
export const MAX_HISTORY_PAGE = 1000;
export const MAX_ID_LENGTH = 64;

export const isPositiveInt4 = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_INT4;

export const parsePositiveInt4 = (raw: string): number | null => {
    if (!/^\d{1,10}$/.test(raw)) return null;
    const n = Number(raw);
    return isPositiveInt4(n) ? n : null;
};

export const safeDecodeParam = (raw: string): string | null => {
    try { return decodeURIComponent(raw); }
    catch { return null; }
};

export const clampPage = (page: number, max: number) =>
    Math.min(max, Math.max(1, Number.isFinite(page) ? Math.trunc(page) || 1 : 1));
