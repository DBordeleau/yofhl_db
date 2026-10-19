'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/admin/auth';
import { rows } from '@/lib/data/db';
import { finalWeeksTag } from '@/lib/fantrax/cache-policy';
import { getLeagueSnapshot } from '@/lib/fantrax/data';
import { finalWeekQuery } from '@/lib/fantrax/final-weeks';
import { refreshCurrentSeason } from '@/lib/fantrax/refresh';

export async function refreshFantrax(): Promise<{ message: string } | { error: string }> {
    await requireAdmin();
    try {
        await refreshCurrentSeason();
        revalidatePath('/');
        revalidatePath('/admin');
        return { message: 'Fantrax scores, standings, rosters and player stats refreshed.' };
    } catch (error) {
        console.error('Admin Fantrax refresh failed:', error);
        return { error: 'Could not refresh all Fantrax data. Please try again.' };
    }
}

export async function setWeekFinal(seasonYear: number, period: number, final: boolean): Promise<{ message: string } | { error: string }> {
    await requireAdmin();
    if (!Number.isInteger(seasonYear) || !Number.isInteger(period) || period < 1 || typeof final !== 'boolean') {
        return { error: 'Choose a valid week.' };
    }
    try {
        const snapshot = await getLeagueSnapshot();
        const week = snapshot.scoringPeriods.find(item => item.number === period);
        if (snapshot.seasonYear !== seasonYear || !week || Date.now() < Date.parse(week.startDate)) {
            return { error: 'Only a started week in the current Fantrax season can be marked final.' };
        }
        // A failed score refresh must not create a manual Final flag.
        if (final) await refreshCurrentSeason();
        await rows(finalWeekQuery(seasonYear, period, final));
        revalidateTag(finalWeeksTag(seasonYear));
        revalidatePath('/');
        revalidatePath('/admin');
        return { message: final ? `Week ${period} marked final.` : `Week ${period} now follows automatic status.` };
    } catch (error) {
        console.error('Admin Fantrax final status failed:', error);
        return { error: 'Could not update this week. Please try again.' };
    }
}
