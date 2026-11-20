// Run: the season sync's one operation. It writes the live season into the archive once the season import has
// opened it there: read everything from Fantrax, check all of it, then write it in one statement that changes a
// row only when a value differs and records the run on the season's status row. Views refresh after the write
// and tags are expired even if a refresh fails; a run that changed nothing does neither. A failed read, check or
// write is recorded on the status row and changes nothing else, so the next run catches up. Seven days after the
// season's last week ends the run records the freeze and every later run leaves the season alone, answering from
// the cache without a database query until the next season is opened.
import { sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { seasonSyncEffects } from '@/lib/data/cache-tags';
import { rows } from '@/lib/data/db';
import { inRefreshOrder } from '@/lib/data/materialized-views';
import { correctionWindowClosed } from '@/lib/fantrax/live-season';
import { readCurrentSeason } from './current-season';
import type { SeasonSyncPorts } from './ports';
import { readLeagueInfo, readSeason } from './read-season';
import { failedRunQuery, freezeQuery, type SyncCounts } from './status';
import { syncWriteQuery } from './write';

export interface RunInput {
    now: number;
}

export type SeasonSyncResult =
    /** the live season is not opened in the archive (or there is no live season): nothing was written */
    | { outcome: 'not-opened'; seasonYear: number | null }
    /** the season is frozen, by this run or an earlier one */
    | { outcome: 'frozen'; seasonYear: number; frozenAt: string }
    | { outcome: 'synced'; seasonYear: number; changed: SyncCounts; warnings: string[] }
    /** nothing was written but the error on the status row */
    | { outcome: 'failed'; seasonYear: number; error: string };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createRun(ports: SeasonSyncPorts) {
    return async function run({ now }: RunInput): Promise<SeasonSyncResult> {
        const current = await readCurrentSeason();
        if (current.state === 'not-opened') return { outcome: 'not-opened', seasonYear: current.seasonYear };
        if (current.state === 'frozen') return { outcome: 'frozen', seasonYear: current.seasonYear, frozenAt: current.frozenAt };
        const { season } = current;
        const year = season.seasonYear;
        const failed = async (error: unknown): Promise<SeasonSyncResult> => {
            console.error(`The season sync of ${year} failed:`, error);
            await rows(failedRunQuery(year, now, message(error)));
            return { outcome: 'failed', seasonYear: year, error: message(error) };
        };

        let read;
        try {
            const info = await readLeagueInfo(ports, season);
            if (correctionWindowClosed(info.weeks.at(-1)!.endDate, now)) await rows(freezeQuery(year, now));
            else read = await readSeason(ports, season, info, now);
        } catch (error) {
            return failed(error);
        }
        if (!read) {
            // The run froze the season. Read it back, so later runs answer frozen from the cache. The freeze is
            // recorded either way: if the read back fails, the next run reads the frozen mark itself.
            await readCurrentSeason().catch(error => console.error(`The season sync of ${year} froze it, but could not read it back:`, error));
            return { outcome: 'frozen', seasonYear: year, frozenAt: new Date(now).toISOString() };
        }

        let changed: SyncCounts;
        try {
            [changed] = await rows<SyncCounts>(syncWriteQuery(year, now, read));
        } catch (error) {
            return failed(error);
        }

        const { views, tags } = seasonSyncEffects(read.writes.filter(write => write.count !== null && changed[write.count] > 0).map(write => write.change), year);
        try {
            // The write has committed, so a refresh failure still expires the pages before it is recorded.
            try {
                for (const view of inRefreshOrder(views)) await rows(sql`refresh materialized view league.${sql.identifier(view)}`);
            } finally {
                for (const tag of tags) revalidateTag(tag);
            }
        } catch (error) {
            return failed(error);
        }
        return { outcome: 'synced', seasonYear: year, changed, warnings: read.warnings };
    };
}
