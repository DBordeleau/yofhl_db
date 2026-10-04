'use client';

import Link from 'next/link';
import { useState } from 'react';
import TransactionIcon from '@/components/transaction-icon';
import type { DraftSelection } from '@/lib/history/model';
import { formatFpts, seasonLabel } from '@/lib/league';

type Sort = 'points' | 'fpg' | 'overall' | 'player' | 'year';
export default function FranchiseDraft({ picks }: { picks: DraftSelection[] }) {
    const [season, setSeason] = useState('all');
    const [sort, setSort] = useState<Sort>('points');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const changePage = (next: number) => {
        setPage(next);
        document.getElementById('draft-history')?.scrollIntoView({ block: 'start' });
    };
    const years = [...new Set(picks.map((p) => p.year))].sort((a, b) => b - a);
    const filtered = picks.filter((pick) => (season === 'all' || pick.year === Number(season)) && (!query.trim() || pick.player?.toLowerCase().includes(query.trim().toLowerCase())));
    const sorted = [...filtered].sort((a, b) => {
        if (sort === 'points' || sort === 'fpg') {
            if (a[sort] === null && b[sort] !== null) return 1;
            if (a[sort] !== null && b[sort] === null) return -1;
            return (b[sort] ?? 0) - (a[sort] ?? 0) || b.year - a.year || a.overall - b.overall;
        }
        if (sort === 'overall') return a.overall - b.overall || b.year - a.year;
        if (sort === 'player') return (a.player ?? '\uffff').localeCompare(b.player ?? '\uffff') || b.year - a.year;
        return b.year - a.year || a.overall - b.overall;
    });
    const pages = Math.max(1, Math.ceil(sorted.length / 12));
    const visible = sorted.slice((page - 1) * 12, page * 12);
    const selectClass = 'min-h-11 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink';
    return (
        <section id="draft-history" className="mt-9 scroll-mt-6" aria-labelledby="draft-title">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 id="draft-title" className="font-wide text-xl font-extrabold uppercase">Draft history</h2><p className="text-sm text-ink-muted">{picks.filter((p) => p.playerId).length} selections · {years.length} draft classes</p></div>
            <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
                <div className="grid gap-3 border-b border-line-soft bg-ice p-4 sm:grid-cols-[1fr_auto_auto] md:p-5">
                    <label className="min-w-0 text-xs font-bold text-ink-muted">Player<input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search draft picks" className={`${selectClass} mt-1 block w-full`} /></label>
                    <label className="text-xs font-bold text-ink-muted">Draft class<select value={season} onChange={(e) => { setSeason(e.target.value); setPage(1); }} className={`${selectClass} mt-1 block w-full`}><option value="all">All draft classes</option>{years.map((year) => <option key={year} value={year}>{seasonLabel(year)}</option>)}</select></label>
                    <label className="text-xs font-bold text-ink-muted">Sort by<select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setPage(1); }} className={`${selectClass} mt-1 block w-full`}><option value="points">Fantasy points ↓</option><option value="fpg">FP/G ↓</option><option value="overall">Draft position ↑</option><option value="year">Newest draft</option><option value="player">Player A–Z</option></select></label>
                </div>
                <p className="border-b border-line-soft px-4 py-3 text-xs leading-relaxed text-ink-muted md:px-5">Points and FP/G cover the full draft season, regardless of roster moves. The 2018–19 draft export is unavailable.</p>
                <div role="table" aria-label="Franchise draft picks">
                    <div role="row" className="grid grid-cols-[40px_minmax(0,1fr)_64px_36px] gap-2 border-b border-ink px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-muted sm:grid-cols-[70px_minmax(0,1fr)_90px_90px_60px] md:px-5">
                        <span role="columnheader">Pick</span><span role="columnheader">Player</span><span role="columnheader" className="hidden sm:block">Season</span><span role="columnheader" aria-sort={sort === 'points' ? 'descending' : undefined} className="text-right">FPts</span><span role="columnheader" aria-sort={sort === 'fpg' ? 'descending' : undefined} className="text-right">FP/G</span>
                    </div>
                    {visible.map((pick) => <div key={`${pick.year}-${pick.overall}`} role="row" className="grid grid-cols-[40px_minmax(0,1fr)_64px_36px] items-center gap-2 border-b border-line-soft px-4 py-4 last:border-0 hover:bg-rink-wash/40 sm:grid-cols-[70px_minmax(0,1fr)_90px_90px_60px] md:px-5">
                        <div role="cell"><span className="font-narrow tabular text-xl font-extrabold text-gold-deep">#{pick.overall}</span><span className="mt-1 block text-[10px] font-bold uppercase text-ink-muted">Rd {pick.round}</span></div>
                        <div role="cell" className="min-w-0">{pick.playerId ? <Link href={`/player/${encodeURIComponent(pick.playerId)}`} className="text-sm font-extrabold hover:text-rink-blue hover:underline md:text-base">{pick.player}</Link> : <span className="text-xs font-semibold text-ink-muted">No player recorded</span>}<div className="mt-1 text-xs text-ink-muted">{pick.positions.replaceAll(',', ' · ')}<span className="block sm:hidden">{seasonLabel(pick.year)}</span></div></div>
                        <span role="cell" className="hidden text-xs font-semibold text-ink-muted sm:block">{seasonLabel(pick.year)}</span>
                        <span role="cell" className="tabular text-right text-sm font-extrabold">{pick.points === null ? <span className="text-ink-faint" title="No season stats available">—</span> : formatFpts(pick.points)}</span>
                        <span role="cell" className="tabular text-right text-xs font-semibold text-ink-muted">{pick.fpg === null ? '—' : pick.fpg.toFixed(2)}</span>
                    </div>)}
                </div>
                {!visible.length && <div className="flex flex-col items-center gap-3 px-4 py-10 text-sm text-ink-muted"><TransactionIcon kind="draft" className="h-9 w-9 text-ink-faint" /><p>{picks.length ? 'No draft picks match these filters.' : 'No draft records are available for this franchise.'}</p></div>}
                {sorted.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft bg-ice px-4 py-4 md:px-5"><p className="text-xs text-ink-muted" aria-live="polite">{sorted.length} draft slots · Page {page} of {pages}</p><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => changePage(page - 1)} className="min-h-11 rounded-xl border border-line bg-white px-3 text-sm font-bold disabled:opacity-40">Previous</button><button type="button" disabled={page >= pages} onClick={() => changePage(page + 1)} className="min-h-11 rounded-xl border border-line bg-white px-3 text-sm font-bold disabled:opacity-40">Next</button></div></div>}
            </div>
        </section>
    );
}
