'use client';

import { playerHref } from '@/lib/player-url';

import Link from 'next/link';
import { useState } from 'react';
import TransactionIcon from '@/components/transaction-icon';
import type { DraftSelection } from '@/lib/history/model';
import { formatFpts, seasonLabel } from '@/lib/league';
import styles from './franchise.module.css';

const PAGE_SIZE = 12;
const GRID = 'grid grid-cols-[48px_minmax(0,1fr)_64px_40px] items-center gap-2 sm:grid-cols-[92px_minmax(0,1fr)_84px_84px_56px] md:gap-4';

type Sort = 'points' | 'fpg' | 'overall' | 'player' | 'year';
export default function FranchiseDraft({ picks, franchiseId, hindsightEnabled = false }: {
    picks: DraftSelection[]; franchiseId?: number; hindsightEnabled?: boolean;
}) {
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
        if (sort === 'player') return (a.player ?? '￿').localeCompare(b.player ?? '￿') || b.year - a.year;
        return b.year - a.year || a.overall - b.overall;
    });
    const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const visible = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    return (
        <section id="draft-history" className={styles.section} aria-labelledby="draft-title">
            <div className={styles.head}><h2 id="draft-title">Draft history</h2></div>
            {hindsightEnabled && franchiseId && years.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="text-sm font-bold">Revisit a draft <span className="font-normal text-ink-muted">· Steals, regrets & redrafts</span></p>
                <nav aria-label="Franchise draft retrospectives" className="flex flex-wrap gap-1.5">
                    {years.map(year => <Link key={year} href={`/season/${year}?draft=steals#draft-class`} className={`${styles.slab} ${styles.slabLight}`}>{seasonLabel(year)}</Link>)}
                </nav>
            </div>}
            <div className={styles.panel}>
                <div className="grid grid-cols-2 gap-2 border-b border-line-soft bg-ice p-3 sm:grid-cols-[minmax(0,1fr)_200px_200px] md:p-4">
                    <label className={`${styles.field} col-span-2 sm:col-span-1`}><span>Player</span><input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search draft picks" /></label>
                    <label className={styles.field}><span>Draft class</span><select value={season} onChange={(e) => { setSeason(e.target.value); setPage(1); }}><option value="all">All draft classes</option>{years.map((year) => <option key={year} value={year}>{seasonLabel(year)}</option>)}</select></label>
                    <label className={styles.field}><span>Sort by</span><select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setPage(1); }}><option value="points">Fantasy points ↓</option><option value="fpg">FP/G ↓</option><option value="overall">Draft position ↑</option><option value="year">Newest draft</option><option value="player">Player A–Z</option></select></label>
                </div>
                <div role="table" aria-label="Franchise draft picks">
                    <div role="row" className={`${GRID} ${styles.tableHead} ${styles.label} px-4 py-2.5 md:px-5`}>
                        <span role="columnheader">Pick</span><span role="columnheader">Player</span><span role="columnheader" className="hidden sm:block">Season</span><span role="columnheader" aria-sort={sort === 'points' ? 'descending' : undefined} className="text-right">FPts</span><span role="columnheader" aria-sort={sort === 'fpg' ? 'descending' : undefined} className="text-right">FP/G</span>
                    </div>
                    {visible.map((pick) => <div key={`${pick.year}-${pick.overall}`} role="row" className={`${GRID} row-hover min-h-[52px] border-b border-line-soft px-4 py-2 last:border-0 md:px-5`}>
                        <div role="cell" className="flex items-baseline gap-1.5 whitespace-nowrap">
                            <span className="tabular text-lg font-black italic text-gold-deep [font-stretch:80%]">#{pick.overall}</span>
                            <span className="hidden text-[10px] font-bold uppercase text-ink-muted sm:inline">Rd {pick.round}</span>
                        </div>
                        <div role="cell" className="min-w-0">
                            {pick.playerId ? <Link href={playerHref(pick.playerId)} className="text-sm font-extrabold hover:text-rink-blue hover:underline md:text-[15px]">{pick.player}</Link> : <span className="text-xs font-semibold text-ink-muted">No player recorded</span>}
                            <span className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted sm:ml-2 sm:inline">{pick.positions.replaceAll(',', ' · ')}<span className="font-semibold normal-case tracking-normal sm:hidden"> · Rd {pick.round} · {seasonLabel(pick.year)}</span></span>
                        </div>
                        <span role="cell" className="tabular hidden text-sm text-ink-muted sm:block">{seasonLabel(pick.year)}</span>
                        <span role="cell" className="tabular text-right text-sm font-extrabold md:text-[15px]">{pick.points === null ? <span className="text-ink-faint" title="No season stats available">—</span> : formatFpts(pick.points)}</span>
                        <span role="cell" className="tabular text-right text-xs font-semibold text-ink-muted md:text-sm">{pick.fpg === null ? '—' : pick.fpg.toFixed(2)}</span>
                    </div>)}
                </div>
                {!visible.length && <div className="flex flex-col items-center gap-3 px-4 py-10 text-sm text-ink-muted"><TransactionIcon kind="draft" className="h-9 w-9 text-ink-faint" /><p>{picks.length ? 'No draft picks match these filters.' : 'No draft records are available for this franchise.'}</p></div>}
                {sorted.length > 0 && <div className={styles.pager}>
                    <p aria-live="polite" className="min-w-0 flex-1">{sorted.length} draft slots · Page {page} of {pages}<span className="mt-0.5 block text-[11px] text-ink-faint">Points and FP/G cover the full draft season, regardless of roster moves. The 2018–19 draft export is unavailable.</span></p>
                    <div><button type="button" disabled={page === 1} onClick={() => changePage(page - 1)}>Previous</button><button type="button" disabled={page >= pages} onClick={() => changePage(page + 1)}>Next</button></div>
                </div>}
            </div>
        </section>
    );
}
