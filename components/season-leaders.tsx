'use client';

import { useEffect, useRef, useState } from 'react';
import AwardLegend from '@/components/award-legend';
import PaginationControls from '@/components/pagination-controls';
import StatTable from '@/components/stat-table';
import type { LeaderboardPage } from '@/lib/data/league';
import { LEADERBOARD_POSITIONS, seasonLabel } from '@/lib/league';

export default function SeasonLeaders({ year, initial }: { year: number; initial: LeaderboardPage }) {
    const [result, setResult] = useState({ position: 'all', data: initial });
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState<{ position: string; page: number } | null>(null);
    const request = useRef<AbortController | null>(null);

    useEffect(() => () => request.current?.abort(), []);

    const load = async (position: string, page = 1) => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setPending(true);
        setFailed(null);
        try {
            let data = initial;
            if (position !== 'all' || page !== 1) {
                const params = new URLSearchParams({ mode: 'single-season', season: String(year), position, page: String(page) });
                const response = await fetch(`/api/leaderboard?${params}`, { signal: controller.signal });
                if (!response.ok) throw new Error('Could not load season leaders');
                data = await response.json();
            }
            if (!controller.signal.aborted) setResult({ position, data });
        } catch {
            if (!controller.signal.aborted) setFailed({ position, page });
        } finally {
            if (!controller.signal.aborted) setPending(false);
        }
    };

    return (
        <section id="season-leaders" aria-labelledby="season-leaders-title" className="w-full scroll-mt-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="season-leaders-title" className="font-wide text-lg font-extrabold uppercase md:text-xl">Top Players</h2>
                <span className="text-sm font-semibold text-ink-muted">{seasonLabel(year)}</span>
            </div>
            <nav aria-label="Season player position" className="mb-4 flex flex-wrap gap-1.5 md:gap-2">
                {LEADERBOARD_POSITIONS.map((label) => {
                    const position = label.toLowerCase();
                    const active = result.position === position;
                    return <button key={position} type="button" aria-pressed={active} onClick={() => void load(position)}
                        className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rink-blue md:min-w-12 md:px-4 ${active ? 'border-rink-blue bg-rink-blue text-white' : 'border-line-strong bg-white text-ink-soft hover:border-rink-blue hover:text-rink-blue'}`}>
                        {label}
                    </button>;
                })}
            </nav>
            <AwardLegend award multipleAwards cup className="mb-3" />
            <div className="mb-3 flex flex-wrap justify-between gap-2 text-xs font-semibold text-ink-muted">
                <p role="status">{pending ? 'Loading players…' : `${result.data.total} players`}</p>
                <p>Teams at season end</p>
            </div>
            {failed && <div role="alert" className="mb-3 flex items-center gap-3 text-sm text-rink-red">
                Could not load these players.
                <button type="button" onClick={() => void load(failed.position, failed.page)} className="min-h-11 rounded-xl border border-line-strong px-3 font-bold hover:bg-rink-wash">Retry</button>
            </div>}
            <div aria-busy={pending} className={`transition-opacity ${pending ? 'opacity-60' : ''}`}>
                <StatTable key={`${year}-${result.position}-${result.data.page}`} mode="single-season" topPlayers={result.data.rows} showTeam
                    currentPage={result.data.page} animationKey={`${year}-${result.position}-${result.data.page}`}
                    footer={result.data.pages > 1 ? <PaginationControls currentPage={result.data.page} maxPages={result.data.pages}
                        setCurrentPage={(page) => void load(result.position, page)} /> : undefined} />
            </div>
        </section>
    );
}
