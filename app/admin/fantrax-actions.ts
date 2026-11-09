'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin/auth';
import * as liveSeason from '@/lib/fantrax/live-season';

// The same capture and publish as the evening cron.
export async function refreshFantrax(): Promise<{ message: string } | { error: string }> {
    await requireAdmin();
    try {
        await liveSeason.refreshLiveSeason();
        revalidatePath('/');
        revalidatePath('/admin');
        return { message: 'Fantrax scores, standings, rosters and player stats refreshed.' };
    } catch (error) {
        console.error('Admin Fantrax refresh failed:', error);
        return { error: 'Could not refresh all Fantrax data. Please try again.' };
    }
}

export async function setWeekFinal(week: number, final: boolean): Promise<{ message: string } | { error: string }> {
    await requireAdmin();
    if (!Number.isInteger(week) || week < 1 || typeof final !== 'boolean') return { error: 'Choose a valid week.' };
    try {
        await liveSeason.setWeekFinal(week, final);
        revalidatePath('/');
        revalidatePath('/admin');
        return { message: final ? `Week ${week} marked final.` : `Week ${week} now follows automatic status.` };
    } catch (error) {
        if (error instanceof RangeError) return { error: 'Only a started week in the current Fantrax season can be marked final.' };
        console.error('Admin Fantrax final status failed:', error);
        return { error: 'Could not update this week. Please try again.' };
    }
}
