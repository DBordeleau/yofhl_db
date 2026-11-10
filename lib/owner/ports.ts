// The owner session module's outside world. Production adapters live in owner-session.ts; tests use the
// in-memory stand-ins in memory-ports.ts.

/** A verified Firebase user. */
export interface OwnerUser {
    uid: string;
    email: string | null;
}

/** Firebase Authentication. */
export interface IdentityPort {
    /** The user a session cookie belongs to, checked for revocation; null when it is invalid, expired or revoked. */
    verifySession(cookie: string): Promise<OwnerUser | null>;
    /** A client ID token, checked for revocation. Throws when it is invalid. `authTime` is in seconds. */
    verifyIdToken(idToken: string): Promise<OwnerUser & { authTime: number }>;
    /** Mint a session cookie value from a fresh ID token. */
    createSession(idToken: string, expiresInMs: number): Promise<string>;
}

/** Vercel Blob, for uploaded team logos. */
export interface LogoStoragePort {
    /** Store a public file under `pathname` (a random suffix is added) and return its URL. */
    put(pathname: string, body: Buffer, contentType: string): Promise<string>;
    delete(url: string): Promise<void>;
}

export interface CookieOptions {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict';
    path: string;
    maxAge: number;
}

/** The incoming request (next/headers). */
export interface RequestPort {
    /** The Origin header, if any. */
    origin(): Promise<string | null>;
    /** The host the request was sent to (X-Forwarded-Host, then Host). */
    host(): Promise<string | null>;
    /** The first X-Forwarded-For address, or 'local'. */
    clientIp(): Promise<string>;
    cookie(name: string): Promise<string | undefined>;
    setCookie(name: string, value: string, options: CookieOptions): Promise<void>;
    /** Whether the request carries a valid admin session cookie. */
    isAdmin(): Promise<boolean>;
}

export interface OwnerSessionPorts {
    identity: IdentityPort;
    storage: LogoStoragePort;
    request: RequestPort;
}
