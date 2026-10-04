'use client';

import { useMemo, useState } from 'react';
import LotteryRoom from '@/components/lottery/lottery-room';
import { finalRevealAt, INTRO_MS, publicLottery, type LotteryEntry, type LotteryRecord } from '@/lib/lottery/model';
import '@/app/lottery/lottery.css';

export default function LotteryPreview({ title, entries }: { title: string; entries: LotteryEntry[] }) {
    const [mode, setMode] = useState<'countdown' | 'reveal' | 'winner'>('countdown');
    const [start] = useState(() => Date.now() + 7200_000);
    const initial = useMemo(() => {
        const record: LotteryRecord = {
            id: 'preview', title: title || 'YOFHL Draft Lottery', startsAt: new Date(start).toISOString(),
            entries, version: 1, isCurrent: false, cancelledAt: null, drawnAt: null,
            winnerId: entries.find((entry) => entry.odds !== null)?.id ?? entries[0].id,
        };
        const now = mode === 'countdown' ? start - 7200_000 : mode === 'reveal' ? start + INTRO_MS + 1500 : finalRevealAt(record.startsAt, entries) + 1000;
        return { serverNow: new Date(now).toISOString(), lottery: publicLottery(record, now) };
    }, [entries, mode, start, title]);
    return <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-wide text-lg font-extrabold">Presentation preview</h2><p className="mt-1 text-xs text-ink-muted">Sample result only. This does not schedule or draw a lottery.</p></div>
            <div className="flex gap-1 rounded-xl bg-line-soft p-1">{(['countdown', 'reveal', 'winner'] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`min-h-11 rounded-lg px-3 text-xs font-bold capitalize ${mode === value ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'}`}>{value}</button>)}</div>
        </div>
        <LotteryRoom initial={initial} preview />
    </section>;
}
