// In-memory stand-ins for the owner session module's ports, for tests. Each returns its port and the state a
// test arranges or checks.
import type { CookieOptions, IdentityPort, LogoStoragePort, OwnerUser, RequestPort } from './ports';

export function createMemoryIdentity() {
    const state = {
        /** ID tokens the client could send: token → user and sign-in time (seconds). */
        tokens: new Map<string, OwnerUser & { authTime: number }>(),
        /** Live session cookies: value → uid. */
        sessions: new Map<string, OwnerUser>(),
        revoked: new Set<string>(),
        /** Calls that fail, as when Firebase is down. A failing session check finds no session. */
        failing: new Set<keyof IdentityPort>(),
        /** How many times a session cookie was checked. */
        sessionChecks: 0,
    };
    let minted = 0;
    const up = (call: keyof IdentityPort) => { if (state.failing.has(call)) throw new Error('Firebase is down'); };
    const port: IdentityPort = {
        async verifySession(cookie) {
            state.sessionChecks++;
            if (state.failing.has('verifySession')) return null;
            const user = state.sessions.get(cookie);
            return user && !state.revoked.has(user.uid) ? { ...user } : null;
        },
        async verifyIdToken(idToken) {
            up('verifyIdToken');
            const user = state.tokens.get(idToken);
            if (!user || state.revoked.has(user.uid)) throw new Error('auth/invalid-id-token');
            return { ...user };
        },
        async createSession(idToken) {
            up('createSession');
            const user = state.tokens.get(idToken);
            if (!user) throw new Error('auth/invalid-id-token');
            const value = `session-${++minted}`;
            state.sessions.set(value, { uid: user.uid, email: user.email });
            return value;
        },
    };
    return {
        port,
        state,
        /** The ID token Firebase's client returns after signing in `secondsAgo` seconds ago. */
        signIn(uid: string, email: string | null = `${uid}@example.test`, secondsAgo = 0) {
            const token = `id-token-${++minted}`;
            state.tokens.set(token, { uid, email, authTime: Math.floor(Date.now() / 1000) - secondsAgo });
            return token;
        },
    };
}

export function createMemoryStorage() {
    const state = {
        /** Stored files by URL. */
        files: new Map<string, Buffer>(),
        /** Uploads fail. */
        down: false,
    };
    let uploads = 0;
    const port: LogoStoragePort = {
        async put(pathname, body) {
            if (state.down) throw new Error('Blob is down');
            const url = `https://blob.test/${pathname.replace(/(\.\w+)$/, `-${++uploads}$1`)}`;
            state.files.set(url, body);
            return url;
        },
        async delete(url) { state.files.delete(url); },
    };
    return { port, state };
}

export function createMemoryRequest() {
    const state = {
        origin: 'https://yofhl.test' as string | null,
        host: 'yofhl.test' as string | null,
        ip: '203.0.113.7',
        /** The request carries a valid admin session cookie. */
        admin: false,
        cookies: new Map<string, { value: string; options?: CookieOptions }>(),
        /** How many times the admin cookie was checked. */
        adminChecks: 0,
    };
    const port: RequestPort = {
        origin: async () => state.origin,
        host: async () => state.host,
        clientIp: async () => state.ip,
        cookie: async name => state.cookies.get(name)?.value,
        async setCookie(name, value, options) {
            if (options.maxAge <= 0) state.cookies.delete(name);
            else state.cookies.set(name, { value, options });
        },
        async isAdmin() { state.adminChecks++; return state.admin; },
    };
    return { port, state };
}
