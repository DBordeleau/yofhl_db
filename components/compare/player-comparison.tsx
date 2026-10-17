'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FiPlus, FiX } from 'react-icons/fi';
import PageTitle from '@/components/page-title';
import PlayerComparisonGraph from '@/components/player-comparison-graph';
import CompareTabs from './compare-tabs';
import ShareButton from '@/components/share/share-button';
import ExploreNext from '@/components/explore-next';
import { comparisonHref, parseComparison, type ComparisonState } from '@/lib/compare/state';
import { comparisonChart, COMPARE_COLORS } from '@/lib/compare/model';
import { loadComparisonProfiles, type ProfileResult } from '@/lib/compare/load';
import { comparisonShareCard } from '@/lib/share/model';
import { createResultCache } from '@/lib/result-cache';
import { normalizeSearch, type SearchResponse } from '@/lib/search/model';
import { playerHref } from '@/lib/player-url';
import type { PlayerProfile } from '@/lib/data/league';

export default function PlayerComparison() {
    const params = useSearchParams();
    const state = parseComparison(params);
    const canonical = comparisonHref(state);
    const idsKey = state.ids.join(',');
    const [notice, setNotice] = useState(state.notice);
    const [profiles, setProfiles] = useState<{ key: string; rows: ProfileResult[] }>({ key: '', rows: [] });
    const [retry, setRetry] = useState(0);
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState<{ query: string; data: SearchResponse | null; failed: boolean }>({ query: '', data: null, failed: false });
    const [searchRetry, setSearchRetry] = useState(0);
    const input = useRef<HTMLInputElement>(null);
    const profileCache = useMemo(() => createResultCache<PlayerProfile>(), []);
    const searchCache = useMemo(() => createResultCache<SearchResponse>(), []);
    useEffect(() => {
        if (state.notice) setNotice(state.notice);
        if (window.location.pathname + window.location.search !== canonical) window.history.replaceState(null, '', canonical);
    }, [canonical, state.notice]);
    useEffect(() => {
        const controller = new AbortController();
        const ids = idsKey ? idsKey.split(',') : [];
        loadComparisonProfiles(ids, controller.signal, profileCache).then(rows => {
            if (!controller.signal.aborted) setProfiles({ key: idsKey, rows });
        }).catch(() => { /* Aborted comparisons are replaced by the next selection. */ });
        return () => controller.abort();
    }, [idsKey, retry, profileCache]);
    useEffect(() => {
        if (normalizeSearch(query).length < 2) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            const url = `/api/search?q=${encodeURIComponent(query.trim())}&type=players`;
            setSearch({ query, data: null, failed: false });
            searchCache.load(url, controller.signal).then(data => {
                if (!controller.signal.aborted) setSearch({ query, data, failed: false });
            }).catch(() => { if (!controller.signal.aborted) setSearch({ query, data: null, failed: true }); });
        }, 250);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [query, searchRetry, searchCache]);

    function navigate(next: ComparisonState) {
        setNotice(null);
        const href = comparisonHref(next);
        if (href !== canonical) window.history.pushState(null, '', href);
    }
    const rows = profiles.key === idsKey ? profiles.rows : [];
    const players = rows.flatMap(row => row.status === 'ready' ? [row.player] : []);
    const complete = players.length === state.ids.length && players.length >= 2;
    const chart = comparisonChart(players, state.metric);
    const canExport = complete && chart.years.length > 0 && chart.series.some(series => series.values.some(value => value !== null));
    const enough = normalizeSearch(query).length >= 2;
    const searchData = search.query === query ? search.data : null;
    const searchFailed = search.query === query && search.failed;

    return <main className="mx-auto max-w-4xl px-4 pb-12 pt-8 md:px-8">
        <CompareTabs active="players" />
        <div className="flex flex-wrap items-start justify-between gap-4"><PageTitle eyebrow="Head to head" title="Compare players" />
            {canExport && <ShareButton card={comparisonShareCard(players, state.metric)} title="Share comparison" />}
        </div>
        <p className="mb-6 mt-3 text-sm leading-relaxed text-ink-muted">Choose up to five players. Your link remembers their order and chart metric.</p>
        {notice && <p role="status" className="mb-4 rounded-xl bg-gold-tint p-4 text-sm">{notice}</p>}
        <label htmlFor="compare-search" className="mb-2 block text-sm font-bold">Add a player</label>
        <input id="compare-search" ref={input} type="search" value={query} maxLength={60} autoComplete="off" onChange={event => setQuery(event.target.value)}
            placeholder="Search player names" className="min-h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-base outline-rink-blue" />
        {query && <div className="mt-2 rounded-xl border border-line bg-white p-2">
            {!enough ? <p className="p-3 text-sm text-ink-muted">Type at least two letters or numbers.</p>
                : searchFailed ? <div className="p-3"><p role="status">Player search is unavailable.</p><button type="button" className="min-h-11 font-bold text-rink-blue" onClick={() => setSearchRetry(value => value + 1)}>Retry search</button></div>
                : !searchData ? <p role="status" className="p-3 text-sm text-ink-muted">Searching…</p>
                : searchData.total === 0 ? <p role="status" className="p-3 text-sm text-ink-muted">No players found.</p>
                : <ul>{searchData.groups[0]?.results.map(player => <li key={player.id}>
                    <button type="button" disabled={state.ids.includes(player.id) || state.ids.length >= 5} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 text-left hover:bg-rink-wash disabled:text-ink-faint" onClick={() => {
                        navigate({ ...state, ids: [...state.ids, player.id] }); setQuery(''); input.current?.focus();
                    }}><span>{player.title}<small className="ml-2 text-xs">{state.ids.includes(player.id) ? 'Selected' : ''}</small></span><FiPlus aria-hidden="true" /></button>
                </li>)}</ul>}
        </div>}
        <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">Selected {state.ids.length}/5</h2>
            {state.ids.length === 5 && <p className="text-xs text-ink-muted">Remove a player to add another.</p>}
        </div>
        {!state.ids.length && <p className="rounded-2xl border border-dashed border-line-strong p-7 text-center text-ink-muted">Add two players to start a comparison.</p>}
        <ul className="grid gap-3 sm:grid-cols-2">{state.ids.map((id, index) => {
            const row = rows.find(profile => profile.id === id);
            const label = row?.status === 'ready' ? row.player.name : id;
            return <li key={id} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COMPARE_COLORS[index] }} />
                <div className="min-w-0 flex-1"><strong className="block break-words">{label}</strong>
                    {!row && <small role="status" className="text-ink-muted">Loading player…</small>}
                    {row?.status === 'missing' && <small className="text-rink-red">Player not found. Remove this selection.</small>}
                    {row?.status === 'error' && <><small className="block text-rink-red">Could not load this player.</small><button type="button" className="min-h-11 text-sm font-bold text-rink-blue" onClick={() => setRetry(value => value + 1)}>Retry player data</button></>}
                </div>
                <button type="button" aria-label={`Remove ${label}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-rink-wash" onClick={() => navigate({ ...state, ids: state.ids.filter(value => value !== id) })}><FiX aria-hidden="true" /></button>
            </li>;
        })}</ul>
        {state.ids.length === 1 && <p className="mt-4 text-sm text-ink-muted">Add one more player to see the chart.</p>}
        {state.ids.length > 1 && !complete && <p role="status" className="mt-5 text-sm text-ink-muted">The comparison needs every selected player. Waiting for player data, or remove an unavailable selection above.</p>}
        {complete && <PlayerComparisonGraph chart={chart} onMetricChange={metric => navigate({ ...state, metric })} />}
        <ExploreNext title="Explore these players" currentHref={canonical} links={players.map(player => ({ href: playerHref(player.id), title: player.name, reason: 'Career statistics, awards, and team history' }))} />
        <p className="mt-5 text-sm text-ink-muted"><Link href="/compare/teams" className="inline-flex min-h-11 items-center font-bold text-rink-blue">Compare franchises instead →</Link></p>
    </main>;
}
