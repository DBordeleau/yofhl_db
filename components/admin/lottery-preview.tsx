'use client';

import { useEffect, useState } from 'react';
import { LotteryPresentation } from '@/components/lottery/lottery-room';
import { easternToIso, finalRevealAt, FINALE_MS, publicLottery, type LotteryEntry, type LotteryRecord } from '@/lib/lottery/model';
import '@/app/lottery/lottery.css';

const COUNTDOWN_MS = 10_000;
const control = 'min-h-11 rounded-xl border border-line-strong bg-white px-4 text-xs font-bold text-ink hover:bg-rink-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-rink-blue';
const timestamp = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export default function LotteryPreview({ title, entries, easternDateTime }: { title: string; entries: LotteryEntry[]; easternDateTime: string }) {
    const [record] = useState<LotteryRecord>(() => {
        let startsAt = new Date(Date.now() + COUNTDOWN_MS).toISOString();
        try { startsAt = easternToIso(easternDateTime); } catch { /* An unscheduled rehearsal uses today's date. */ }
        return {
            id: 'preview', title: title || 'YOFHL Draft Lottery', startsAt,
            entries, version: 1, isCurrent: false, cancelledAt: null, drawnAt: null,
            winnerId: entries.filter((entry) => entry.odds !== null).at(-1)?.id ?? null,
        };
    });
    const [playback, setPlayback] = useState<{ offset: number; startedAt: number | null }>({ offset: 0, startedAt: null });
    const [clock, setClock] = useState(0);
    const begins = new Date(record.startsAt).getTime() - COUNTDOWN_MS;
    const duration = finalRevealAt(record.startsAt, record.entries) + FINALE_MS - begins;
    const elapsed = Math.min(duration, playback.offset + (playback.startedAt === null ? 0 : Math.max(0, clock - playback.startedAt)));
    const playing = playback.startedAt !== null && elapsed < duration;
    const now = begins + elapsed;
    const event = publicLottery(record, now);
    const complete = event.phase === 'complete';

    useEffect(() => {
        if (!playing) return;
        const timer = setInterval(() => setClock(performance.now()), 100);
        return () => clearInterval(timer);
    }, [playing]);

    const play = (offset: number) => {
        const startedAt = performance.now();
        setClock(startedAt);
        setPlayback({ offset, startedAt });
    };
    const pause = (offset: number) => setPlayback({ offset, startedAt: null });

    return <section className="space-y-3" aria-labelledby="preview-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
                <h2 id="preview-title" className="font-wide text-lg font-extrabold">Presentation preview</h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">Play from 10 seconds before the lottery through every pick and the final results, at the live event’s pace. Picks 2 and 1 are announced together.</p>
                <p className="mt-1 text-xs text-ink-muted">Sample result only. This does not schedule or draw a lottery.</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={control} onClick={() => playing ? pause(elapsed) : play(complete ? 0 : elapsed)}>{playing ? 'Pause preview' : complete ? 'Replay preview' : elapsed > 0 ? 'Resume preview' : 'Play full preview'}</button>
                <button type="button" className={control} onClick={() => play(0)}>Restart from 10 seconds</button>
                <button type="button" className={control} onClick={() => pause(duration)}>View concluded lottery</button>
            </div>
        </div>
        <div className="flex items-center gap-3">
            <progress aria-label="Preview playback" max={duration} value={elapsed} className="h-2 min-w-0 flex-1 accent-rink-blue" />
            <span className="shrink-0 text-xs tabular-nums text-ink-muted">{timestamp(elapsed)} / {timestamp(duration)}</span>
        </div>
        <p role="status" className="text-xs font-semibold text-ink-muted">{complete ? 'Lottery concluded — final results remain below.' : playing ? 'Playing preview at real speed' : 'Preview paused'}</p>
        <LotteryPresentation event={event} now={now} preview />
    </section>;
}
