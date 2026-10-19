'use client';

import { playerHref } from '@/lib/player-url';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { createResultCache } from '@/lib/result-cache';
import TeamBadge from '@/components/team-badge';
import TransactionIcon from '@/components/transaction-icon';
import type { HistoryAsset, HistoryEvent, HistoryKind, HistoryPage, HistoryScope, HistoryTeam } from '@/lib/history/model';
import { seasonLabel } from '@/lib/league';
import styles from './franchise.module.css';

const tones = {
    trade: 'text-rink-blue', free_agent: 'text-emerald-700', claim: 'text-emerald-700', drop: 'text-rink-red', draft: 'text-gold-deep',
};
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

function AssetName({ asset, highlighted }: { asset: HistoryAsset; highlighted: boolean }) {
    return <span className={`min-w-0 ${highlighted ? 'font-extrabold text-ink' : 'font-semibold text-ink-soft'}`}>
        {asset.playerId ? <Link href={playerHref(asset.playerId)} className="hover:text-rink-blue hover:underline">{asset.label}</Link> : asset.label}
    </span>;
}
function TeamName({ team }: { team: HistoryTeam }) {
    return <Link href={`/teams/${team.id}`} className="hover:text-rink-blue hover:underline">{team.name}</Link>;
}
function When({ event, extra }: { event: HistoryEvent; extra?: string }) {
    return <div className="flex items-baseline gap-2 md:block xl:flex">
        <time dateTime={event.date} className="tabular block text-[13px] font-bold text-ink">{dateLabel(event.date)}</time>
        <span className="tabular block text-xs text-ink-muted md:mt-0.5 xl:mt-0">{seasonLabel(event.season)}{extra}</span>
    </div>;
}

// One ledger row per move: the date on the left, then who got what.
function EventRow({ event, scope }: { event: HistoryEvent; scope: HistoryScope }) {
    if (event.kind === 'trade') {
        const teams = [...new Map(event.assets.flatMap((a) => [a.from, a.to]).filter((t): t is HistoryTeam => !!t).map((t) => [t.id, t])).values()]
            .sort((a, b) => Number(b.id === scope.franchiseId) - Number(a.id === scope.franchiseId));
        const pair = teams.length === 2;
        const drops = event.assets.filter((a) => a.action === 'drop');
        return (
            <li className="grid content-start gap-3 border-b border-line-soft px-4 py-4 md:grid-cols-[112px_minmax(0,1fr)] md:gap-5 md:px-5 xl:grid-cols-1 xl:gap-2.5 xl:odd:border-r">
                <When event={event} />
                <div className="min-w-0">
                    <div className={`grid gap-3 ${pair ? 'sm:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] sm:gap-5' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
                        {teams.map((team, index) => {
                            const received = event.assets.filter((a) => a.to?.id === team.id);
                            return <Fragment key={team.id}>
                                {pair && index === 1 && <TransactionIcon kind="trade" className="hidden h-5 w-5 self-center text-ink-faint sm:block" />}
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2.5">
                                        <TeamBadge size={28} logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} ring="none" />
                                        <span className="min-w-0 text-sm font-extrabold leading-tight"><TeamName team={team} /></span>
                                        <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-[.12em] text-ink-faint" aria-hidden="true">Received</span>
                                    </div>
                                    <ul className="mt-1 space-y-0.5 pl-[38px] text-sm" aria-label={`${team.name} received`}>
                                        {received.map((asset) => <li key={asset.id} className={`flex items-start gap-2 ${asset.playerId && asset.playerId === scope.playerId ? '-mx-1.5 rounded bg-gold-tint px-1.5' : ''}`}>
                                            {asset.assetKind === 'pick' && <TransactionIcon kind="draft" className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" />}
                                            <div className="min-w-0"><AssetName asset={asset} highlighted={asset.playerId === scope.playerId} />{!pair && asset.from && <span className="text-xs text-ink-muted"> from <TeamName team={asset.from} /></span>}</div>
                                        </li>)}
                                        {!received.length && <li className="text-xs text-ink-muted">No return asset recorded in the export.</li>}
                                    </ul>
                                </div>
                            </Fragment>;
                        })}
                    </div>
                    {drops.length > 0 && <div className="mt-2.5 border-t border-line-soft pt-2">
                        {drops.map((asset) => <p key={asset.id} className="flex flex-wrap items-center gap-x-2 text-[13px]"><TransactionIcon kind="drop" className="h-4 w-4 text-rink-red" /><span className="text-ink-muted">Dropped</span><AssetName asset={asset} highlighted={asset.playerId === scope.playerId} />{asset.from && <span className="text-xs text-ink-muted">by <TeamName team={asset.from} /></span>}</p>)}
                    </div>}
                </div>
            </li>
        );
    }
    // Claims, drops and draft selections: one line per player.
    return <>{event.assets.map((asset) => {
        const team = asset.to ?? asset.from;
        const verb = asset.action === 'draft' ? 'Drafted' : asset.action === 'claim' ? 'Claimed' : 'Dropped';
        return <li key={asset.id} className="grid items-center gap-x-4 gap-y-1.5 border-b border-line-soft px-4 py-3 md:grid-cols-[112px_minmax(0,1fr)] md:gap-5 md:px-5 xl:grid-cols-[124px_minmax(0,1fr)] xl:odd:border-r">
            <When event={event} extra={event.kind === 'draft' ? ` · #${event.overall}, Rd ${event.round}` : undefined} />
            <div className="flex min-w-0 items-center gap-3">
                <TransactionIcon kind={asset.action} className={`h-5 w-5 shrink-0 ${tones[asset.action]}`} />
                <div className="min-w-0 flex-1 text-sm">
                    {scope.playerId && asset.playerId === scope.playerId
                        ? <><span className={`font-bold ${tones[asset.action]}`}>{verb} by</span> {team && <span className="font-extrabold"><TeamName team={team} /></span>}</>
                        : <><AssetName asset={asset} highlighted={false} /><span className={`ml-2 text-[10px] font-extrabold uppercase tracking-[.1em] ${tones[asset.action]}`}>{verb}</span>{team && <span className="block text-xs text-ink-muted sm:ml-2 sm:inline"><TeamName team={team} /></span>}</>}
                </div>
                {team && <TeamBadge size={28} logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} ring="none" />}
            </div>
        </li>;
    })}</>;
}

const historyUrl = (franchiseId: number | undefined, playerId: string | undefined, kind: HistoryKind, season: string, page: number) => {
    const params = new URLSearchParams({ kind, page: String(page) });
    if (franchiseId) params.set('franchise', String(franchiseId));
    if (playerId) params.set('player', playerId);
    if (season !== 'all') params.set('season', season);
    return `/api/history?${params}`;
};

export default function TransactionHistory({ scope, initial, seasons }: { scope: HistoryScope; initial: HistoryPage; seasons: number[] }) {
    const defaultKind: HistoryKind = scope.franchiseId ? 'trade' : 'all';
    const [kind, setKind] = useState<HistoryKind>(defaultKind);
    const [season, setSeason] = useState('all');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(initial);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [retry, setRetry] = useState(0);
    const { franchiseId, playerId } = scope;
    const results = useMemo(() => {
        const cache = createResultCache<HistoryPage>();
        cache.set(historyUrl(franchiseId, playerId, defaultKind, 'all', 1), initial);
        return cache;
    }, [franchiseId, playerId, defaultKind, initial]);
    const changePage = (next: number) => {
        setPage(next);
        document.getElementById('transactions')?.scrollIntoView({ block: 'start' });
    };
    const tabs: { kind: HistoryKind; label: string }[] = franchiseId
        ? [{ kind: 'trade', label: 'Trades' }, { kind: 'free_agent', label: 'FA claims' }]
        : [{ kind: 'all', label: 'All moves' }, { kind: 'trade', label: 'Trades' }, { kind: 'free_agent', label: 'FA claims' }, { kind: 'draft', label: 'Draft' }];

    useEffect(() => {
        const controller = new AbortController();
        const url = historyUrl(franchiseId, playerId, kind, season, page);
        const saved = results.get(url);
        setLoading(!saved);
        setError(false);
        if (saved) { setData(saved); return; }
        results.load(url, controller.signal)
            .then((result: HistoryPage) => { if (!controller.signal.aborted) { setData(result); setLoading(false); } })
            .catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false); } });
        return () => controller.abort();
    }, [kind, season, page, retry, franchiseId, playerId, results]);

    return (
        <section id="transactions" className={styles.section} aria-labelledby="transactions-title">
            <div className={styles.head}>
                <h2 id="transactions-title">Transactions</h2>
            </div>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div className={styles.tabs} role="group" aria-label="Transaction type">
                    {tabs.map((tab) => <button key={tab.kind} type="button" aria-pressed={kind === tab.kind} onClick={() => { setKind(tab.kind); setPage(1); }}><span>{tab.label}</span></button>)}
                </div>
                <label className={`${styles.field} w-full sm:w-[200px]`}><span>Season</span>
                    <select value={season} onChange={(e) => { setSeason(e.target.value); setPage(1); }}>
                        <option value="all">All seasons</option>{seasons.map((year) => <option key={year} value={year}>{seasonLabel(year)}</option>)}
                    </select>
                </label>
            </div>
            {kind === 'free_agent' && franchiseId && <p className="mb-3 text-xs text-ink-muted">Claims and drops, including players released with a claim.</p>}
            {kind === 'draft' && <p className="mb-3 text-xs text-ink-muted">Draft records begin in 2019–20. The 2018–19 export is unavailable.</p>}
            <div aria-busy={loading} className={styles.panel}>
                {error ? <div role="alert" className="p-6 text-center"><p>Couldn’t load transaction history.</p><button onClick={() => setRetry((n) => n + 1)} className="mt-3 min-h-11 rounded bg-ink px-4 font-bold text-white">Try again</button></div>
                    : loading ? <div role="status" className="p-8 text-center text-sm text-ink-muted">Loading transactions…</div>
                    : data.events.length ? <ol className="-mb-px grid xl:grid-cols-2">{data.events.map((event) => <EventRow key={event.id} event={event} scope={scope} />)}</ol>
                    : <p className="p-8 text-center text-sm text-ink-muted">No {kind === 'trade' ? 'trades' : kind === 'draft' ? 'draft selections' : kind === 'free_agent' ? 'claims or drops' : 'transactions'} recorded{season !== 'all' ? ` for ${seasonLabel(Number(season))}` : ''}.</p>}
                {!loading && !error && data.total > 0 && <div className={styles.pager}>
                    <p aria-live="polite">{data.total} {kind === 'trade' ? 'trades' : 'events'} · Page {data.page} of {data.pages}</p>
                    <div><button type="button" disabled={page === 1} onClick={() => changePage(page - 1)}>Previous</button><button type="button" disabled={page >= data.pages} onClick={() => changePage(page + 1)}>Next</button></div>
                </div>}
            </div>
        </section>
    );
}
