'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { KeeperReminderState } from '@/components/keepers/reminder';

const UPDATED = 'yofhl:owner-updated';
export const refreshOwnerNavigation = () => window.dispatchEvent(new Event(UPDATED));

interface OwnerNavigation {
    signedIn: boolean;
    team: { name: string; logo: string | null; abbreviation: string } | null;
    keepers?: KeeperReminderState | null;
}

// Load the private session separately so public league pages can stay cached.
export function useOwnerNavigation() {
    const pathname = usePathname();
    const [owner, setOwner] = useState<OwnerNavigation>({ signedIn: false, team: null });
    useEffect(() => {
        let controller: AbortController;
        const refresh = async () => {
            controller?.abort();
            const request = new AbortController();
            controller = request;
            try {
                const response = await fetch('/api/owner', { cache: 'no-store', signal: request.signal });
                if (!response.ok) return;
                const data: OwnerNavigation = await response.json();
                if (!request.signal.aborted) setOwner(data);
            } catch { /* Keep the last known account state during a transient outage. */ }
        };
        void refresh();
        window.addEventListener(UPDATED, refresh);
        window.addEventListener('focus', refresh);
        return () => {
            controller?.abort();
            window.removeEventListener(UPDATED, refresh);
            window.removeEventListener('focus', refresh);
        };
    }, [pathname]);
    return owner;
}
