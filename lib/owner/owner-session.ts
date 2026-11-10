import { cookies, headers } from 'next/headers';
import { del, put } from '@vercel/blob';
import { isAdmin } from '@/lib/admin/auth';
import { createOwnerSession } from './create-owner-session';
import { ownerAuth } from './firebase-admin';
import type { IdentityPort, LogoStoragePort, RequestPort } from './ports';

// The owner session wired to production: Firebase Authentication, Vercel Blob and next/headers.

const firebaseIdentity: IdentityPort = {
    async verifySession(cookie) {
        try {
            const user = await ownerAuth().verifySessionCookie(cookie, true);
            return { uid: user.uid, email: user.email ?? null };
        } catch { return null; }
    },
    async verifyIdToken(idToken) {
        const user = await ownerAuth().verifyIdToken(idToken, true);
        return { uid: user.uid, email: user.email ?? null, authTime: user.auth_time };
    },
    createSession: (idToken, expiresIn) => ownerAuth().createSessionCookie(idToken, { expiresIn }),
};

const blobStorage: LogoStoragePort = {
    async put(pathname, body, contentType) {
        return (await put(pathname, body, { access: 'public', addRandomSuffix: true, contentType })).url;
    },
    delete: url => del(url),
};

const nextRequest: RequestPort = {
    origin: async () => (await headers()).get('origin'),
    host: async () => {
        const h = await headers();
        return h.get('x-forwarded-host') ?? h.get('host');
    },
    clientIp: async () => (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'local',
    cookie: async name => (await cookies()).get(name)?.value,
    setCookie: async (name, value, options) => { (await cookies()).set(name, value, options); },
    isAdmin,
};

export const ownerSession = createOwnerSession({ identity: firebaseIdentity, storage: blobStorage, request: nextRequest });
