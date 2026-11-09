'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { checkCredentials, endSession, requireAdmin, startSession } from '@/lib/admin/auth';
import { searchSeasonPlayers } from '@/lib/admin/data';
import * as curated from '@/lib/data/curated-edits';

const messages = {
    'unknown-season': "That season isn't in the database.",
    'no-playoffs': 'This season has no playoffs, so it has no championship roster.',
    'unknown-player': "Some of those players didn't play that season.",
    'unknown-award': "One of those awards doesn't exist.",
    'unknown-matchup': 'That playoff game no longer exists. Reload the page.',
    'not-in-matchup': 'The winner has to be one of the two teams.',
};

// The admin screens refresh after every save, including one whose view refresh failed after it committed.
const refreshingAdmin = async <T>(save: Promise<T>) => {
    try { return await save; }
    finally { revalidatePath('/admin', 'layout'); }
};

export async function login(formData: FormData): Promise<{ error: string } | void> {
    const username = String(formData.get('username') ?? '');
    const password = String(formData.get('password') ?? '');
    const next = String(formData.get('next') ?? '/admin');
    if (!checkCredentials(username, password)) {
        // slow down guessing
        await new Promise((resolve) => setTimeout(resolve, 800));
        return { error: 'That username and password combination is incorrect.' };
    }
    await startSession();
    redirect(next.startsWith('/admin') ? next : '/admin');
}

export async function logout() {
    await endSession();
    redirect('/admin');
}

export async function findSeasonPlayers(year: number, q: string) {
    await requireAdmin();
    return searchSeasonPlayers(year, String(q).slice(0, 60));
}

// replaces the season's championship roster with exactly these players
export async function saveRoster(year: number, playerIds: string[]) {
    await requireAdmin();
    const result = await refreshingAdmin(curated.saveRoster(year, playerIds));
    if (!result.ok) throw new Error(messages[result.reason]);
    return { saved: result.saved };
}

// one winner per award; a null player clears the award for the season
export async function saveAwards(year: number, picks: { award: string; playerId: string | null }[]) {
    await requireAdmin();
    const result = await refreshingAdmin(curated.saveAwards(year, picks));
    if (!result.ok) throw new Error(messages[result.reason]);
    return { saved: result.saved };
}

// winner: 'score' follows the score, or a franchise id to override it; an empty note with 'score' removes the correction
export async function saveMatchup(year: number, matchupId: number, winner: 'score' | number, note: string) {
    await requireAdmin();
    const result = await refreshingAdmin(curated.saveMatchup(year, matchupId, winner, note));
    if (!result.ok) throw new Error(messages[result.reason]);
    return { saved: true };
}
