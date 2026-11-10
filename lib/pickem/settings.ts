import type { PickemLaunch } from './model';

// The launch setting. Null keeps Pick'em switched off: /pickem does not exist and saves are refused. To switch it
// on, name the season year and week the first Pick'em starts at; every later season starts at its own week 1.
export const PICKEM_LAUNCH: PickemLaunch | null = null;
