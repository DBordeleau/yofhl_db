'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin/auth';
import { rows } from '@/lib/data/db';
import type { ClaimRejection, SaveBrandingRejection, SaveTeamRejection } from '@/lib/owner/create-owner-session';
import { hashCode, invitation } from '@/lib/owner/model';
import { ownerSession } from '@/lib/owner/owner-session';
import { issueInviteQuery } from '@/lib/owner/queries';

const claimMessages: Record<ClaimRejection, string> = {
    'invalid-code': 'That invitation is invalid or expired. Ask the commissioner for a new code.',
    'code-unavailable': 'This code is expired, already used, or this account already owns a team.',
    'already-owns-team': 'This account already owns a team.',
};

const saveMessages: Record<SaveTeamRejection | SaveBrandingRejection, string> = {
    'session-expired': 'Your session has expired. Please sign in again.',
    'invalid-team': 'Invalid team.',
    'invalid-name': 'Use a team name between 2 and 60 characters.',
    'invalid-branding': 'Choose three six-digit hex colours and a background style available to your team.',
    'image-too-large': 'Choose a PNG, JPEG or WebP image smaller than 2 MB.',
    'image-unreadable': 'That image could not be read. Choose a PNG, JPEG or WebP up to 16 megapixels.',
    'upload-failed': 'The logo could not be uploaded. Your changes have not been saved; please try again.',
    'save-failed': 'Could not save your team. Please try again.',
    'unknown-team': 'That team no longer exists.',
    'not-owner': 'You cannot edit this team.',
    defunct: 'This team has folded, so its identity is final.',
    'stale-version': 'This team changed since you opened it. Reload before saving.',
};

const refresh = () => {
    revalidatePath('/owner');
    revalidatePath('/admin/teams');
    revalidatePath('/owner/branding');
};

export async function saveTeamBranding(id: number, version: number, value: unknown) {
    const result = await ownerSession.saveBranding(id, version, value);
    if (!result.ok) return { error: saveMessages[result.reason] };
    refresh();
    revalidatePath(`/admin/teams/${id}/branding`);
    return { saved: true };
}

export async function signInOwner(idToken: string) {
    await ownerSession.signIn(idToken);
}

export async function claimTeam(idToken: string, code: string) {
    const result = await ownerSession.claimTeam(idToken, code);
    if (!result.ok) return { error: claimMessages[result.reason] };
    refresh();
    return { saved: true };
}

export async function signOutOwner() {
    await ownerSession.signOut();
}

export async function createTeamInvitation(id: number) {
    await ownerSession.requireSameOrigin();
    await requireAdmin();
    if (!Number.isSafeInteger(id)) throw new Error('Invalid team.');
    const code = invitation();
    const result = await rows(issueInviteQuery(id, hashCode(code)));
    if (!result.length) return { error: 'Only an unclaimed, active team can receive an invitation.' };
    revalidatePath('/admin/teams');
    return { code };
}

export async function saveTeam(form: FormData) {
    const logo = form.get('logo');
    const result = await ownerSession.saveTeam({
        franchiseId: Number(form.get('id')),
        version: Number(form.get('version')),
        name: form.get('name'),
        logo: logo instanceof File ? logo : null,
    });
    if (!result.ok) return { error: saveMessages[result.reason] };
    refresh();
    return { saved: true };
}
