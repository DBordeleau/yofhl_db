import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

// Admin sign-in for /admin. Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD; the session is a
// signed, expiring, HttpOnly cookie scoped to /admin. ADMIN_SESSION_SECRET (optional) signs it,
// falling back to the password, so changing either signs everyone out.

const COOKIE = 'yofhl_admin';
const SESSION_SECONDS = 60 * 60 * 12;

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
    if (!(await isAdmin())) throw new Error('Your admin session has expired. Sign in again.');
};
