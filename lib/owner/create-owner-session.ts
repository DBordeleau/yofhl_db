import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { getDb, rows } from '@/lib/data/db';
import { saveTeamBranding, saveTeamIdentity, type Actor } from '@/lib/data/curated-edits';
import { parseTeamColours } from '@/lib/team-branding';
import type { KeeperReminderState } from '@/components/keepers/reminder';
import { getKeeperRoster, getKeeperSubmission } from '@/lib/keepers/data';
import { KEEPERS_ENABLED, keepersOpen, submissionStatus } from '@/lib/keepers/model';
import { hashCode, teamName, type ManagedTeam } from './model';
import type { OwnerSessionPorts, OwnerUser } from './ports';
import { claimTeamQuery, rateLimitQuery } from './queries';
import { getOwnedTeam } from './teams';

// The owner session: who is acting (the admin or one owner), which franchise an owner manages, and what
// signing in, claiming and saving do. Server actions are thin wrappers that map the reasons returned here to
// the sentences an owner reads. Permission to edit a franchise stays in the curated edit module.
//
// Every owner-reachable action starts with the preamble, in this order: same-origin check, resolve the
// actor, rate limit. Its own input is validated after it.

const SESSION_COOKIE = 'yofhl_owner';
const HINT_COOKIE = 'yofhl_owner_hint';
const SESSION_MS = 5 * 24 * 60 * 60 * 1000;
const ATTEMPTS = 30;
const FRESH_SIGN_IN_SECONDS = 300;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

type Failed<Reason> = { ok: false; reason: Reason };
type TeamRejection = Extract<Awaited<ReturnType<typeof saveTeamIdentity>>, { ok: false }>['reason'];

export type ClaimRejection = 'invalid-code' | 'code-unavailable' | 'already-owns-team';
export type SaveTeamRejection = 'session-expired' | 'invalid-team' | 'invalid-name' | 'image-too-large'
    | 'image-unreadable' | 'upload-failed' | 'save-failed' | TeamRejection;
export type SaveBrandingRejection = 'session-expired' | 'invalid-team' | 'invalid-branding' | TeamRejection;

/** What the header route returns. */
export interface HeaderAnswer {
    signedIn: boolean;
    team: { name: string; logo: string | null; abbreviation: string } | null;
    keepers: KeeperReminderState | null;
}

export interface SaveTeamInput {
    franchiseId: number;
    version: number;
    name: unknown;
    /** A new logo to upload; null or an empty file keeps the current one. */
    logo?: Blob | null;
}

const isUniqueViolation = (error: unknown): boolean => typeof error === 'object' && error !== null &&
    (('code' in error && error.code === '23505') || ('cause' in error && isUniqueViolation(error.cause)));

const validTeam = (id: number, version: number) => Number.isSafeInteger(id) && id > 0 && Number.isSafeInteger(version) && version >= 0;

/** Whether a logo URL is an upload in this team's own folder, never checked-in or historical artwork. */
const isTeamUpload = (url: string, franchiseId: number) => {
    try { return new URL(url).pathname.startsWith(`/team-logos/${franchiseId}/`); }
    catch { return false; }
};

/** Decode, check and convert an uploaded logo to a WebP at most 512 pixels on a side; null when unreadable. */
async function processLogo(file: Blob): Promise<Buffer | null> {
    try {
        const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16000000, animated: false });
        const { format } = await image.metadata();
        if (!['png', 'jpeg', 'webp'].includes(format ?? '')) return null;
        return await image.rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    } catch { return null; }
}

export function createOwnerSession({ identity, storage, request }: OwnerSessionPorts) {
    // Server Actions also check Origin. This explicit check rejects a missing Origin too, closing sign-in CSRF.
    async function requireSameOrigin() {
        const [origin, host] = [await request.origin(), await request.host()];
        let sent: string | null = null;
        try { sent = origin ? new URL(origin).host : null; } catch { /* a malformed Origin is foreign */ }
        if (!sent || !host || sent !== host) throw new Error('Please reload the page and try again.');
    }

    /** Count an attempt at `action` by `key` (a uid, 'admin', or the client IP when empty); throws past the limit. */
    async function rateLimit(action: string, key = '') {
        const by = key || await request.clientIp();
        await getDb().execute(sql`delete from league.owner_rate_limits where resets_at < now() - interval '1 day'`);
        const [limit] = await rows<{ attempts: number }>(rateLimitQuery(hashCode(`${action}:${by}`)));
        if (limit.attempts > ATTEMPTS) throw new Error('Too many attempts. Please try again in 15 minutes.');
    }

    /** The signed-in owner, checked for revocation, or null. */
    async function currentOwner(): Promise<OwnerUser | null> {
        const cookie = await request.cookie(SESSION_COOKIE);
        return cookie ? identity.verifySession(cookie) : null;
    }

    // The admin, or the signed-in owner; null when neither is signed in.
    async function currentActor(): Promise<Actor | null> {
        if (await request.isAdmin()) return { admin: true };
        const user = await currentOwner();
        return user ? { uid: user.uid } : null;
    }

    /**
     * Start an owner-reachable action: same-origin check, resolve the actor, rate limit. With `team`, only an
     * owner counts and their active team comes back too. Throws for a foreign origin or too many attempts.
     */
    async function preamble(action: string): Promise<{ ok: true; actor: Actor } | Failed<'session-expired'>>;
    async function preamble(action: string, options: { team: true }):
        Promise<{ ok: true; actor: { uid: string }; team: ManagedTeam } | Failed<'session-expired' | 'no-team'>>;
    async function preamble(action: string, options: { team?: boolean } = {}) {
        await requireSameOrigin();
        let actor: Actor | null;
        if (options.team) {
            const user = await currentOwner();
            actor = user && { uid: user.uid };
        } else actor = await currentActor();
        if (!actor) return { ok: false, reason: 'session-expired' };
        await rateLimit(action, 'uid' in actor ? actor.uid : 'admin');
        if (!options.team) return { ok: true, actor };
        const team = await getOwnedTeam((actor as { uid: string }).uid);
        return team ? { ok: true, actor, team } : { ok: false, reason: 'no-team' };
    }

    // An anonymous action (sign-in, claim) has no actor yet, so it is limited by client IP.
    async function anonymousPreamble(action: string) {
        await requireSameOrigin();
        await rateLimit(action);
    }

    async function freshUser(idToken: unknown) {
        if (typeof idToken !== 'string' || idToken.length > 10000) throw new Error('Please sign in again.');
        const user = await identity.verifyIdToken(idToken);
        if (!user.email || Date.now() / 1000 - user.authTime > FRESH_SIGN_IN_SECONDS) throw new Error('Please sign in again.');
        return { ...user, email: user.email };
    }

    const sessionCookie = (httpOnly: boolean) =>
        ({ httpOnly, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_MS / 1000 }) as const;

    // The session hint tells the header a session may exist, so anonymous visitors make no request. It is
    // readable by design and carries no secret. See ADR 0003.
    const setHint = () => request.setCookie(HINT_COOKIE, '1', sessionCookie(false));
    const clearHint = () => request.setCookie(HINT_COOKIE, '', { path: '/', maxAge: 0 });

    async function startSession(idToken: string) {
        const value = await identity.createSession(idToken, SESSION_MS);
        await request.setCookie(SESSION_COOKIE, value, sessionCookie(true));
        await setHint();
    }

    /**
     * What the header shows: whether an owner is signed in, their team and the keeper reminder. Reconciles the
     * hint with the session, which heals owners signed in before the hint existed and clears a dead session's.
     */
    async function headerAnswer(): Promise<HeaderAnswer> {
        const user = await currentOwner();
        const hinted = Boolean(await request.cookie(HINT_COOKIE));
        if (user && !hinted) await setHint();
        if (!user && hinted) await clearHint();
        const team = user ? await getOwnedTeam(user.uid) : null;
        let keepers: HeaderAnswer['keepers'] = null;
        if (KEEPERS_ENABLED && team && keepersOpen()) {
            const submission = await getKeeperSubmission(team.id);
            // An API outage must not make an existing submission look missing. Only the submission status is
            // reported, so the cached live season is enough.
            const current = submission ? await getKeeperRoster(team.id, false).catch(() => null) : null;
            const newerRoster = current && submission && Date.parse(current.fetchedAt) > Date.parse(submission.submittedAt) ? current.roster : undefined;
            keepers = { status: submissionStatus(submission, newerRoster), serverNow: new Date().toISOString() };
        }
        return {
            signedIn: Boolean(user),
            team: team ? { name: team.name, logo: team.logo, abbreviation: team.abbreviation } : null,
            keepers,
        };
    }

    /** Start an owner session from a sign-in no older than five minutes. */
    async function signIn(idToken: string) {
        await anonymousPreamble('sign-in');
        await freshUser(idToken);
        await startSession(idToken);
    }

    async function signOut() {
        await requireSameOrigin();
        await request.setCookie(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
        await clearHint();
    }

    /** Claim the team an invitation code was issued for, signing the owner in first. */
    async function claimTeam(idToken: string, code: unknown): Promise<{ ok: true; franchiseId: number } | Failed<ClaimRejection>> {
        await anonymousPreamble('claim');
        const user = await freshUser(idToken);
        if (typeof code !== 'string' || code.trim().length !== 32) return { ok: false, reason: 'invalid-code' };
        // Create the session before claiming, so a Firebase failure cannot consume a code.
        await startSession(idToken);
        let claimed;
        try { claimed = await rows<{ franchise_id: number }>(claimTeamQuery(hashCode(code), user.uid, user.email)); }
        catch (error) {
            // A concurrent claim by the same account got there first.
            if (isUniqueViolation(error)) return { ok: false, reason: 'already-owns-team' };
            throw error;
        }
        // The statement refuses an expired or used code, and an account that already owns a team.
        return claimed.length ? { ok: true, franchiseId: claimed[0].franchise_id } : { ok: false, reason: 'code-unavailable' };
    }

    /**
     * Save a team's current name and, optionally, a new logo. The logo is uploaded before the database
     * switches URLs; a refused save deletes the upload, a database error keeps it (the outcome is unknown).
     */
    async function saveTeam(input: SaveTeamInput): Promise<{ ok: true } | Failed<SaveTeamRejection>> {
        const start = await preamble('save-team');
        if (!start.ok) return start;
        const { franchiseId: id, version } = input;
        if (!validTeam(id, version)) return { ok: false, reason: 'invalid-team' };
        let name;
        try { name = teamName(input.name); }
        catch { return { ok: false, reason: 'invalid-name' }; }
        let uploaded: string | null = null;
        if (input.logo?.size) {
            if (input.logo.size > MAX_LOGO_BYTES) return { ok: false, reason: 'image-too-large' };
            const logo = await processLogo(input.logo);
            if (!logo) return { ok: false, reason: 'image-unreadable' };
            try { uploaded = await storage.put(`team-logos/${id}/logo.webp`, logo, 'image/webp'); }
            catch { return { ok: false, reason: 'upload-failed' }; }
        }
        let result;
        try { result = await saveTeamIdentity(start.actor, { franchiseId: id, version, name, logoUrl: uploaded }); }
        catch { return { ok: false, reason: 'save-failed' }; }
        if (!result.ok) {
            if (uploaded) await storage.delete(uploaded).catch(() => {});
            return result;
        }
        const orphan = result.orphanedLogoUrl;
        if (orphan && isTeamUpload(orphan, id)) {
            try { await storage.delete(orphan); }
            catch { console.warn('A replaced team logo could not be cleaned up. The new logo is saved.'); }
        }
        return { ok: true };
    }

    /** Save a team's colours and background style. */
    async function saveBranding(franchiseId: number, version: number, value: unknown): Promise<{ ok: true } | Failed<SaveBrandingRejection>> {
        const start = await preamble('save-branding');
        if (!start.ok) return start;
        if (!validTeam(franchiseId, version)) return { ok: false, reason: 'invalid-team' };
        const branding = parseTeamColours(value, franchiseId);
        if (!branding) return { ok: false, reason: 'invalid-branding' };
        return saveTeamBranding(start.actor, franchiseId, version, branding);
    }

    return { requireSameOrigin, currentOwner, preamble, headerAnswer, signIn, signOut, claimTeam, saveTeam, saveBranding };
}

export type OwnerSession = ReturnType<typeof createOwnerSession>;
