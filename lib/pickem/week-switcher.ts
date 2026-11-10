// The weeks a season's Pick'em switcher offers: every Pick'em week of the season being played, locked or not.
import { isLocked } from './live-weeks';
import type { LivePickemWeek } from './model';

/** One week in the switcher. It says nothing about anyone's Pick'em picks. */
export interface PickemWeekOption {
    week: number;
    /** "Week 5" */
    name: string;
    /** ISO timestamp */
    lock: string;
    phase: 'open' | 'locked';
}

export const weekOptions = (weeks: LivePickemWeek[], now: number): PickemWeekOption[] =>
    weeks.map(({ week, name, lock }) => ({ week, name, lock, phase: isLocked({ lock }, now) ? 'locked' : 'open' }));
