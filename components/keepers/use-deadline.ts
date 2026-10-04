'use client';

import { useEffect, useState } from 'react';
import { KEEPER_DEADLINE } from '@/lib/keepers/model';

// Use the server's clock; also recheck after returning to a backgrounded tab.
export function useKeeperDeadline(serverNow: string) {
    const [closed, setClosed] = useState(() => Date.parse(serverNow) >= Date.parse(KEEPER_DEADLINE));
    useEffect(() => {
        const started = performance.now();
        let timer: ReturnType<typeof setTimeout>;
        const check = () => {
            clearTimeout(timer);
            const remaining = Date.parse(KEEPER_DEADLINE) - (Date.parse(serverNow) + performance.now() - started);
            setClosed(remaining <= 0);
            if (remaining > 0) timer = setTimeout(check, Math.min(remaining, 2_147_000_000));
        };
        check();
        window.addEventListener('focus', check);
        document.addEventListener('visibilitychange', check);
        return () => { clearTimeout(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
    }, [serverNow]);
    return closed;
}
