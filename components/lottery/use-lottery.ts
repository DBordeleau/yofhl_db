'use client';

import { useEffect, useState } from 'react';
import type { LotteryResponse } from '@/lib/lottery/model';
import { watchLottery } from '@/lib/lottery/polling';

// Refreshes use server time plus elapsed monotonic time, not the viewer's wall clock.
export function useLottery(initial: LotteryResponse, id?: string, unavailable = false) {
    const [data, setData] = useState(initial);
    const [now, setNow] = useState(new Date(initial.serverNow).getTime());
    const [error, setError] = useState(unavailable);
    useEffect(() => {
        setData(initial);
        setNow(new Date(initial.serverNow).getTime());
        setError(unavailable);
        return watchLottery(initial, id, setData, setNow, setError);
    }, [id, initial, unavailable]);
    return { data, now, error };
}
