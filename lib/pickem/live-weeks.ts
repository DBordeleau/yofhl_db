import type { LiveTeam } from '@/lib/fantrax/live-season';
import { livePickemWeeks, type LivePickemWeek } from './model';
import type { PickemPorts } from './ports';

/**
 * The season being played, its Pick'em weeks and its teams at `now`, or null while the live season is unavailable.
 * `fresh` re-reads the Fantrax snapshot, as settle does straight after a capture.
 */
export async function loadLivePickem({ liveSeason, launch }: Pick<PickemPorts, 'liveSeason' | 'launch'>, now: number, fresh = false):
    Promise<{ seasonYear: number; weeks: LivePickemWeek[]; teams: LiveTeam[] } | null> {
    const result = await liveSeason.getLiveSeason({ now, fresh });
    if (result.status !== 'available') return null;
    return { seasonYear: result.value.seasonYear, weeks: livePickemWeeks(result.value, launch), teams: result.value.teams };
}

/** whether `week` has locked at `now` */
export const isLocked = (week: Pick<LivePickemWeek, 'lock'>, now: number) => now >= Date.parse(week.lock);
