import { livePickemWeeks, type LivePickemWeek } from './model';
import type { PickemPorts } from './ports';

/** The season being played and its Pick'em weeks at `now`, or null while the live season is unavailable */
export async function loadLivePickem({ liveSeason, launch }: Pick<PickemPorts, 'liveSeason' | 'launch'>, now: number):
    Promise<{ seasonYear: number; weeks: LivePickemWeek[] } | null> {
    const result = await liveSeason.getLiveSeason({ now });
    if (result.status !== 'available') return null;
    return { seasonYear: result.value.seasonYear, weeks: livePickemWeeks(result.value, launch) };
}

/** whether `week` has locked at `now` */
export const isLocked = (week: Pick<LivePickemWeek, 'lock'>, now: number) => now >= Date.parse(week.lock);
