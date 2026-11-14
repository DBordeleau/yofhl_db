'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin/auth';
import * as liveSeason from '@/lib/fantrax/live-season';
import { seasonSync } from '@/lib/season-sync/season-sync';

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

// The same run as the season sync's morning cron, after a Fantrax refresh: the sync reads the playoffs from the
// saved snapshot, which can be a day old, so a playoff settings change made since the evening refresh counts.
export async function syncSeasonStats(): Promise<{ message: string } | { error: string }> {
    await requireAdmin();
    try {
        await liveSeason.refreshLiveSeason();
        revalidatePath('/');
    } catch (error) {
        console.error('Admin Fantrax refresh before the season sync failed:', error);
        return { error: 'Could not refresh Fantrax, so the season sync did not run. Please try again.' };
    }
    try {
        const result = await seasonSync.run({ now: Date.now() });
        revalidatePath('/admin');
        switch (result.outcome) {
            case 'not-opened': return { error: 'The live season is not in the archive yet. Run the season import to open it.' };
            case 'frozen': return { message: 'This season is frozen. The season sync no longer changes it.' };
            case 'failed': return { error: `Season sync failed: ${result.error}` };
            case 'synced': return { message: Object.values(result.changed).some(Boolean) ? 'Season stats synced.' : 'Season stats synced. Nothing had changed.' };
        }
    } catch (error) {
        console.error('Admin season sync failed:', error);
        return { error: 'Could not sync season stats. Please try again.' };
    }
}
