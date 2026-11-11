import type { PickemLaunch } from './model';

// The launch setting. Null keeps Pick'em switched off: /pickem does not exist and saves are refused. To switch it
// on, name the season year and week the first Pick'em starts at; every later season starts at its own week 1.
// Launched for the 2026-27 season (year 2027) at week 6, which locks Monday, November 16, 2026 at noon ET.
export const PICKEM_LAUNCH: PickemLaunch | null = { seasonYear: 2027, week: 6 };
