'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshFantrax, setWeekFinal } from '@/app/admin/fantrax-actions';
import { periodLabel, periodPhase, selectPeriod, weekName, type LeagueSnapshot } from '@/lib/fantrax/model';

type Snapshot = Pick<LeagueSnapshot, 'seasonYear' | 'fetchedAt' | 'scoringPeriods' | 'finalPeriods'>;

export default function FantraxControls({ snapshot, manualFinals, now }: { snapshot: Snapshot | null; manualFinals: number[]; now: number }) {
    const router = useRouter();
    const [selected, setSelected] = useState(() => snapshot ? selectPeriod(snapshot.scoringPeriods, undefined, now)?.number ?? 1 : 1);
    const [pending, startTransition] = useTransition();
    const [result, setResult] = useState<{ message: string } | { error: string } | null>(null);
    const week = snapshot?.scoringPeriods.find(period => period.number === selected);
    const manual = manualFinals.includes(selected);
    const phase = week ? periodPhase(week, now, snapshot?.finalPeriods) : null;
    const run = (action: () => Promise<{ message: string } | { error: string }>) => {
        setResult(null);
        startTransition(async () => {
            try {
                const value = await action();
                setResult(value);
                if ('message' in value) router.refresh();
            } catch {
                setResult({ error: 'The request failed. Reload the page and try again.' });
            }
        });
    };
    const button = 'min-h-11 rounded-xl bg-ink px-4 text-sm font-bold text-white hover:bg-[#232C4A] disabled:cursor-wait disabled:opacity-50';

    return <section aria-labelledby="fantrax-heading" aria-busy={pending} className="mb-6 rounded-3xl border border-line bg-white p-5 shadow-card">
        <h2 id="fantrax-heading" className="font-wide text-xl font-extrabold">Fantrax</h2>
        <p className="mt-2 text-sm text-ink-soft">Current-season data refreshes daily at 8, 9, 10 and 11:30 p.m. Eastern. Scheduled jobs may arrive up to an hour late.</p>
        <p className="mt-1 text-sm text-ink-soft">{snapshot ? `Last snapshot: ${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(snapshot.fetchedAt))} ET.` : 'The league snapshot is temporarily unavailable.'}</p>
        <button type="button" className={`${button} mt-4`} disabled={pending} onClick={() => run(refreshFantrax)}>Refresh Fantrax</button>
        {snapshot && week && <div className="mt-5 border-t border-line pt-4">
            <label htmlFor="final-week" className="block text-sm font-bold">Matchup week</label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
                <select id="final-week" className="min-h-11 max-w-full rounded-xl border border-line-strong bg-white px-3 text-sm" value={selected} disabled={pending} onChange={event => { setSelected(Number(event.target.value)); setResult(null); }}>
                    {snapshot.scoringPeriods.map(period => <option key={period.number} value={period.number}>{weekName(period.number, snapshot.scoringPeriods.map(item => item.number)).full} · {periodLabel(period)}</option>)}
                </select>
                <span className="text-sm text-ink-soft">{phase === 'complete' ? `Final${manual ? ' (manual)' : ''}` : phase === 'upcoming' ? 'Upcoming' : 'In progress'}</span>
                <button type="button" className={button} disabled={pending || phase === 'upcoming'} onClick={() => run(() => setWeekFinal(snapshot.seasonYear, selected, !manual))}>{manual ? 'Clear manual final' : 'Mark week final'}</button>
            </div>
            <p className="mt-2 text-sm text-ink-soft">Regular-season weeks become final when Fantrax posts every scheduled team’s result. Use the manual control for playoffs or an early result. Scores remain open to stat corrections.</p>
        </div>}
        <div className="mt-3 text-sm" aria-live="polite">{pending ? 'Updating Fantrax…' : result && ('error' in result ? <p role="alert" className="text-rink-red">{result.error}</p> : <p>{result.message}</p>)}</div>
    </section>;
}
