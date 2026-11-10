// Settle: the Pick'em module's evening work, run by the Fantrax refresh straight after a successful capture.
// It records every Pick'em week of the live season whose lock has passed and that is not yet recorded. Each week
// is one statement that is safe to repeat (ADR 0002), so running twice changes nothing and a missed evening is
// caught up by the next run.
import { revalidateTag } from 'next/cache';
import { rows } from '@/lib/data/db';
import { isLocked, loadLivePickem } from './live-weeks';
import type { PickemPorts } from './ports';
import { pickemSeasonTag, recordedWeekNumbersQuery, recordWeekQuery } from './recorded-weeks';

export interface SettleInput {
    now: number;
}

export interface SettleResult {
    /** the weeks this run recorded */
    recorded: { seasonYear: number; week: number }[];
}

export function createSettle(ports: PickemPorts) {
    return async function settle({ now }: SettleInput): Promise<SettleResult> {
        if (!ports.launch) return { recorded: [] };
        // Fresh, so the snapshot the capture has just saved is the one settled.
        const live = await loadLivePickem(ports, now, true);
        if (!live) throw new Error("The live season is unavailable, so Pick'em cannot settle.");
        const locked = live.weeks.filter(week => isLocked(week, now));
        if (!locked.length) return { recorded: [] };

        const known = new Set((await rows<{ week: number }>(recordedWeekNumbersQuery(live.seasonYear))).map(row => row.week));
        const recorded: SettleResult['recorded'] = [];
        for (const week of locked.filter(item => !known.has(item.week))) {
            const [row] = await rows<{ recorded: number }>(recordWeekQuery(week));
            if (row?.recorded) recorded.push({ seasonYear: week.seasonYear, week: week.week });
        }
        if (recorded.length) revalidateTag(pickemSeasonTag(live.seasonYear));
        return { recorded };
    };
}
