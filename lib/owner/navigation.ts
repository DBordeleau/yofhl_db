'use client';

import { useEffect, useState } from 'react';
import type { KeeperReminderState } from '@/components/keepers/reminder';

const UPDATED = 'yofhl:owner-updated';
export const refreshOwnerNavigation = () => window.dispatchEvent(new Event(UPDATED));

export interface OwnerNavigation {
    signedIn: boolean;
    team: { name: string; logo: string | null; abbreviation: string } | null;
    keepers?: KeeperReminderState | null;
}

// The root header survives route changes. Focus can refresh stale state, while explicit
// sign-in, sign-out, claim and save events always bypass the one-minute freshness window.
export function watchOwnerNavigation(onChange: (owner: OwnerNavigation) => void) {
    let controller: AbortController | null = null;
    let lastAttempt = -Infinity;
    const refresh = async (force = false) => {
        if (!force && (controller || Date.now() - lastAttempt < 60_000)) return;
        controller?.abort();
        const request = new AbortController();
        controller = request;
        lastAttempt = Date.now();
        const timeout = setTimeout(() => request.abort(), 10_000);
        try {
            const response = await fetch('/api/owner', { cache: 'no-store', signal: request.signal });
            if (!response.ok) return;
            const data: OwnerNavigation = await response.json();
            if (!request.signal.aborted) onChange(data);
        } catch { /* Keep the last known account state during a transient outage. */ }
        finally {
            clearTimeout(timeout);
            if (controller === request) controller = null;
        }
    };
    const onUpdated = () => { void refresh(true); };
    const onFocus = () => { void refresh(); };
    void refresh();
    window.addEventListener(UPDATED, onUpdated);
    window.addEventListener('focus', onFocus);
    return () => {
        controller?.abort();
        window.removeEventListener(UPDATED, onUpdated);
        window.removeEventListener('focus', onFocus);
    };
}

// Load the private session separately so public league pages can stay cached.
export function useOwnerNavigation() {
    const [owner, setOwner] = useState<OwnerNavigation>({ signedIn: false, team: null });
    useEffect(() => watchOwnerNavigation(setOwner), []);
    return owner;
}
