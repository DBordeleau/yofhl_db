'use client';

import { FC, MouseEvent, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AwardLegend from '@/components/award-legend';
import PageTitle from '@/components/page-title';
import PaginationControls from '@/components/pagination-controls';
import SearchBar from '@/components/search-bar';
import StatTable from '@/components/stat-table';
import type { LeaderboardPage } from '@/lib/data/league';
import { LEADERBOARD_MODES as MODES, LEADERBOARD_POSITIONS as POSITIONS } from '@/lib/league';


interface LeaderboardProps {
    mode: string;
    position: string;
    q: string;
    data: LeaderboardPage;
    seasonRange: string;
}

// controls and table for /stats/[mode]/[position]; the server renders each page, these controls
// only change the URL (?page=, ?q=) and keep the current rows on screen, dimmed, until the next arrive
const Leaderboard: FC<LeaderboardProps> = ({ mode, position, q, data, seasonRange }) => {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [searchInput, setSearchInput] = useState(q);
    const lastQuery = useRef(q);

    const go = (href: string, scroll = false) => startTransition(() => router.push(href, { scroll }));
    const query = (params: { page?: number; q?: string }) => {
        const search = new URLSearchParams();
        const nextQ = params.q ?? q;
        if (nextQ) search.set('q', nextQ);
        if (params.page && params.page > 1) search.set('page', String(params.page));
        const s = search.toString();
        return s ? `?${s}` : '';
    };

    // wait for typing to pause before searching, and start new searches from the first page
    useEffect(() => {
        if (searchInput.trim() === lastQuery.current) return;
        const timer = setTimeout(() => {
            lastQuery.current = searchInput.trim();
            startTransition(() => router.replace(`/stats/${mode}/${position}${query({ q: searchInput.trim(), page: 1 })}`, { scroll: false }));
        }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchInput]);

    const navLink = (href: string) => (e: MouseEvent) => {
        e.preventDefault();
        go(href);
    };

    const pill = (active: boolean) =>
        `inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-bold transition-colors md:min-w-12 md:px-4 ${active
            ? 'border-rink-blue bg-rink-blue text-white'
            : 'border-line-strong bg-white text-ink-soft hover:border-rink-blue hover:text-rink-blue'
        }`;

    const modeLabel = MODES.find((m) => m.slug === mode)?.label ?? 'All-Time';

    return (
        // wide screens: title and filters move into a sticky rail beside the table
        <div className="3xl:grid 3xl:grid-cols-[400px_minmax(0,880px)] 3xl:items-start 3xl:justify-center 3xl:gap-16 4xl:grid-cols-[460px_minmax(0,960px)]">
            <aside className="3xl:sticky 3xl:top-8">
                <PageTitle eyebrow={modeLabel} title="Fantasy Points Leaders" sub={<span className="tabular">{seasonRange}</span>} wideAlign>
                    <nav className="mt-2.5 flex gap-1 rounded-2xl bg-line-soft p-1" aria-label="Leaderboard mode">
                        {MODES.map((m) => {
                            const href = `/stats/${m.slug}/${position}${query({ page: 1 })}`;
                            return (
                                <Link
                                    key={m.slug}
                                    href={href}
                                    onClick={navLink(href)}
                                    className={`inline-flex min-h-11 items-center rounded-xl px-[18px] text-[15px] font-bold transition-colors ${mode === m.slug ? 'bg-white text-ink shadow-[0_1px_2px_rgba(18,24,46,.12),0_0_0_1px_#DCE5EE]' : 'text-ink-muted hover:text-ink'}`}
                                    aria-current={mode === m.slug ? 'page' : undefined}
                                >
                                    {m.label}
                                </Link>
                            );
                        })}
                    </nav>
                </PageTitle>

                <div className="mx-auto max-w-board 3xl:max-w-none">
                    <div className="mb-4 mt-7 flex flex-col gap-3 md:flex-row md:items-center md:justify-between 3xl:flex-col 3xl:items-stretch 3xl:gap-4">
                        <nav className="flex flex-wrap gap-1.5 md:gap-2" aria-label="Position">
                            {POSITIONS.map((pos) => {
                                const href = `/stats/${mode}/${pos.toLowerCase()}${query({ page: 1 })}`;
                                return (
                                    <Link
                                        key={pos}
                                        href={href}
                                        onClick={navLink(href)}
                                        className={pill(position === pos.toLowerCase())}
                                        aria-current={position === pos.toLowerCase() ? 'page' : undefined}
                                    >
                                        {pos}
                                    </Link>
                                );
                            })}
                        </nav>
                        <SearchBar searchQuery={searchInput} setSearchQuery={setSearchInput} className="w-full md:w-60 3xl:w-full" />
                    </div>

                    {mode === 'single-season' && <AwardLegend award multipleAwards cup className="mb-4 3xl:flex-col 3xl:gap-3" />}
                </div>
            </aside>

            <div className={`mx-auto max-w-board transition-opacity duration-200 3xl:mx-0 3xl:max-w-none ${pending ? 'opacity-60' : ''}`} aria-busy={pending}>
                <StatTable
                    mode={mode}
                    topPlayers={data.rows}
                    currentPage={data.page}
                    animationKey={`${mode}-${position}-${data.page}-${q}`}
                    footer={
                        data.pages > 1 ? (
                            <PaginationControls
                                currentPage={data.page}
                                maxPages={data.pages}
                                setCurrentPage={(page) => go(`/stats/${mode}/${position}${query({ page })}`, true)}
                            />
                        ) : undefined
                    }
                />
            </div>
        </div>
    );
};

export default Leaderboard;
