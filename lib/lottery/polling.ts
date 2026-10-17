import type { LotteryResponse } from './model';

// Only server-confirmed completion stops polling; a local clock must not skip the final draw.
export function watchLottery(initial: LotteryResponse, id: string | undefined, onData: (data: LotteryResponse) => void,
    onTime: (now: number) => void, onError: (error: boolean) => void) {
    let data = initial;
    let clock = { server: Date.parse(initial.serverNow), received: performance.now() };
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    const active = () => !stopped && document.visibilityState === 'visible' && data.lottery?.phase !== 'complete';
    const updateTime = () => onTime(clock.server + performance.now() - clock.received);
    const startClock = () => {
        clearInterval(tick);
        if (active() && data.lottery) {
            updateTime();
            tick = setInterval(updateTime, 250);
        }
    };
    const pause = () => {
        clearTimeout(timer);
        clearTimeout(timeout);
        clearInterval(tick);
        const request = controller;
        controller = null;
        request?.abort();
    };
    const refresh = async () => {
        if (!active() || controller) return;
        clearTimeout(timer);
        const request = new AbortController();
        controller = request;
        timeout = setTimeout(() => request.abort(), 10_000);
        let delay = 2500;
        try {
            const response = await fetch(`/api/lottery${id ? `?id=${encodeURIComponent(id)}` : ''}`, { cache: 'no-store', signal: request.signal });
            if (!response.ok) throw new Error('Lottery unavailable');
            const next: LotteryResponse = await response.json();
            if (controller !== request || request.signal.aborted) return;
            data = next;
            clock = { server: Date.parse(next.serverNow), received: performance.now() };
            onData(next); onError(false); onTime(clock.server);
            startClock();
            const until = next.lottery ? Date.parse(next.lottery.startsAt) - clock.server : Infinity;
            delay = next.lottery?.phase === 'live' || (next.lottery?.phase === 'scheduled' && until < 15_000) ? 1000 : 15_000;
        } catch {
            if (controller === request) onError(true);
        } finally {
            if (controller === request) {
                clearTimeout(timeout);
                controller = null;
                if (active()) timer = setTimeout(refresh, delay);
            }
        }
    };
    const resume = () => {
        if (!active()) { pause(); return; }
        startClock();
        void refresh();
    };
    resume();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
        stopped = true;
        pause();
        document.removeEventListener('visibilitychange', resume);
        window.removeEventListener('online', resume);
    };
}
