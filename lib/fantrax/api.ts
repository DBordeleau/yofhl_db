// Fantrax's public API, shared by the site's adapter and the Coach's Corner fact export.
// Free of Next imports so scripts can use it.
import { seasonYearFromFantrax } from './season';

export const fantraxApiUrl = (endpoint: string, parameters: Record<string, string> = {}) =>
    `https://www.fantrax.com/fxea/general/${endpoint}?${new URLSearchParams(parameters)}`;

/** getLeagueInfo as the rest of the site reads it: its start year becomes the season year */
export const readLeagueInfo = <T extends { seasonYear: number }>(info: T): T => ({ ...info, seasonYear: seasonYearFromFantrax(info.seasonYear) });
