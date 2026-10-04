'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { sql } from 'drizzle-orm';
import { put, del } from '@vercel/blob';
import sharp from 'sharp';
import { isAdmin, requireAdmin } from '@/lib/admin/auth';
import { rows, LEAGUE_TAG } from '@/lib/data/db';
import { clearOwnerSession, freshOwnerToken, limitOwnerAction, ownerSession, requireSameOrigin, startOwnerSession } from '@/lib/owner/auth';
import { hashCode, invitation, teamName, type ManagedTeam } from '@/lib/owner/model';
import { claimTeamQuery, issueInviteQuery, managedTeamsQuery, saveTeamQuery, updateTeamQuery } from '@/lib/owner/queries';

const refresh = () => {
    revalidateTag(LEAGUE_TAG);
    revalidatePath('/owner');
    revalidatePath('/admin/teams');
};

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
    const admin = await isAdmin();
    const user = admin ? null : await ownerSession();
    if (!admin && !user) return { error: 'Your session has expired. Please sign in again.' };
    await limitOwnerAction('save-team', user?.uid ?? 'admin');
    const id = Number(form.get('id'));
    const version = Number(form.get('version'));
    if (!Number.isSafeInteger(id) || !Number.isSafeInteger(version) || version < 0) return { error: 'Invalid team.' };
    const team = (await rows<ManagedTeam>(managedTeamsQuery)).find((team) => team.id === id);
    if (!team || (!admin && (team.ownerUid !== user?.uid || team.defunct))) return { error: 'You cannot edit this team.' };
    if (team.version !== version) return { error: 'This team changed since you opened it. Reload before saving.' };
    let name;
    try { name = teamName(form.get('name')); }
    catch (error) { return { error: (error as Error).message }; }
    const [previous] = await rows<{ logo: string | null }>(sql`select logo_url as logo from league.team_management where franchise_id = ${id}`);
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
        result = await rows(version === 0
            ? saveTeamQuery(id, version, name, uploaded ?? previous?.logo ?? null, admin)
            : updateTeamQuery(id, version, name, uploaded ?? previous?.logo ?? null, user?.uid ?? null, admin));
    } catch {
        // A database timeout can have an unknown commit outcome. Keep the new file
        // rather than risk deleting a logo that the database already references.
        return { error: 'Could not save your team. Please try again.' };
    }
    if (!result.length) {
        if (uploaded) await del(uploaded).catch(() => {});
        return { error: 'This team changed while you were saving. Reload before trying again.' };
    }
    refresh();
    // Only delete uploads owned by this feature, never checked-in historical artwork.
    try {
        if (uploaded && previous?.logo && new URL(previous.logo).pathname.startsWith(`/team-logos/${id}/`)) {
            const references = await rows(sql`select 1 from league.team_seasons where logo_url = ${previous.logo} limit 1`);
            if (!references.length) await del(previous.logo);
        }
    } catch { console.warn('A replaced team logo could not be cleaned up. The new logo is saved.'); }
    return { saved: true };
}
