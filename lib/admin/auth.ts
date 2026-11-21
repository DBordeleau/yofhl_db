import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { getDb, rows } from '@/lib/data/db';
import { hashCode } from '@/lib/owner/model';
import { rateLimitCleanupQuery, rateLimitQuery } from '@/lib/owner/queries';
import { requireSameOrigin } from '@/lib/owner/same-origin';

// Admin sign-in for /admin. Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD; the session is a
// signed, expiring, HttpOnly cookie scoped to /admin. ADMIN_SESSION_SECRET (optional) signs it,
// falling back to the password, so changing either signs everyone out.

const COOKIE = 'yofhl_admin';
const SESSION_SECONDS = 60 * 60 * 12;
export const ADMIN_LOGIN_IP_LIMIT = 10;
export const ADMIN_LOGIN_GLOBAL_LIMIT = 30;

export const safeAdminNext = (next: string) =>
    next === '/admin' || next.startsWith('/admin/') ? next : '/admin';

export const adminClientIp = async () => {
    const h = await headers();
    return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || 'local';
};

/**
 * Count an admin login attempt against league.owner_rate_limits (per-IP and global 15-minute buckets).
 * Returns false once either limit is exceeded.
 */
export async function consumeAdminLoginAttempt(ip: string): Promise<boolean> {
    await getDb().execute(rateLimitCleanupQuery);
    const [byIp] = await rows<{ attempts: number }>(rateLimitQuery(hashCode(`admin-login:${ip}`)));
    if (byIp.attempts > ADMIN_LOGIN_IP_LIMIT) return false;
    const [global] = await rows<{ attempts: number }>(rateLimitQuery(hashCode('admin-login:global')));
    return global.attempts <= ADMIN_LOGIN_GLOBAL_LIMIT;
}

export const adminConfigured = () => Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);

const signingKey = () => process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '';

const sign = (payload: string) => createHmac('sha256', signingKey()).update(payload).digest('base64url');

// compare digests so neither length nor content leaks through timing
const same = (a: string, b: string) =>
    timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export const checkCredentials = (username: string, password: string) => {
    if (!adminConfigured()) return false;
    const userOk = same(username, process.env.ADMIN_USERNAME!);
    const passOk = same(password, process.env.ADMIN_PASSWORD!);
    return userOk && passOk;
};

export const startSession = async () => {
    const expires = String(Date.now() + SESSION_SECONDS * 1000);
    (await cookies()).set(COOKIE, `${expires}.${sign(expires)}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/admin',
        maxAge: SESSION_SECONDS,
    });
};

export const endSession = async () => {
    (await cookies()).set(COOKIE, '', { path: '/admin', maxAge: 0 });
};

export const isAdmin = async () => {
    if (!adminConfigured()) return false;
    const value = (await cookies()).get(COOKIE)?.value;
    if (!value) return false;
    const [expires, signature] = value.split('.');
    if (!expires || !signature || Number(expires) < Date.now()) return false;
    return same(signature, sign(expires));
};

// every admin server action starts with this
export const requireAdmin = async () => {
    await requireSameOrigin();
    if (!(await isAdmin())) throw new Error('Your admin session has expired. Sign in again.');
};
