'use server';

import { revalidatePath } from 'next/cache';
import { put, del } from '@vercel/blob';
import sharp from 'sharp';
import { isAdmin, requireAdmin } from '@/lib/admin/auth';
import { rows } from '@/lib/data/db';
import { saveTeamBranding as saveBranding, saveTeamIdentity, type Actor } from '@/lib/data/curated-edits';
import { clearOwnerSession, freshOwnerToken, limitOwnerAction, ownerSession, requireSameOrigin, startOwnerSession } from '@/lib/owner/auth';
import { hashCode, invitation, teamName } from '@/lib/owner/model';
import { claimTeamQuery, issueInviteQuery } from '@/lib/owner/queries';
import { parseTeamColours } from '@/lib/team-branding';

const messages = {
    'unknown-team': 'That team no longer exists.',
    'not-owner': 'You cannot edit this team.',
    defunct: 'This team has folded, so its identity is final.',
    'stale-version': 'This team changed since you opened it. Reload before saving.',
};

// The admin, or the signed-in owner; null when the owner session has expired.
const currentActor = async (): Promise<Actor | null> => {
    if (await isAdmin()) return { admin: true };
    const user = await ownerSession();
    return user ? { uid: user.uid } : null;
};
const limitKey = (actor: Actor) => ('uid' in actor ? actor.uid : 'admin');

const refresh = () => {
    revalidatePath('/owner');
    revalidatePath('/admin/teams');
    revalidatePath('/owner/branding');
};

export async function saveTeamBranding(id: number, version: number, value: unknown) {
    await requireSameOrigin();
    const actor = await currentActor();
    if (!actor) return { error: 'Your session has expired. Please sign in again.' };
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(version) || version < 0) return { error: 'Invalid team.' };
    const branding = parseTeamColours(value, id);
    if (!branding) return { error: 'Choose three six-digit hex colours and a background style available to your team.' };
    await limitOwnerAction('save-branding', limitKey(actor));
    const result = await saveBranding(actor, id, version, branding);
    if (!result.ok) return { error: messages[result.reason] };
    refresh();
    revalidatePath(`/admin/teams/${id}/branding`);
    return { saved: true };
}

export async function signInOwner(idToken: string) {
    await requireSameOrigin();
    await limitOwnerAction('sign-in');
    await freshOwnerToken(idToken);
    await startOwnerSession(idToken);
}

export async function claimTeam(idToken: string, code: string) {
    await requireSameOrigin();
    await limitOwnerAction('claim');
    const user = await freshOwnerToken(idToken);
    if (typeof code !== 'string' || code.trim().length !== 32) return { error: 'That invitation is invalid or expired. Ask the commissioner for a new code.' };
    // Create the session before claiming; a transient Firebase failure cannot consume a code.
    await startOwnerSession(idToken);
    let result;
    try { result = await rows(claimTeamQuery(hashCode(code), user.uid, user.email!)); }
    catch (error) {
        if ((error as { code?: string }).code === '23505' || (error as { cause?: { code?: string } }).cause?.code === '23505') {
            return { error: 'This account already owns a team.' };
        }
        throw error;
    }
    if (!result.length) return { error: 'This code is expired, already used, or this account already owns a team.' };
    refresh();
    return { saved: true };
}

export async function signOutOwner() {
    await requireSameOrigin();
    await clearOwnerSession();
}

export async function createTeamInvitation(id: number) {
    await requireSameOrigin();
    await requireAdmin();
    if (!Number.isSafeInteger(id)) throw new Error('Invalid team.');
    const code = invitation();
    const result = await rows(issueInviteQuery(id, hashCode(code)));
    if (!result.length) return { error: 'Only an unclaimed, active team can receive an invitation.' };
    revalidatePath('/admin/teams');
    return { code };
}

export async function saveTeam(form: FormData) {
    await requireSameOrigin();
    const actor = await currentActor();
    if (!actor) return { error: 'Your session has expired. Please sign in again.' };
    await limitOwnerAction('save-team', limitKey(actor));
    const id = Number(form.get('id'));
    const version = Number(form.get('version'));
    if (!Number.isSafeInteger(id) || !Number.isSafeInteger(version) || version < 0) return { error: 'Invalid team.' };
    let name;
    try { name = teamName(form.get('name')); }
    catch (error) { return { error: (error as Error).message }; }
    let uploaded: string | null = null;
    const file = form.get('logo');
    if (file instanceof File && file.size) {
        if (file.size > 2 * 1024 * 1024) return { error: 'Choose a PNG, JPEG or WebP image smaller than 2 MB.' };
        let buffer;
        try {
            const source = Buffer.from(await file.arrayBuffer());
            const image = sharp(source, { limitInputPixels: 16000000, animated: false });
            const metadata = await image.metadata();
            if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '')) throw new Error('format');
            buffer = await image.rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
        } catch { return { error: 'That image could not be read. Choose a PNG, JPEG or WebP up to 16 megapixels.' }; }
        try {
            uploaded = (await put(`team-logos/${id}/logo.webp`, buffer, { access: 'public', addRandomSuffix: true, contentType: 'image/webp' })).url;
        } catch { return { error: 'The logo could not be uploaded. Your changes have not been saved; please try again.' }; }
    }
    let result;
    try {
        result = await saveTeamIdentity(actor, { franchiseId: id, version, name, logoUrl: uploaded });
    } catch {
        // A database timeout can have an unknown commit outcome. Keep the new file
        // rather than risk deleting a logo that the database already references.
        return { error: 'Could not save your team. Please try again.' };
    }
    if (!result.ok) {
        if (uploaded) await del(uploaded).catch(() => {});
        return { error: messages[result.reason] };
    }
    refresh();
    // Only delete uploads owned by this feature, never checked-in historical artwork.
    const orphan = result.orphanedLogoUrl;
    try {
        if (orphan && new URL(orphan).pathname.startsWith(`/team-logos/${id}/`)) await del(orphan);
    } catch { console.warn('A replaced team logo could not be cleaned up. The new logo is saved.'); }
    return { saved: true };
}
