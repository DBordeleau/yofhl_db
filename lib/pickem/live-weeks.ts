import type { LiveTeam } from '@/lib/fantrax/live-season';
import { livePickemWeeks, type LivePickemWeek } from './model';
import type { PickemPorts } from './ports';
import { readRecordedSeason } from './recorded-weeks';

/**
 * The season being played, its Pick'em weeks and its teams at `now`, or null while the live season is unavailable.
 * A week settle has recorded keeps its recorded lock, whatever Fantrax says of its start since: after the lock
 * nothing can be changed. `fresh` re-reads the Fantrax snapshot, as settle does straight after a capture.
 */
export async function loadLivePickem({ liveSeason, launch }: Pick<PickemPorts, 'liveSeason' | 'launch'>, now: number, fresh = false):
    Promise<{ seasonYear: number; weeks: LivePickemWeek[]; teams: LiveTeam[] } | null> {
    const result = await liveSeason.getLiveSeason({ now, fresh });
    if (result.status !== 'available') return null;
    const { seasonYear, teams } = result.value;
    const weeks = livePickemWeeks(result.value, launch);
    const recorded = weeks.length ? await readRecordedSeason(seasonYear) : [];
    const recordedLock = new Map(recorded.map(week => [week.week, week.lock]));
    return { seasonYear, teams, weeks: weeks.map(week => ({ ...week, lock: recordedLock.get(week.week) ?? week.lock })) };
}

/** whether `week` has locked at `now` */
export const isLocked = (week: Pick<LivePickemWeek, 'lock'>, now: number) => now >= Date.parse(week.lock);
