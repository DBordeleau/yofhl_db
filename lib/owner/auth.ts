import { cookies, headers } from 'next/headers';
import { sql } from 'drizzle-orm';
import { ownerAuth } from './firebase-admin';
import { rows, getDb } from '@/lib/data/db';
import { hashCode } from './model';
import { rateLimitQuery } from './queries';

const COOKIE = 'yofhl_owner';
const EXPIRES_MS = 5 * 24 * 60 * 60 * 1000;

export async function ownerSession() {
    const value = (await cookies()).get(COOKIE)?.value;
    if (!value) return null;
    try { return await ownerAuth().verifySessionCookie(value, true); }
    catch { return null; }
}

// Server Actions also check Origin. This explicit check rejects missing Origin and
// covers all session/claim/edit actions, including sign-in CSRF.
export async function requireSameOrigin() {
    const h = await headers();
    const origin = h.get('origin');
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (!origin || !host || new URL(origin).host !== host) throw new Error('Please reload the page and try again.');
}

export async function limitOwnerAction(action: string, uid = '') {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    await getDb().execute(sql`delete from league.owner_rate_limits where resets_at < now() - interval '1 day'`);
    const [limit] = await rows<{ attempts: number }>(rateLimitQuery(hashCode(`${action}:${uid || ip}`)));
    if (limit.attempts > 30) throw new Error('Too many attempts. Please try again in 15 minutes.');
}

export async function freshOwnerToken(idToken: string) {
    if (typeof idToken !== 'string' || idToken.length > 10000) throw new Error('Please sign in again.');
    const user = await ownerAuth().verifyIdToken(idToken, true);
    if (!user.email || Date.now() / 1000 - user.auth_time > 300) throw new Error('Please sign in again.');
    return user;
}

export async function startOwnerSession(idToken: string) {
    const value = await ownerAuth().createSessionCookie(idToken, { expiresIn: EXPIRES_MS });
    (await cookies()).set(COOKIE, value, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
        path: '/', maxAge: EXPIRES_MS / 1000,
    });
}

export async function clearOwnerSession() {
    (await cookies()).set(COOKIE, '', { path: '/', maxAge: 0 });
}
