'use server';

import { revalidatePath } from 'next/cache';
import { ownerSession } from '@/lib/owner/owner-session';
import { getKeeperRoster, getKeeperSubmission } from '@/lib/keepers/data';
import { KEEPERS_ENABLED, CALDER_SEASON, keepersOpen, rosterFingerprint, validateKeepers, type KeeperInput, type KeeperSaveResult, type KeeperPlayer } from '@/lib/keepers/model';
import { enrichKeeperRoster } from '@/lib/keepers/nhl';
import { rows } from '@/lib/data/db';
import { saveKeepersQuery } from '@/lib/keepers/queries';
import type { KeeperSubmission } from '@/lib/keepers/model';

export async function saveKeeperSelection(input: KeeperInput): Promise<KeeperSaveResult> {
    if (!KEEPERS_ENABLED) return { error: 'Keeper submissions are currently unavailable.' };
    try {
        const session = await ownerSession.preamble('keepers', { team: true });
        if (!session.ok) return { error: session.reason === 'session-expired' ? 'Sign in again to submit your keepers.' : 'This account does not manage an active team.' };
        const { actor: user, team } = session;
        if (!keepersOpen()) return { error: 'Keeper submissions closed on October 9 at 7:00 p.m. Eastern.' };
        if (!input || !Number.isSafeInteger(input.version) || input.version < 0 ||
            typeof input.rosterFingerprint !== 'string' || input.rosterFingerprint.length > 20000 ||
            !Array.isArray(input.keptIds) || input.keptIds.length > 100 || input.keptIds.some(id => typeof id !== 'string' || id.length > 64) ||
            (input.rookieId !== null && (typeof input.rookieId !== 'string' || !input.rookieId || input.rookieId.length > 64)) ||
            typeof input.rookieDeclared !== 'boolean') return { error: 'Invalid submission. Reload the page and try again.' };
        const [saved, current] = await Promise.all([getKeeperSubmission(team.id), getKeeperRoster(team.id, true)]);
        if ((saved?.version ?? 0) !== input.version) return { error: 'This list changed in another window or was reviewed by the admin. Reload before submitting.' };
        if (rosterFingerprint(current.roster) !== input.rosterFingerprint) return { error: 'Your Fantrax roster changed. Use Refresh from Fantrax to review it before submitting.' };
        const roster = await enrichKeeperRoster(current.roster);
        const result = validateKeepers(roster, input, saved?.rookieReviews);
        if (!result.valid) return { error: result.errors.join(' ') };
        const [submission] = await rows<KeeperSubmission>(saveKeepersQuery({
            franchiseId: team.id, uid: user.uid, version: input.version, roster,
            selection: { keptIds: result.keptIds, rookieId: input.rookieId, rookieDeclared: Boolean(input.rookieId && input.rookieDeclared), rookieSeason: input.rookieId ? CALDER_SEASON : null },
        }));
        if (!submission) return { error: 'The deadline passed or this list changed. Reload to see its current status.' };
        revalidatePath('/owner/keepers'); revalidatePath('/admin/keepers');
        return { submission };
    } catch {
        return { error: 'Could not confirm the submission. Reload to check its status before trying again.' };
    }
}

export async function refreshKeeperRoster(): Promise<{ roster: KeeperPlayer[]; fetchedAt: string; serverNow: string; error?: never } | { error: string; roster?: never }> {
    if (!KEEPERS_ENABLED) return { error: 'Keeper submissions are currently unavailable.' };
    try {
        const session = await ownerSession.preamble('keeper-refresh', { team: true });
        if (!session.ok) return { error: session.reason === 'session-expired' ? 'Sign in again to refresh your roster.' : 'This account does not manage an active team.' };
        const { team } = session;
        if (!keepersOpen()) return { error: 'Keeper submissions are closed. Your submitted roster is now read-only.' };
        const current = await getKeeperRoster(team.id, true);
        const roster = await enrichKeeperRoster(current.roster);
        if (!keepersOpen()) return { error: 'The deadline passed while refreshing. Your submitted roster is now read-only.' };
        return { roster, fetchedAt: current.fetchedAt, serverNow: new Date().toISOString() };
    } catch { return { error: 'Could not refresh from Fantrax. Your selections are unchanged. Please try again.' }; }
}
