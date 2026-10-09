'use client';

import Link from 'next/link';
import { useState } from 'react';
import PaginationControls from '@/components/pagination-controls';
import SearchBar from '@/components/search-bar';
import TeamBadge from '@/components/team-badge';
import TransactionIcon from '@/components/transaction-icon';
import type { SeasonDraftSelection } from '@/lib/history/model';
import { formatFpts, seasonLabel, splitPositions } from '@/lib/league';

type SortField = 'overall' | 'points' | 'fpg';
// two rounds of a twelve-team draft per page
const PAGE_SIZE = 24;
// matches the team column layout of the stat tables above
const GRID = 'grid grid-cols-[42px_minmax(0,1fr)_64px_40px] items-center gap-2 px-3 md:grid-cols-[52px_minmax(0,1.1fr)_minmax(0,1fr)_90px_54px] md:gap-3 md:px-5';
const pill = (active: boolean) =>
    `inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rink-blue md:min-w-12 md:px-4 ${active ? 'border-rink-blue bg-rink-blue text-white' : 'border-line-strong bg-white text-ink-soft hover:border-rink-blue hover:text-rink-blue'}`;

function DraftingTeam({ pick, compact = false }: { pick: SeasonDraftSelection; compact?: boolean }) {
    if (pick.franchiseId === null) return <span className="text-xs font-semibold text-ink-faint">No team recorded</span>;
    return (
        <Link href={`/teams/${pick.franchiseId}`} title={pick.teamName ?? undefined}
            className={`flex min-w-0 items-center gap-2 font-semibold text-ink-muted hover:text-rink-blue hover:underline ${compact ? 'text-[11px]' : 'text-sm'}`}>
            <TeamBadge logo={pick.teamLogo} abbreviation={pick.teamAbbreviation} teamName={pick.teamName} size={compact ? 20 : 28} ring="none" />
            <span className="min-w-0 truncate">{compact ? pick.teamAbbreviation ?? pick.teamName : pick.teamName}</span>
        </Link>
    );
}

export default function SeasonDraft({ year, picks }: { year: number; picks: SeasonDraftSelection[] }) {
    const [query, setQuery] = useState('');
    const [team, setTeam] = useState('all');
    const [round, setRound] = useState<number | null>(null);
    const [sort, setSort] = useState<{ field: SortField; direction: 'asc' | 'desc' }>({ field: 'overall', direction: 'asc' });
    const [page, setPage] = useState(1);
    const teams = [...new Map(picks.filter((pick) => pick.franchiseId !== null).map((pick) => [pick.franchiseId!, pick.teamName!])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1]));
    const rounds = [...new Set(picks.map((pick) => pick.round))].sort((a, b) => a - b);
    const search = query.trim().toLowerCase();
    const filtered = picks.filter((pick) =>
        (team === 'all' || String(pick.franchiseId) === team)
        && (round === null || pick.round === round)
        && (!search || pick.player?.toLowerCase().includes(search)));
    // empty stats stay at the bottom whichever way a column is sorted
    const sorted = [...filtered].sort((a, b) => {
        const sign = sort.direction === 'asc' ? 1 : -1;
        if (sort.field === 'overall') return sign * (a.overall - b.overall);
        const [x, y] = [a[sort.field], b[sort.field]];
        if (x === null || y === null) return x === y ? a.overall - b.overall : x === null ? 1 : -1;
        return sign * (x - y) || a.overall - b.overall;
    });
    const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const visible = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const filter = (apply: () => void) => { apply(); setPage(1); };
    const changePage = (next: number) => {
        setPage(next);
        document.getElementById('draft-class')?.scrollIntoView({ block: 'start' });
    };
    const handleSort = (field: SortField) => filter(() => setSort((current) => ({
        field,
        // picks read first to last, stats high to low
        direction: current.field === field ? (current.direction === 'asc' ? 'desc' : 'asc') : field === 'overall' ? 'asc' : 'desc',
    })));
    const arrow = (field: SortField) => (sort.field === field ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : '');
    const ariaSort = (field: SortField) => (sort.field === field ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    const sortButton = (field: SortField, label: string) => (
        <button type="button" onClick={() => handleSort(field)} className="min-h-11 whitespace-nowrap uppercase tracking-[inherit] hover:text-rink-blue">{label}{arrow(field)}</button>
    );

    return (
        <section id="draft-class" aria-labelledby="draft-class-title" className="w-full scroll-mt-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="draft-class-title" className="font-wide text-lg font-extrabold uppercase md:text-xl">Draft Class</h2>
                <span className="text-sm font-semibold text-ink-muted">
                    {seasonLabel(year)}{picks.length > 0 && ` · ${rounds.length} rounds`}
                </span>
            </div>
            {!picks.length ? (
                <p className="rounded-3xl border-2 border-dashed border-line-strong px-6 py-10 text-center text-sm font-semibold text-ink-muted">
                    Draft records are unavailable for {seasonLabel(year)}.
                </p>
            ) : (
                <>
                    <div className="mb-4 flex flex-col gap-3 3xl:flex-row 3xl:items-center 3xl:justify-between">
                        <nav aria-label="Draft round" className="flex flex-wrap items-center gap-1.5 md:gap-2">
                            <span className="mr-1 text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted md:text-xs" aria-hidden="true">Round</span>
                            <button type="button" aria-pressed={round === null} aria-label="All rounds" onClick={() => filter(() => setRound(null))} className={pill(round === null)}>All</button>
                            {rounds.map((value) => (
                                <button key={value} type="button" aria-pressed={round === value} aria-label={`Round ${value}`}
                                    onClick={() => filter(() => setRound(value))} className={`tabular ${pill(round === value)}`}>
                                    {value}
                                </button>
                            ))}
                        </nav>
                        <div className="flex flex-col gap-2 sm:flex-row 3xl:flex-none">
                            <label className="flex h-12 items-center rounded-2xl border border-line-strong bg-white px-4 focus-within:border-rink-blue focus-within:shadow-[0_0_0_3px_rgba(31,111,194,.15)] sm:w-60">
                                <span className="sr-only">Drafting team</span>
                                <select value={team} onChange={(event) => filter(() => setTeam(event.target.value))}
                                    className="w-full bg-transparent text-[15px] font-semibold text-ink outline-none">
                                    <option value="all">All teams</option>
                                    {teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                                    {picks.some((pick) => pick.franchiseId === null) && <option value="null">No team recorded</option>}
                                </select>
                            </label>
                            <SearchBar searchQuery={query} setSearchQuery={(value) => filter(() => setQuery(value))} placeholder="Search draft picks" className="w-full sm:w-60" />
                        </div>
                    </div>
                    <div className="mb-3 flex flex-wrap justify-between gap-2 text-xs font-semibold text-ink-muted">
                        <p role="status">{sorted.length} {sorted.length === 1 ? 'pick' : 'picks'}</p>
                        <p id="draft-class-note">Stats cover the full season, regardless of roster moves</p>
                    </div>
                    <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card" role="table" aria-label={`${seasonLabel(year)} draft class`} aria-describedby="draft-class-note">
                        <div className={`${GRID} min-h-12 border-b-2 border-ink text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted md:text-xs`} role="row">
                            <span role="columnheader" aria-sort={ariaSort('overall')}>{sortButton('overall', 'Pick')}</span>
                            <span role="columnheader">Player</span>
                            <span role="columnheader" className="hidden md:block">Drafting team</span>
                            <span role="columnheader" aria-sort={ariaSort('points')} className="text-right">{sortButton('points', 'FPts')}</span>
                            <span role="columnheader" aria-sort={ariaSort('fpg')} className="text-right">{sortButton('fpg', 'FP/G')}</span>
                        </div>
                        {visible.length > 0 ? (
                            <div key={`${round}-${team}-${search}-${sort.field}-${sort.direction}-${page}`} role="rowgroup">
                                {visible.map((pick, index) => (
                                    <div key={pick.overall} role="row" className={`${GRID} row-hover animate-rise min-h-[66px] border-b border-line-soft transition-colors last:border-b-0`}
                                        style={{ animationDelay: `${Math.min(index, 14) * 35}ms` }}>
                                        <span role="cell" className="flex flex-col py-2.5">
                                            <span className="font-narrow tabular text-[22px] font-extrabold leading-none text-[#97A2B4] md:text-[28px]">{pick.overall}</span>
                                            <span className="tabular mt-1 text-[10px] font-bold uppercase tracking-[.08em] text-ink-faint" title={`Round ${pick.round}, pick ${pick.pick}`}>
                                                {pick.round}.{String(pick.pick).padStart(2, '0')}
                                            </span>
                                        </span>
                                        <span role="cell" className="flex min-w-0 flex-col gap-0.5 py-2.5">
                                            {pick.playerId ? (
                                                <Link href={`/player/${encodeURIComponent(pick.playerId)}`} className="text-[15px] font-bold text-ink underline-offset-[3px] hover:text-rink-blue hover:underline md:text-[17px]">
                                                    {pick.player}
                                                </Link>
                                            ) : (
                                                <span className="text-sm font-semibold text-ink-faint">No selection recorded</span>
                                            )}
                                            {pick.positions && <span className="text-[11px] font-bold uppercase tracking-[.1em] text-ink-faint md:text-xs">{splitPositions(pick.positions).join(' · ')}</span>}
                                            <span className="mt-1 md:hidden"><DraftingTeam pick={pick} compact /></span>
                                        </span>
                                        <span role="cell" className="hidden min-w-0 py-2.5 md:block"><DraftingTeam pick={pick} /></span>
                                        <span role="cell" className="tabular text-right text-[15px] font-extrabold md:text-[19px]">
                                            {pick.points === null ? <span className="text-ink-faint" title="No season stats available">—</span> : formatFpts(pick.points)}
                                        </span>
                                        <span role="cell" className="tabular text-right text-sm text-ink-muted md:text-base">
                                            {pick.fpg === null ? <span className="text-ink-faint">—</span> : pick.fpg.toFixed(2)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3 px-4 py-10 text-sm text-ink-muted">
                                <TransactionIcon kind="draft" className="h-9 w-9 text-ink-faint" />
                                <p>No draft picks match these filters.</p>
                            </div>
                        )}
                        {pages > 1 && (
                            <div className="flex justify-center border-t border-line-soft px-5 py-3">
                                <PaginationControls currentPage={page} maxPages={pages} setCurrentPage={changePage} />
                            </div>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}
