'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { easternInput, formatEastern, navVisible, type PublicLottery } from '@/lib/lottery/model';

type Summary = Pick<PublicLottery, 'id' | 'startsAt' | 'endsAt' | 'phase'>;

export default function LotteryNavLink() {
    const [event, setEvent] = useState<Summary | null>(null);
    const [now, setNow] = useState(0);
    useEffect(() => {
        let stopped = false;
        let fetching = false;
        let server = 0;
        let received = 0;
        const refresh = async () => {
            if (fetching) return;
            fetching = true;
            try {
                const response = await fetch('/api/lottery?summary=1', { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
                if (!response.ok) return;
                const data = await response.json();
                if (stopped) return;
                server = new Date(data.serverNow).getTime(); received = performance.now();
                setNow(server); setEvent(data.lottery);
            } catch { /* Keep the last known event through a transient outage. */ }
            finally { fetching = false; }
        };
        void refresh();
        const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30_000);
        const tick = setInterval(() => { if (server) setNow(server + performance.now() - received); }, 1000);
        const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
        document.addEventListener('visibilitychange', visible);
        return () => { stopped = true; clearInterval(timer); clearInterval(tick); document.removeEventListener('visibilitychange', visible); };
    }, []);
    if (!event || !navVisible(event, now)) return null;
    const until = new Date(event.startsAt).getTime() - now;
    // Keep the 7:30 PM event live in navigation until 7:35 PM Eastern,
    // independently of the shorter draw animation.
    const complete = now >= new Date(event.startsAt).getTime() + 5 * 60_000;
    const live = !complete && until <= 0;
    const minutes = Math.max(1, Math.ceil(until / 60_000));
    const badge = complete ? 'Concluded' : live ? 'Live' : minutes >= 60 ? `In ${Math.floor(minutes / 60)}h ${minutes % 60}m` : `In ${minutes}m`;
    return <Link href="/lottery" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl text-xs font-bold text-ink hover:bg-rink-wash sm:gap-2 sm:px-2 sm:text-[13px] lg:px-3 lg:text-sm" title={formatEastern(event.startsAt)}>
        <span>{easternInput(event.startsAt).slice(0, 4)} Draft Lottery</span> <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-extrabold ${live ? 'bg-rink-red text-white' : 'bg-gold-tint text-gold-deep'}`}>
            {live && <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden="true" />}{badge}
        </span>
    </Link>;
}
