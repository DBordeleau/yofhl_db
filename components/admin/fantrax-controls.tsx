'use client';

import { useState } from 'react';
import { refreshFantrax, setWeekFinal } from '@/app/admin/fantrax-actions';
import { ADMIN_BUTTON as button, AdminActionStatus, easternTime, useAdminAction } from './admin-action';
import { weekLabel } from '@/lib/live-season-display';
import type { Week } from '@/lib/fantrax/live-season';

type Season = { fetchedAt: string; weeks: Pick<Week, 'number' | 'startDate' | 'endDate' | 'fullName' | 'phase' | 'manualFinal'>[]; currentWeek: number };

export default function FantraxControls({ season }: { season: Season | null }) {
    const [selected, setSelected] = useState(() => season?.currentWeek ?? 1);
    const { pending, result, run, clearResult } = useAdminAction();
    const week = season?.weeks.find(item => item.number === selected);

    return <section aria-labelledby="fantrax-heading" aria-busy={pending} className="mb-6 rounded-3xl border border-line bg-white p-5 shadow-card">
        <h2 id="fantrax-heading" className="font-wide text-xl font-extrabold">Fantrax</h2>
        <p className="mt-2 text-sm text-ink-soft">Current-season data refreshes daily at 8, 9, 10 and 11:30 p.m. Eastern. Scheduled jobs may arrive up to an hour late.</p>
        <p className="mt-1 text-sm text-ink-soft">{season ? `Last snapshot: ${easternTime(season.fetchedAt)}.` : 'The league snapshot is temporarily unavailable.'}</p>
        <button type="button" className={`${button} mt-4`} disabled={pending} onClick={() => run(refreshFantrax)}>Refresh Fantrax</button>
        {season && week && <div className="mt-5 border-t border-line pt-4">
            <label htmlFor="final-week" className="block text-sm font-bold">Matchup week</label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
                <select id="final-week" className="min-h-11 max-w-full rounded-xl border border-line-strong bg-white px-3 text-sm" value={selected} disabled={pending} onChange={event => { setSelected(Number(event.target.value)); clearResult(); }}>
                    {season.weeks.map(item => <option key={item.number} value={item.number}>{item.fullName} · {weekLabel(item)}</option>)}
                </select>
                <span className="text-sm text-ink-soft">{week.phase === 'final' ? `Final${week.manualFinal ? ' (manual)' : ''}` : week.phase === 'upcoming' ? 'Upcoming' : 'In progress'}</span>
                <button type="button" className={button} disabled={pending || week.phase === 'upcoming'} onClick={() => run(() => setWeekFinal(selected, !week.manualFinal))}>{week.manualFinal ? 'Clear manual final' : 'Mark week final'}</button>
            </div>
            <p className="mt-2 text-sm text-ink-soft">Regular-season weeks become final when Fantrax posts every scheduled team’s result. Use the manual control for playoffs or an early result. Scores remain open to stat corrections.</p>
        </div>}
        <AdminActionStatus pending={pending} pendingText="Updating Fantrax…" result={result} />
    </section>;
}
