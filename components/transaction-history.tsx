'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import TeamBadge from '@/components/team-badge';
import TransactionIcon from '@/components/transaction-icon';
import type { HistoryAsset, HistoryEvent, HistoryKind, HistoryPage, HistoryScope, HistoryTeam } from '@/lib/history/model';
import { seasonLabel } from '@/lib/league';

const colors = {
    trade: 'bg-rink-wash text-rink-blue', free_agent: 'bg-emerald-50 text-emerald-700',
    claim: 'bg-emerald-50 text-emerald-700', drop: 'bg-rose-50 text-rink-red', draft: 'bg-gold-tint text-gold-deep',
};
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

function AssetName({ asset, highlighted }: { asset: HistoryAsset; highlighted: boolean }) {
    return <span className={`min-w-0 ${highlighted ? 'font-extrabold text-ink' : 'font-semibold text-ink-soft'}`}>
        {asset.playerId ? <Link href={`/player/${encodeURIComponent(asset.playerId)}`} className="hover:text-rink-blue hover:underline">{asset.label}</Link> : <span className="text-sm">{asset.label}</span>}
    </span>;
}
function TeamName({ team }: { team: HistoryTeam }) {
    return <Link href={`/teams/${team.id}`} className="hover:text-rink-blue hover:underline">{team.name}</Link>;
}

function EventCard({ event, scope }: { event: HistoryEvent; scope: HistoryScope }) {
    if (event.kind === 'free_agent') return (
        <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            <ul className="divide-y divide-line-soft">
                {event.assets.map((asset) => {
                    const team = asset.to ?? asset.from;
                    const claimed = asset.action === 'claim';
                    return <li key={asset.id} className="flex items-center gap-3 px-4 py-4 md:gap-4 md:px-5">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors[asset.action]}`}><TransactionIcon kind={asset.action} className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1">
                            {scope.playerId ? <>
                                <p className={`text-xs font-bold ${claimed ? 'text-emerald-700' : 'text-rink-red'}`}>{claimed ? 'Claimed by' : 'Dropped by'}</p>
                                {team && <div className="mt-1 text-sm font-extrabold"><TeamName team={team} /></div>}
                            </> : <><div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                <AssetName asset={asset} highlighted={asset.playerId === scope.playerId} />
                                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${colors[asset.action]}`}>{claimed ? 'Claimed' : 'Dropped'}</span>
                            </div>
                            {team && <p className="mt-1 text-xs text-ink-muted"><TeamName team={team} /></p>}</>}
                        </div>
                        {team && <span className="hidden sm:block"><TeamBadge size={32} logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} ring="none" /></span>}
                        <div className="shrink-0 text-right">
                            <time dateTime={event.date} className="block text-xs font-semibold text-ink-soft md:text-sm">{dateLabel(event.date)}</time>
                            <span className="mt-1 block text-[11px] text-ink-muted">{seasonLabel(event.season)}</span>
                        </div>
                    </li>;
                })}
            </ul>
        </article>
    );
    const kind = event.kind;
    const title = kind === 'trade' ? 'Trade' : 'Drafted';
    const teams = [...new Map(event.assets.flatMap((a) => [a.from, a.to]).filter((t): t is HistoryTeam => !!t).map((t) => [t.id, t])).values()]
        .sort((a, b) => Number(b.id === scope.franchiseId) - Number(a.id === scope.franchiseId));
    return (
        <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            <header className="flex items-center gap-3 border-b border-line-soft px-4 py-3 md:px-5">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors[kind]}`}><TransactionIcon kind={kind} className="h-6 w-6" /></span>
                <div className="min-w-0 flex-1"><h3 className="font-extrabold">{title}{event.kind === 'draft' && <span className="ml-2 text-gold-deep">#{event.overall}</span>}</h3><p className="mt-0.5 text-xs text-ink-muted">{seasonLabel(event.season)}{event.kind === 'draft' && ` · Round ${event.round}`}</p></div>
                <time dateTime={event.date} className="text-right text-xs font-semibold text-ink-muted md:text-sm">{dateLabel(event.date)}</time>
            </header>
            {event.kind === 'trade' ? <>
                <div className={`grid divide-y divide-line-soft md:divide-y-0 ${teams.length > 2 ? 'lg:grid-cols-3' : 'md:grid-cols-2'}`}>
                    {teams.map((team) => {
                        const received = event.assets.filter((a) => a.to?.id === team.id);
                        return <div key={team.id} className={`p-4 md:p-5 ${team.id === scope.franchiseId ? 'bg-rink-wash/40' : ''}`}>
                            <div className="mb-3 flex items-center gap-3">
                                <TeamBadge size={32} logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} ring="none" />
                                <div className="min-w-0"><div className="text-sm font-bold"><TeamName team={team} /></div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-muted">Received</div></div>
                            </div>
                            <ul className="space-y-2.5">
                                {received.map((asset) => <li key={asset.id} className={`flex items-start gap-2.5 rounded-lg p-2 text-sm ${asset.playerId === scope.playerId ? 'bg-gold-tint' : 'bg-ice/80'}`}>
                                    {asset.assetKind === 'pick' ? <TransactionIcon kind="draft" className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" /> : <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-rink-blue" />}
                                    <div className="min-w-0"><AssetName asset={asset} highlighted={asset.playerId === scope.playerId} />{teams.length > 2 && asset.from && <p className="mt-1 text-xs text-ink-muted">From <TeamName team={asset.from} /></p>}</div>
                                </li>)}
                                {!received.length && <li className="py-2 text-xs text-ink-muted">No return asset recorded in the export.</li>}
                            </ul>
                        </div>;
                    })}
                </div>
                {event.assets.some((a) => a.action === 'drop') && <div className="border-t border-line-soft px-4 py-3 md:px-5">
                    {event.assets.filter((a) => a.action === 'drop').map((asset) => <p key={asset.id} className="flex flex-wrap items-center gap-2 text-sm"><TransactionIcon kind="drop" className="h-4 w-4 text-rink-red" /><span>Dropped:</span><AssetName asset={asset} highlighted={asset.playerId === scope.playerId} />{asset.from && <span className="text-xs text-ink-muted">by <TeamName team={asset.from} /></span>}</p>)}
                </div>}
            </> : <ul className="divide-y divide-line-soft px-4 md:px-5">
                {event.assets.map((asset) => {
                    const team = asset.to ?? asset.from;
                    return <li key={asset.id} className="flex items-center gap-3 py-4">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${colors[asset.action]}`}><TransactionIcon kind={asset.action} className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1"><AssetName asset={asset} highlighted={asset.playerId === scope.playerId} /><p className="mt-1 text-xs text-ink-muted">{asset.action === 'draft' ? 'Drafted by' : asset.action === 'claim' ? 'Claimed by' : 'Dropped by'} {team && <TeamName team={team} />}</p></div>
                        {team && <TeamBadge size={32} logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} ring="none" />}
                    </li>;
                })}
            </ul>}
        </article>
    );
}

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
    const changePage = (next: number) => {
        setPage(next);
        document.getElementById('transactions')?.scrollIntoView({ block: 'start' });
    };
    const tabs: { kind: HistoryKind; label: string }[] = franchiseId
        ? [{ kind: 'trade', label: 'Trades' }, { kind: 'free_agent', label: 'FA claims' }]
        : [{ kind: 'all', label: 'All moves' }, { kind: 'trade', label: 'Trades' }, { kind: 'free_agent', label: 'FA claims' }, { kind: 'draft', label: 'Draft' }];

    useEffect(() => {
        if (kind === defaultKind && season === 'all' && page === 1 && retry === 0) { setData(initial); setLoading(false); setError(false); return; }
        const controller = new AbortController();
        const params = new URLSearchParams({ kind, page: String(page) });
        if (franchiseId) params.set('franchise', String(franchiseId));
        if (playerId) params.set('player', playerId);
        if (season !== 'all') params.set('season', season);
        setLoading(true);
        setError(false);
        fetch(`/api/history?${params}`, { signal: controller.signal })
            .then((response) => { if (!response.ok) throw new Error('History request failed'); return response.json(); })
            .then((result: HistoryPage) => { if (!controller.signal.aborted) { setData(result); setLoading(false); } })
            .catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false); } });
        return () => controller.abort();
    }, [kind, season, page, retry, franchiseId, playerId, defaultKind, initial]);

    return (
        <section id="transactions" className="mt-9 scroll-mt-6" aria-labelledby="transactions-title">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 id="transactions-title" className="font-wide text-xl font-extrabold uppercase">Transaction history</h2>
                <label className="flex items-center gap-2 text-xs font-bold text-ink-muted">Season
                    <select value={season} onChange={(e) => { setSeason(e.target.value); setPage(1); }} className="min-h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink">
                        <option value="all">All seasons</option>{seasons.map((year) => <option key={year} value={year}>{seasonLabel(year)}</option>)}
                    </select>
                </label>
            </div>
            <div className="mb-4 flex flex-wrap gap-1 rounded-2xl bg-line-soft p-1" role="group" aria-label="Transaction type">
                {tabs.map((tab) => <button key={tab.kind} type="button" aria-pressed={kind === tab.kind} onClick={() => { setKind(tab.kind); setPage(1); }} className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-bold transition-colors sm:flex-none sm:px-5 ${kind === tab.kind ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}>{tab.label}</button>)}
            </div>
            {kind === 'free_agent' && franchiseId && <p className="mb-3 text-xs text-ink-muted">Claims and drops, including players released with a claim.</p>}
            {kind === 'draft' && <p className="mb-3 text-xs text-ink-muted">Draft records begin in 2019–20. The 2018–19 export is unavailable.</p>}
            <div aria-busy={loading}>
                {error ? <div role="alert" className="rounded-2xl border border-line bg-white p-6 text-center"><p>Couldn’t load transaction history.</p><button onClick={() => setRetry((n) => n + 1)} className="mt-3 min-h-11 rounded-xl bg-ink px-4 font-bold text-white">Try again</button></div>
                    : loading ? <div role="status" className="rounded-2xl border border-line bg-white p-8 text-center text-sm text-ink-muted">Loading transactions…</div>
                    : data.events.length ? <div className="space-y-4">{data.events.map((event) => <EventCard key={event.id} event={event} scope={scope} />)}</div>
                    : <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-ink-muted">No {kind === 'trade' ? 'trades' : kind === 'draft' ? 'draft selections' : kind === 'free_agent' ? 'claims or drops' : 'transactions'} recorded{season !== 'all' ? ` for ${seasonLabel(Number(season))}` : ''}.</p>}
            </div>
            {!loading && !error && data.total > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                <p className="text-ink-muted" aria-live="polite">{data.total} {kind === 'trade' ? 'trades' : 'events'} · Page {data.page} of {data.pages}</p>
                <div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => changePage(page - 1)} className="min-h-11 rounded-xl border border-line bg-white px-4 font-bold disabled:opacity-40">Previous</button><button type="button" disabled={page >= data.pages} onClick={() => changePage(page + 1)} className="min-h-11 rounded-xl border border-line bg-white px-4 font-bold disabled:opacity-40">Next</button></div>
            </div>}
        </section>
    );
}
