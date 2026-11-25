// Settle: the Pick'em module's evening work, run on every scheduled Fantrax run, whether the capture published,
// changed nothing or was skipped for a frozen season: locks and correction windows pass on the clock.
// It records every Pick'em week of the live season whose lock has passed and that is not yet recorded, then freezes
// (results and scores) every recorded week that is a final week whose correction window has closed and that is not yet frozen
// (a week with a pairing Fantrax has no score for waits for a later run), and
// marks the season's Pick'em complete once every Pick'em week of the season is recorded and frozen. Each week is one statement that is safe to repeat (ADR 0002), so running twice changes nothing and a missed evening is
// caught up by the next run. It stops on Pick'em's own record: once the season's Pick'em is complete, or when the
// season has no Pick'em, it returns before reading the live season, with no query or Fantrax request.
import { revalidateTag } from 'next/cache';
import { rows } from '@/lib/data/db';
import { correctionWindowClosed } from '@/lib/fantrax/live-season';
import { isLocked, loadLivePickem } from './live-weeks';
import { firstPickemWeek } from './model';
import type { PickemPorts } from './ports';
import { freezeWeekQuery, pickemSeasonTag, recordedSeasonQuery, recordWeekQuery, type RecordedWeek } from './recorded-weeks';
import { liveResults } from './results';
import { completeSeasonQuery, isSeasonComplete, PICKEM_SEASONS_TAG } from './seasons';

export interface SettleInput {
    now: number;
}

type SettledWeek = { seasonYear: number; week: number };

export interface SettleResult {
    /** the weeks this run recorded */
    recorded: SettledWeek[];
    /** the weeks whose results this run froze */
    frozen: SettledWeek[];
    /** the weeks due to freeze that this run left alone, because Fantrax had no score for one of their pairings */
    held: SettledWeek[];
    /** the season years whose Pick'em this run marked complete */
    completed: number[];
}

export function createSettle(ports: PickemPorts) {
    return async function settle({ now }: SettleInput): Promise<SettleResult> {
        const settledNothing: SettleResult = { recorded: [], frozen: [], held: [], completed: [] };
        if (!ports.launch) return settledNothing;
        // Asked before the live season is read, since reading it can wake the database once its caches' timers
        // run out. Both answers come from cache: the live season's year (from the Fantrax team mapping) has no
        // Pick'em, or the cached Pick'em seasons list (which only settle expires) marks its Pick'em complete.
        const liveYear = await ports.liveSeason.liveSeasonYear();
        if (liveYear !== null && (firstPickemWeek(liveYear, ports.launch) === null || await isSeasonComplete(liveYear))) return settledNothing;
        // The saved snapshot, with no Fantrax request of its own: just saved when this run's capture published, the
        // one before it when nothing changed, and a frozen season's final one, which never goes stale.
        const live = await loadLivePickem(ports, now);
        if (!live) throw new Error("The live season is unavailable, so Pick'em cannot settle.");
        const { seasonYear } = live;
        if (!live.weeks.length) return settledNothing;
        const readRecorded = () => rows<RecordedWeek>(recordedSeasonQuery(seasonYear));

        let known = await readRecorded();
        const recorded: SettledWeek[] = [];
        for (const week of live.weeks.filter(item => isLocked(item, now) && !known.some(row => row.week === item.week))) {
            const [row] = await rows<{ recorded: number }>(recordWeekQuery(week));
            if (row?.recorded) recorded.push({ seasonYear, week: week.week });
        }
        if (recorded.length) known = await readRecorded();

        const frozen: SettledWeek[] = [];
        const held: SettledWeek[] = [];
        for (const week of known.filter(item => !item.frozen && item.pairings.length)) {
            const liveWeek = live.weeks.find(item => item.week === week.week);
            if (!liveWeek?.final || !correctionWindowClosed(liveWeek.endDate, now)) continue;
            const scored = await liveResults(ports, week.week, week.pairings, live.teams);
            // A freeze is never rewritten, so a week waits while any pairing has no score (a Fantrax team that maps
            // to no franchise, say): frozen now, its Pick'em picks would count as neither for good.
            if (scored.some(item => item.score === null)) {
                console.warn(`Pick'em week ${week.week} of ${seasonYear} is not frozen: Fantrax has no score for one of its pairings.`);
                held.push({ seasonYear, week: week.week });
                continue;
            }
            const results = week.pairings.map((pairing, index) => ({
                position: pairing.position, winner: scored[index].winner,
                awayScore: scored[index].score?.away ?? null, homeScore: scored[index].score?.home ?? null,
            }));
            const [row] = await rows<{ frozen: number }>(freezeWeekQuery(seasonYear, week.week, results));
            if (row?.frozen) frozen.push({ seasonYear, week: week.week });
        }

        const completed: number[] = [];
        const knownByWeek = new Map(known.map(item => [item.week, item]));
        const frozenWeeks = new Set(frozen.map(item => item.week));
        const allSettled = live.weeks.length > 0 && held.length === 0 && live.weeks.every(week => {
            const item = knownByWeek.get(week.week);
            return item !== undefined && (!item.pairings.length || item.frozen || frozenWeeks.has(week.week));
        });
        if (allSettled) {
            const [row] = await rows<{ completed: number }>(completeSeasonQuery(seasonYear, live.weeks.map(week => week.week)));
            if (row?.completed) completed.push(seasonYear);
        }
        if (recorded.length || frozen.length || completed.length) revalidateTag(pickemSeasonTag(seasonYear));
        if (recorded.length || completed.length) revalidateTag(PICKEM_SEASONS_TAG);
        return { recorded, frozen, held, completed };
    };
}
