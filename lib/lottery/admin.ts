import { sql } from 'drizzle-orm';
import { rows, writeInOrder } from '@/lib/data/db';
import { getLotteryTeams } from './data';
import { easternToIso, validateEntries, type LotteryInput, type LotteryRecord } from './model';
import { archiveCompletedQuery, cancelQuery, editQuery, insertQuery } from './queries';

// The admin's lottery writes. The server actions add only the admin check and the page revalidation.

const UNSAVED = 'Unable to save. Another scheduled lottery may already exist; reload and try again.';

/** A reason written for the admin. Every other error (SQL, connection) stays on the server. */
class Refusal extends Error {}

// The model's validators throw errors whose messages are written for the admin.
const checked = <T>(validate: () => T) => {
    try {
        return validate();
    } catch (error) {
        throw new Refusal((error as Error).message);
    }
};

export async function saveLottery(input: LotteryInput): Promise<{ lottery?: LotteryRecord; error?: string }> {
    try {
        const title = typeof input.title === 'string' ? input.title.trim() : '';
        if (!title || title.length > 80) throw new Refusal('Give the lottery a title of 1–80 characters.');
        const startsAt = checked(() => easternToIso(input.easternDateTime));
        // Database time, the clock the draw and the edit deadline use.
        const [clock] = await rows<{ now: string }>(sql`select clock_timestamp() as now`);
        if (new Date(startsAt).getTime() <= new Date(clock.now).getTime() + 60_000)
            throw new Refusal('Schedule the lottery at least one minute in the future.');
        const teams = await getLotteryTeams();
        const entries = checked(() => validateEntries(input.entries, teams));
        if (input.id) {
            const [updated] = await rows<LotteryRecord>(editQuery(input.id, input.version, title, startsAt, entries));
            if (!updated) throw new Refusal('This lottery has started or was changed in another tab. Reload before editing.');
            return { lottery: updated };
        }
        // The archive frees the one current slot before the insert takes it (docs/adr/0007).
        const [, [inserted]] = await writeInOrder<[unknown, LotteryRecord]>([archiveCompletedQuery(), insertQuery(title, startsAt, entries)]);
        return { lottery: inserted };
    } catch (error) {
        if (error instanceof Refusal) return { error: error.message };
        console.error('Lottery save failed', error);
        return { error: UNSAVED };
    }
}

export async function cancelLottery(id: string, version: number): Promise<{ success?: true; error?: string }> {
    const cancelled = await rows(cancelQuery(id, version));
    if (!cancelled.length) return { error: 'This lottery has started or changed. Reload the page.' };
    return { success: true };
}
