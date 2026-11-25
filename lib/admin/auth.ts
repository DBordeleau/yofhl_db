import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { getDb, rows } from '@/lib/data/db';
import { hashCode } from '@/lib/owner/model';
import { rateLimitAttemptsQuery, rateLimitCleanupQuery, rateLimitQuery } from '@/lib/owner/queries';
import { requireSameOrigin, SameOriginError } from '@/lib/owner/same-origin';

// Admin sign-in for /admin. Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD; the session is a
// signed, expiring, HttpOnly cookie scoped to /admin. ADMIN_SESSION_SECRET (optional) signs it,
// falling back to the password, so changing either signs everyone out.

const COOKIE = 'yofhl_admin';
const SESSION_SECONDS = 60 * 60 * 12;
export const ADMIN_LOGIN_IP_LIMIT = 10;

export const safeAdminNext = (next: string) =>
    next === '/admin' || next.startsWith('/admin/') ? next : '/admin';

export const adminClientIp = async () => {
    const h = await headers();
    return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || 'local';
};

const loginLimitKey = (ip: string) => hashCode(`admin-login:${ip}`);

/**
 * Read-only check for whether `ip` is below the 15-minute failed login limit (`ADMIN_LOGIN_IP_LIMIT`).
 * Permits up to `ADMIN_LOGIN_IP_LIMIT` failed attempts in the active window; returns false once
 * recorded failures reach `ADMIN_LOGIN_IP_LIMIT` without modifying the database.
 */
export async function isAdminLoginAllowed(ip: string): Promise<boolean> {
    const [row] = await rows<{ attempts: number }>(rateLimitAttemptsQuery(loginLimitKey(ip)));
    return (row?.attempts ?? 0) < ADMIN_LOGIN_IP_LIMIT;
}

/**
 * Record one failed admin login attempt for `ip` in the 15-minute bucket.
 * Returns whether further attempts remain permitted (`attempts < ADMIN_LOGIN_IP_LIMIT`).
 */
export async function recordAdminLoginFailure(ip: string): Promise<boolean> {
    await getDb().execute(rateLimitCleanupQuery);
    const [row] = await rows<{ attempts: number }>(rateLimitQuery(loginLimitKey(ip)));
    return row.attempts < ADMIN_LOGIN_IP_LIMIT;
}

export interface AdminLoginPorts {
    checkOrigin?: () => Promise<void>;
    clientIp?: () => Promise<string>;
    issueSession?: () => Promise<void>;
    slowDown?: () => Promise<void>;
}

/**
 * Run the admin sign-in checks in order: same-origin verification (returning an error on mismatch),
 * read-only per-IP failure-limit check, credential check, and recording a failure only when
 * credentials are wrong. Valid logins and blocked attempts never increment the failure counter.
 */
export async function attemptAdminLogin(
    { username, password, next }: { username: string; password: string; next: string },
    {
        checkOrigin = requireSameOrigin,
        clientIp = adminClientIp,
        issueSession = startSession,
        slowDown = () => new Promise((resolve) => setTimeout(resolve, 800)),
    }: AdminLoginPorts = {},
): Promise<{ ok: true; redirectTo: string } | { ok: false; error: string }> {
    try { await checkOrigin(); }
    catch (error) {
        if (error instanceof SameOriginError) return { ok: false, error: error.message };
        throw error;
    }
    const ip = await clientIp();
    if (!(await isAdminLoginAllowed(ip))) {
        return { ok: false, error: 'Too many sign-in attempts. Please try again in 15 minutes.' };
    }
    if (!checkCredentials(username, password)) {
        await recordAdminLoginFailure(ip);
        await slowDown();
        return { ok: false, error: 'That username and password combination is incorrect.' };
    }
    await issueSession();
    return { ok: true, redirectTo: safeAdminNext(next) };
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
