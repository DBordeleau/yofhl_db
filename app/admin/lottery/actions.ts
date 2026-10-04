'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin/auth';
import { getDb, rows } from '@/lib/data/db';
import { draftLotteries } from '@/db/schema';
import { getLotteryTeams } from '@/lib/lottery/data';
import { archiveCompletedQuery, cancelQuery, editQuery } from '@/lib/lottery/queries';
import { easternToIso, validateEntries, type LotteryInput, type LotteryRecord } from '@/lib/lottery/model';

export async function saveLottery(input: LotteryInput): Promise<{ lottery?: LotteryRecord; error?: string }> {
    await requireAdmin();
    try {
        const title = typeof input.title === 'string' ? input.title.trim() : '';
        if (!title || title.length > 80) throw new Error('Give the lottery a title of 1–80 characters.');
        const startsAt = easternToIso(input.easternDateTime);
        const [clock] = await rows<{ now: string }>(sql`select clock_timestamp() as now`);
        if (new Date(startsAt).getTime() <= new Date(clock.now).getTime() + 60_000)
            throw new Error('Schedule the lottery at least one minute in the future.');
        const entries = validateEntries(input.entries, await getLotteryTeams());
        let saved: LotteryRecord;
        if (input.id) {
            const [updated] = await rows<LotteryRecord>(editQuery(input.id, input.version, title, startsAt, entries));
            if (!updated) throw new Error('This lottery has started or was changed in another tab. Reload before editing.');
            saved = updated;
        } else {
            const db = getDb();
            const [, inserted] = await db.batch([
                db.execute(archiveCompletedQuery()),
                db.insert(draftLotteries).values({ title, startsAt, entries }).returning(),
            ]);
            saved = inserted[0];
        }
        revalidatePath('/admin/lottery');
        revalidatePath('/lottery');
        return { lottery: saved };
    } catch (error) {
        // Do not send SQL/connection details back to the browser.
        if (error instanceof Error && !('query' in error) && !('code' in error)) return { error: error.message };
        console.error('Lottery save failed', error);
        return { error: 'Unable to save. Another scheduled lottery may already exist; reload and try again.' };
    }
}

export async function cancelLottery(id: string, version: number) {
    await requireAdmin();
    const changed = await rows(cancelQuery(id, version));
    if (!changed.length) return { error: 'This lottery has started or changed. Reload the page.' };
    revalidatePath('/admin/lottery');
    revalidatePath('/lottery');
    return { success: true };
}
