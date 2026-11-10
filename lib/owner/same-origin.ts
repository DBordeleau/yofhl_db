import { headers } from 'next/headers';

// Server Actions also check Origin. This explicit check rejects a missing Origin too, closing sign-in CSRF.

/** Throw unless the Origin header names the host the request was sent to. */
export function assertSameOrigin(origin: string | null, host: string | null) {
    let sent: string | null = null;
    try { sent = origin ? new URL(origin).host : null; } catch { /* a malformed Origin is foreign */ }
    if (!sent || !host || sent !== host) throw new Error('Please reload the page and try again.');
}

/** The host the request was sent to: X-Forwarded-Host, then Host. */
export async function requestHost() {
    const h = await headers();
    return h.get('x-forwarded-host') ?? h.get('host');
}

/** Reject a request whose Origin is missing or foreign. */
export async function requireSameOrigin() {
    assertSameOrigin((await headers()).get('origin'), await requestHost());
}
