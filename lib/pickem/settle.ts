// Settle: the Pick'em module's evening work, run by the Fantrax refresh straight after a successful capture.
// It records every Pick'em week of the live season whose lock has passed and that is not yet recorded, then freezes
// every recorded week that is a final week whose correction window has closed and that is not yet frozen, and
// marks the season's Pick'em complete once its last regular-season week is frozen. Each week is one statement that is safe to repeat (ADR 0002), so running twice changes nothing and a missed evening is
// caught up by the next run.
import { revalidateTag } from 'next/cache';
import { rows } from '@/lib/data/db';
import { correctionWindowClosed } from '@/lib/fantrax/live-season';
import { isLocked, loadLivePickem } from './live-weeks';
import type { PickemPorts } from './ports';
import { freezeWeekQuery, pickemSeasonTag, recordedSeasonQuery, recordWeekQuery, type RecordedWeek } from './recorded-weeks';
import { liveWinners } from './results';
import { completeSeasonQuery, PICKEM_SEASONS_TAG } from './seasons';

export interface SettleInput {
    now: number;
}

type SettledWeek = { seasonYear: number; week: number };

export interface SettleResult {
    /** the weeks this run recorded */
    recorded: SettledWeek[];
    /** the weeks whose results this run froze */
    frozen: SettledWeek[];
    /** the season years whose Pick'em this run marked complete */
    completed: number[];
}

export function createSettle(ports: PickemPorts) {
    return async function settle({ now }: SettleInput): Promise<SettleResult> {
        if (!ports.launch) return { recorded: [], frozen: [], completed: [] };
        // Fresh, so the snapshot the capture has just saved is the one settled.
        const live = await loadLivePickem(ports, now, true);
        if (!live) throw new Error("The live season is unavailable, so Pick'em cannot settle.");
        const { seasonYear } = live;
        const readRecorded = () => rows<RecordedWeek>(recordedSeasonQuery(seasonYear));

        let known = await readRecorded();
        const recorded: SettledWeek[] = [];
        for (const week of live.weeks.filter(item => isLocked(item, now) && !known.some(row => row.week === item.week))) {
            const [row] = await rows<{ recorded: number }>(recordWeekQuery(week));
            if (row?.recorded) recorded.push({ seasonYear, week: week.week });
        }
        if (recorded.length) known = await readRecorded();

        const frozen: SettledWeek[] = [];
        for (const week of known.filter(item => !item.frozen && item.pairings.length)) {
            const liveWeek = live.weeks.find(item => item.week === week.week);
            if (!liveWeek?.final || !correctionWindowClosed(liveWeek.endDate, now)) continue;
            const winners = await liveWinners(ports, week.week, week.pairings, live.teams);
            const results = week.pairings.map((pairing, index) => ({ position: pairing.position, winner: winners[index] }));
            const [row] = await rows<{ frozen: number }>(freezeWeekQuery(seasonYear, week.week, results));
            if (row?.frozen) frozen.push({ seasonYear, week: week.week });
        }

        const completed: number[] = [];
        const last = live.weeks.at(-1);
        if (last && (known.find(item => item.week === last.week)?.frozen || frozen.some(item => item.week === last.week))) {
            const [row] = await rows<{ completed: number }>(completeSeasonQuery(seasonYear, last.week));
            if (row?.completed) completed.push(seasonYear);
        }
        if (recorded.length || frozen.length || completed.length) revalidateTag(pickemSeasonTag(seasonYear));
        if (recorded.length || completed.length) revalidateTag(PICKEM_SEASONS_TAG);
        return { recorded, frozen, completed };
    };
}
