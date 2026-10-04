'use client';

import { useEffect, useRef, useState } from 'react';
import type { LotteryResponse } from '@/lib/lottery/model';

// Refreshes use server time plus elapsed monotonic time, not the viewer's wall clock.
export function useLottery(initial: LotteryResponse, id?: string, unavailable = false) {
    const [data, setData] = useState(initial);
    const [now, setNow] = useState(new Date(initial.serverNow).getTime());
    const [error, setError] = useState(unavailable);
    const clock = useRef({ server: new Date(initial.serverNow).getTime(), received: 0 });
    useEffect(() => {
        setData(initial);
        setNow(new Date(initial.serverNow).getTime());
        clock.current = { server: new Date(initial.serverNow).getTime(), received: performance.now() };
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        let controller: AbortController | null = null;
        const tick = setInterval(() => setNow(clock.current.server + performance.now() - clock.current.received), 250);
        const refresh = async () => {
            if (stopped) return;
            clearTimeout(timer);
            controller?.abort();
            const request = new AbortController();
            controller = request;
            const timeout = setTimeout(() => request.abort(), 10_000);
            let delay = 2500;
            try {
                const response = await fetch(`/api/lottery${id ? `?id=${id}` : ''}`, { cache: 'no-store', signal: request.signal });
                if (!response.ok) throw new Error('Lottery unavailable');
                const next: LotteryResponse = await response.json();
                if (stopped || controller !== request) return;
                clock.current = { server: new Date(next.serverNow).getTime(), received: performance.now() };
                setData(next); setError(false); setNow(clock.current.server);
                const until = next.lottery ? new Date(next.lottery.startsAt).getTime() - clock.current.server : Infinity;
                delay = next.lottery?.phase === 'live' || (next.lottery?.phase === 'scheduled' && until < 15_000) ? 1000 : 15_000;
            } catch {
                if (!stopped && controller === request) setError(true);
            } finally {
                clearTimeout(timeout);
                if (!stopped && controller === request) timer = setTimeout(refresh, delay);
            }
        };
        const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
        void refresh();
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', onVisible);
        return () => { stopped = true; clearTimeout(timer); clearInterval(tick); controller?.abort(); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible); };
    }, [id, initial]);
    return { data, now, error };
}
