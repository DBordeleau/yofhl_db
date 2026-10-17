'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { availablePlayers, assignRoster, initialDraft, mergeSnapshot, parseWorkspace, POSITIONS, recordPick, rosterPlayers, valuePlayer, goalieBaseline, averageMissedGames,
    BENCH_WEIGHT, isProspect, PROSPECT_GAMES, type Draft, type Workspace, type Player, type Position, type Snapshot } from '../lib/model';
import { evaluateDraft, type DraftCandidate } from '../lib/forecast';
import { applyPlan, STARTERS, type DraftPlan } from '../lib/order';
import { keeperCounts } from '../lib/fantrax-order';
import DraftOrderEditor from './draft-order-editor';
import TierBoard, { TierSummary } from './tier-board';
import type { Tier } from '../lib/tiers';
import type { PoolImport } from '../lib/csv';
import { Flags, Modal, Odds, PlayerCell, Positions, Star, points, rate, signed } from './ui';

const STORAGE_KEY = 'yofhl-varrock-draft-v1';
const THEME_KEY = 'yofhl-varrock-theme';
const PAGE = 60;
const timestamp = (date: string) => new Date(date).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Your current draft has been kept.';
function download(content: string, name: string) {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type Tab = 'fit' | 'value' | 'prospects' | 'tiers' | 'log';
const isList = (tab: Tab) => tab === 'fit' || tab === 'value';
type Toast = { text: string; tone: 'info' | 'warn' };

function TierChip({ tier }: { tier?: Tier }) {
    if (!tier) return null;
    return <span className={`chip ${tier.left === 1 ? 'chip-warn' : 'chip-muted'}`} title={`${tier.position} tier ${tier.number}: ${points(tier.top)}–${points(tier.bottom)}`}>{tier.left === 1 ? `Last in ${tier.position} T${tier.number}` : `${tier.position} T${tier.number} · ${tier.left} left`}</span>;
}

function RecommendationCard({ item, tier, alternatives, canDraft, target, onList, onPick, onDetails, onAvoid, onTarget }: {
    item?: DraftCandidate; tier?: Tier; alternatives: DraftCandidate[]; canDraft: boolean; target: boolean; onList: () => void;
    onPick: (player: Player) => void; onDetails: (player: Player) => void; onAvoid: (id: string) => void; onTarget: (id: string) => void;
}) {
    const label = <button className="card-label" onClick={onList} title="Show the full list">Best for Varrock ›{item && <span className="chip">{item.reason}</span>}<TierChip tier={tier} /></button>;
    if (!item) return <article className="card card-fit">{label}<p className="empty">No eligible player.</p></article>;
    const value = item.recommendationValue, outlook = item.outlook;
    return <article className="card card-fit">
        {label}
        <div className="card-player"><button className="card-name" onClick={() => onDetails(item.player)}>{item.player.name}</button>
            <span className="player-meta"><Positions player={item.player} /><span className="team">{item.player.team}</span><Flags player={item.player} /></span></div>
        <div className="metrics">
            <div className="metric"><strong>{points(value.points)}</strong><span>pts · {points(value.games)} gp</span></div>
            {outlook ? <>
                <div className="metric" title={`Best ${item.role} expected on waivers after the draft: ${points(outlook.replacement)} pts`}><strong>{signed(outlook.overReplacement)}</strong><span>vs waivers</span></div>
                <div className={`metric ${outlook.waitCost >= 40 ? 'metric-warn' : ''}`} title={`Best ${item.role} expected at ${outlook.waitSlot === null ? 'waivers' : `#${outlook.waitSlot + 1}`}: ${points(outlook.wait)} pts`}><strong>{outlook.waitCost ? `−${points(outlook.waitCost)}` : '0'}</strong><span>if you wait</span></div>
            </> : item.alternative && <div className="metric"><strong>−{points(item.alternative.gap)}</strong><span>to {item.alternative.player.name}</span></div>}
        </div>
        <div className="card-footer">
            {alternatives.length > 0 && <div className="then">Then {alternatives.map(a => <button key={a.player.id} onClick={() => onDetails(a.player)} title={a.reason}>{a.player.name}</button>)}</div>}
            <div className="card-actions"><Star on={target} name={item.player.name} onClick={() => onTarget(item.player.id)} />
                <button className="icon-button" title="Do not draft" aria-label={`Do not draft ${item.player.name}`} onClick={() => onAvoid(item.player.id)}>✕</button>
                {canDraft && <button className="button primary" onClick={() => onPick(item.player)}>Draft</button>}</div>
        </div>
    </article>;
}

function ValueCard({ item, tier, canDraft, target, onList, onPick, onDetails, onAvoid, onTarget }: {
    item?: DraftCandidate; tier?: Tier; canDraft: boolean; target: boolean; onList: () => void;
    onPick: (player: Player) => void; onDetails: (player: Player) => void; onAvoid: (id: string) => void; onTarget: (id: string) => void;
}) {
    const label = <button className="card-label" onClick={onList} title="Show the full list">Best available ›<TierChip tier={tier} />{item?.value.confidence && <span className="chip chip-muted">{item.value.confidence}</span>}</button>;
    if (!item) return <article className="card">{label}<p className="empty">No rated players.</p></article>;
    return <article className="card">
        {label}
        <div className="card-player"><button className="card-name" onClick={() => onDetails(item.player)}>{item.player.name}</button>
            <span className="player-meta"><Positions player={item.player} /><span className="team">{item.player.team}</span><Flags player={item.player} /></span></div>
        <div className="metrics"><div className="metric"><strong>{points(item.value.points)}</strong><span>board pts</span></div><div className="metric"><strong>{rate(item.value.perGame)}</strong><span>FP/G</span></div></div>
        <div className="card-footer"><span className="muted">{item.reason}</span>
            <div className="card-actions"><Star on={target} name={item.player.name} onClick={() => onTarget(item.player.id)} />
                <button className="icon-button" title="Do not draft" aria-label={`Do not draft ${item.player.name}`} onClick={() => onAvoid(item.player.id)}>✕</button>
                {canDraft && <button className="button secondary" onClick={() => onPick(item.player)}>Draft</button>}</div></div>
    </article>;
}

export default function DraftRoom() {
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [ready, setReady] = useState(false), [error, setError] = useState(''), [toast, setToast] = useState<Toast | null>(null);
    const [savingError, setSavingError] = useState(''), [loading, setLoading] = useState(false), [loadingOrder, setLoadingOrder] = useState(false);
    const [search, setSearch] = useState(''), [position, setPosition] = useState<'ALL' | Position>('ALL');
    const [showUnrated, setShowUnrated] = useState(false), [targetsOnly, setTargetsOnly] = useState(false), [limit, setLimit] = useState(PAGE);
    const [maxAge, setMaxAge] = useState(25), [prospectPosition, setProspectPosition] = useState<'ALL' | Position>('ALL');
    const [tab, setTab] = useState<Tab>('fit');
    const [modal, setModal] = useState<'order' | 'keepers' | 'scoring' | null>(null);
    const [details, setDetails] = useState<{ player: Player; position?: Position } | null>(null), [keeperSearch, setKeeperSearch] = useState('');
    const showDetails = (player: Player, position?: Position) => setDetails({ player, position });
    const [pendingImport, setPendingImport] = useState<(PoolImport & { name: string }) | null>(null);
    const csvInput = useRef<HTMLInputElement>(null), backupInput = useRef<HTMLInputElement>(null), searchInput = useRef<HTMLInputElement>(null);
    const latestWorkspace = useRef(workspace);
    const notify = (text: string, tone: Toast['tone'] = 'info') => setToast({ text, tone });
    // layout.tsx applies the saved theme before first paint; this only tracks it for the toggle.
    const [theme, setTheme] = useState<'dark' | 'light'>(() => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    function toggleTheme() {
        const next = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem(THEME_KEY, next); } catch { /* The theme still applies for this visit. */ }
        setTheme(next);
    }

    useEffect(() => {
        let cancelled = false;
        async function boot() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) { const parsed = parseWorkspace(JSON.parse(saved)); if (!cancelled) setWorkspace(parsed); }
                else {
                    const response = await fetch('/api/snapshot', { cache: 'no-store' }); const data = await response.json();
                    if (!response.ok) throw new Error(data.error);
                    const parsed = parseWorkspace({ snapshot: data, draft: initialDraft(data) });
                    if (!cancelled) setWorkspace(parsed);
                }
            } catch (e) { if (!cancelled) setError(errorMessage(e)); }
            finally { if (!cancelled) setReady(true); }
        }
        void boot(); return () => { cancelled = true; };
    }, []);
    useEffect(() => {
        latestWorkspace.current = workspace;
        if (!ready || !workspace) return;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)); setSavingError(''); }
        catch { setSavingError('Browser storage is full or unavailable. Export a backup now; new picks may not survive a reload.'); }
    }, [workspace, ready]);
    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(null), toast.tone === 'warn' ? 8000 : 3500);
        return () => clearTimeout(timer);
    }, [toast]);
    useEffect(() => {
        const keydown = (e: KeyboardEvent) => {
            if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && !document.querySelector('dialog[open]')) {
                e.preventDefault(); setTab(current => isList(current) ? current : 'fit'); requestAnimationFrame(() => searchInput.current?.focus());
            }
        };
        window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
    }, []);
    const computed = useMemo(() => {
        if (!workspace) return null;
        const evaluation = evaluateDraft(workspace.snapshot, workspace.draft), { ranked } = evaluation;
        const fit = ranked.filter(r => r.fitScore !== null).sort((a, b) => b.fitScore! - a.fitScore! || a.player.name.localeCompare(b.player.name));
        const roster = rosterPlayers(workspace.snapshot, workspace.draft);
        return { ...evaluation, fit, roster, assignment: assignRoster(roster), byId: new Map(workspace.snapshot.players.map(p => [p.id, p])),
            rankedById: new Map(ranked.map(r => [r.player.id, r])), available: availablePlayers(workspace.snapshot, workspace.draft).length };
    }, [workspace]);
    const targets = useMemo(() => new Set(workspace?.draft.targetIds ?? []), [workspace]);
    const board = useMemo(() => {
        if (!computed) return [];
        const term = search.trim().toLowerCase();
        // For Varrock lists only players we can draft, in recommendation order; Best available lists the whole pool by board estimate.
        const source = tab === 'fit' ? computed.fit : computed.ranked;
        const rank = new Map(source.filter(r => tab === 'fit' || (r.value.points ?? 0) > 0).map((r, i) => [r.player.id, i + 1]));
        const rows = source.filter(r => (!term || `${r.player.name} ${r.player.team}`.toLowerCase().includes(term)) &&
            (position === 'ALL' || r.player.positions.includes(position)) && (!targetsOnly || targets.has(r.player.id)) &&
            (tab === 'fit' || showUnrated || !!term || targetsOnly || (r.value.points ?? 0) > 0));
        return rows.map(row => ({ row, rank: rank.get(row.player.id) ?? null }));
    }, [computed, tab, search, position, showUnrated, targetsOnly, targets]);
    const prospects = useMemo(() => !computed ? [] : computed.ranked
        .filter(r => isProspect(r.player) && r.player.age !== null && r.player.age <= maxAge && (prospectPosition === 'ALL' || r.player.positions.includes(prospectPosition)) && (r.recommendationValue.points ?? r.value.points ?? 0) > 0)
        .sort((a, b) => (b.recommendationValue.points ?? 0) - (a.recommendationValue.points ?? 0)), [computed, maxAge, prospectPosition]);

    function update(change: (draft: Draft) => Draft) {
        setWorkspace(current => current && { ...current, draft: change(current.draft) });
    }
    function pick(player: Player, mine?: boolean, toMinors = false) {
        if (!workspace) return;
        try {
            const draft = recordPick(workspace.draft, player, mine, toMinors);
            setWorkspace({ ...workspace, draft }); setError('');
            const recorded = draft.picks.at(-1)!, team = recorded.team ?? (recorded.mine ? 'Varrock' : 'another team');
            if (!recorded.mine && targets.has(player.id)) notify(`Target gone: ${player.name} → ${team}`, 'warn');
            else notify(`${player.name} → ${team}${toMinors ? ' (minors)' : ''}`);
        } catch (e) { setError(errorMessage(e)); }
    }
    const toggle = (key: 'doNotDraftIds' | 'targetIds') => (id: string) => update(draft => {
        const ids = draft[key] ?? [];
        return { ...draft, [key]: ids.includes(id) ? ids.filter(p => p !== id) : [...ids, id] };
    });
    const toggleDoNotDraft = toggle('doNotDraftIds'), toggleTarget = toggle('targetIds');
    function undoPick(id: string) {
        if (!workspace) return;
        setWorkspace({ ...workspace, draft: { ...workspace.draft, picks: workspace.draft.picks.filter(p => p.id !== id), minorIds: workspace.draft.minorIds.filter(m => m !== id) } });
        notify(`Undid ${computed?.byId.get(id)?.name ?? 'pick'}`);
    }
    async function loadLatest() {
        setLoading(true); setError('');
        try {
            const response = await fetch('/api/snapshot', { cache: 'no-store' }); const snapshot: Snapshot & { error?: string } = await response.json();
            if (!response.ok) throw new Error(snapshot.error);
            parseWorkspace({ snapshot, draft: initialDraft(snapshot) });
            // Merge when the response arrives, so picks entered during the fetch cannot be overwritten.
            setWorkspace(current => mergeSnapshot(current, snapshot)); notify('Data reloaded. Picks and pool kept.');
        } catch (e) { setError(errorMessage(e)); }
        finally { setLoading(false); }
    }
    async function importFantraxOrder() {
        setLoadingOrder(true); setError('');
        try {
            const response = await fetch('/api/draft-order', { cache: 'no-store' });
            const data: DraftPlan & { rosters?: Record<string, string[]> | null; error?: string } = await response.json();
            if (!response.ok) throw new Error(data.error ?? 'Could not load the Fantrax draft order.');
            // Read the latest committed draft so picks entered during the request are preserved.
            const current = latestWorkspace.current;
            if (!current) return;
            const { rosters, ...plan } = data;
            const fromFantrax = rosters ? keeperCounts(current.snapshot.players, rosters, new Set(current.draft.picks.map(p => p.id))) : {};
            const keepers = Object.fromEntries(Object.entries({ ...current.draft.plan?.keepers, ...fromFantrax }).filter(([team]) => plan.order.includes(team) && team !== plan.myTeam));
            const draft = applyPlan(current.draft, { ...plan, keepers });
            setWorkspace({ ...current, draft });
            notify(`${draft.plan!.order.length} picks imported${rosters ? ` · keepers for ${Object.keys(keepers).length} teams` : ' · rosters unavailable'}`);
        } catch (e) { setError(errorMessage(e)); }
        finally { setLoadingOrder(false); }
    }
    async function importFile(file: File | undefined, kind: 'csv' | 'backup') {
        if (!file) return;
        setError('');
        try {
            if (file.size > 15_000_000) throw new Error('File exceeds the 15 MB import limit.');
            const text = await file.text();
            if (kind === 'backup') {
                const restored = parseWorkspace(JSON.parse(text));
                // Keep a recovery copy before an explicit backup restore replaces browser state.
                if (workspace) download(JSON.stringify(workspace), 'varrock-before-restore.json');
                setWorkspace(restored); notify('Backup restored.');
            } else if (workspace) {
                const { parsePoolCsv } = await import('../lib/csv');
                setPendingImport({ ...parsePoolCsv(text, workspace.snapshot, workspace.draft), name: file.name });
            }
        } catch (e) { setError(errorMessage(e)); }
    }
    function toggleMinor(id: string) {
        if (!workspace || !computed) return;
        const isMinor = workspace.draft.minorIds.includes(id);
        if (isMinor && computed.roster.length >= 16) { setError('Your playing roster is full. Move another player to minors first.'); return; }
        if (!isMinor && workspace.draft.minorIds.length >= 2) { setError('Both minor slots are occupied. Move a minor to the playing roster first.'); return; }
        setError('');
        update(draft => ({ ...draft, minorIds: isMinor ? draft.minorIds.filter(p => p !== id) : [...draft.minorIds, id] }));
    }
    function addKeeper(player: Player) {
        if (!computed) return;
        if (computed.roster.length >= 16) { setError('Your playing roster is full. Free a slot first.'); return; }
        update(draft => ({ ...draft, keeperIds: [...draft.keeperIds, player.id] })); setKeeperSearch('');
    }
    const fileInputs = <><input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={e => { void importFile(e.target.files?.[0], 'csv'); e.target.value = ''; }} />
        <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={e => { void importFile(e.target.files?.[0], 'backup'); e.target.value = ''; }} /></>;
    if (!workspace || !computed) return <main className="boot"><div className="brand-mark">V</div><h1>Varrock draft</h1>
        {error && <p className="error" role="alert">{error}</p>}
        {ready ? <><code>npm run draft:sync</code><div className="button-row"><button className="button primary" onClick={loadLatest} disabled={loading}>{loading ? 'Loading…' : 'Load local data'}</button><button className="button secondary" onClick={() => backupInput.current?.click()}>Restore backup</button></div></> : <p className="muted">Opening…</p>}{fileInputs}</main>;

    const { snapshot, draft } = workspace, { assignment, turn } = computed;
    const myTurn = !!draft.plan && turn.current?.team === draft.plan.myTeam;
    const rosterFull = computed.roster.length >= 16, minorsFull = draft.minorIds.length >= 2;
    const canDraft = !rosterFull && (!draft.plan || myTurn);
    const canRecord = !draft.plan || !!turn.current && (!myTurn || !rosterFull);
    const canMinors = !minorsFull && (!draft.plan || myTurn);
    // Show survival odds for the decision ahead: our upcoming pick, or the one after when we are on the clock.
    const oddsSlot = turn.first === null ? null : turn.before === 0 ? turn.next : turn.first;
    const oddsById = (id: string) => {
        const timing = computed.rankedById.get(id)?.timing;
        return !timing ? null : turn.before === 0 ? timing.atNext : timing.atPick;
    };
    const odds = (row: DraftCandidate) => oddsById(row.player.id);
    // A player's tier at the position being compared: the filter, else his roster role, else his first position.
    const tierFor = (row?: DraftCandidate, at?: Position) => row && computed.tierOf.get(`${at ?? row.role ?? row.player.positions[0]}:${row.player.id}`);
    // Tier headers need an unbroken single-position list in board order.
    const tierHeaders = tab === 'value' && position !== 'ALL' && !search.trim() && !targetsOnly;
    const listColumns = (tab === 'fit' ? 7 : 8) + (oddsSlot !== null ? 1 : 0);
    const knownOwned = new Set([...draft.keeperIds, ...draft.picks.map(p => p.id)]);
    const keeperCandidates = keeperSearch.trim() ? snapshot.players.filter(p => !knownOwned.has(p.id) && p.name.toLowerCase().includes(keeperSearch.toLowerCase())).slice(0, 12) : [];
    const pickedBy = new Map(draft.picks.map(p => [p.id, p.team ?? (p.mine ? 'Varrock' : 'Taken')]));
    const targetRows = (draft.targetIds ?? []).map(id => ({ id, player: computed.byId.get(id)!, row: computed.rankedById.get(id), takenBy: pickedBy.get(id) }))
        .sort((a, b) => Number(!!a.takenBy) - Number(!!b.takenBy) || (b.row?.value.points ?? 0) - (a.row?.value.points ?? 0));
    const pickButtons = (player: Player, minors = false) => <div className="row-actions">
        {minors && <button className="row-pick" disabled={!canMinors} onClick={() => pick(player, true, true)} title="Draft to a minor slot">Minors</button>}
        {draft.plan ? <button className={`row-pick ${myTurn ? 'mine' : ''}`} onClick={() => pick(player)} disabled={!canRecord} aria-label={`Draft ${player.name} for ${turn.current?.team ?? 'current team'}`}>{myTurn ? 'Draft' : 'Taken'}</button>
            : <><button className="row-pick mine" onClick={() => pick(player, true)} disabled={rosterFull} aria-label={`Draft ${player.name} for Varrock`}>Mine</button><button className="row-pick" onClick={() => pick(player, false)} aria-label={`Mark ${player.name} taken`}>Taken</button></>}
    </div>;

    return <>
        <header className={`topbar ${myTurn ? 'on-clock' : ''}`}><div className="topbar-inner">
            <div className="brand"><span className="brand-mark">V</span></div>
            <div className="turn">
                {!draft.plan ? <button className="button primary compact" onClick={importFantraxOrder} disabled={loadingOrder}>{loadingOrder ? 'Loading…' : 'Import Fantrax order'}</button>
                    : !turn.current ? <strong>Draft complete</strong>
                    : <><span className="turn-pick">#{turn.current.slot + 1}</span><strong className="turn-team">{myTurn ? 'Your pick' : turn.current.team}</strong>
                        {turn.first !== null && !myTurn && <span className="turn-next"><b>{turn.before}</b> until you · #{turn.first + 1}</span>}
                        {turn.first !== null && <span className="turn-later">{[turn.next, ...turn.remaining.filter(p => p.team === draft.plan!.myTeam && p.slot > (turn.next ?? Infinity)).map(p => p.slot)].filter((s): s is number => s !== null).slice(0, 4).map(s => `#${s + 1}`).join(' ')}</span>}</>}
            </div>
            <div className="topbar-actions">
                <button className="button header compact" onClick={toggleTheme} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`${theme === 'dark' ? 'Light' : 'Dark'} theme`}>{theme === 'dark' ? '☀' : '☾'}</button>
                <button className="button header compact" onClick={() => { const last = draft.picks.at(-1); if (last) undoPick(last.id); }} disabled={!draft.picks.length} title={draft.picks.length ? `Undo ${computed.byId.get(draft.picks.at(-1)!.id)?.name}` : undefined}>Undo</button>
                <button className="button header compact" onClick={() => download(JSON.stringify(workspace), `varrock-draft-${new Date().toISOString().slice(0, 10)}.json`)}>Backup</button>
                <span className={`save-dot ${savingError ? 'unsaved' : ''}`} title={savingError || 'Saved in this browser'} />
            </div>
        </div></header>
        <main className="shell">
            {error && <div className="banner error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
            {savingError && <div className="banner error" role="alert">{savingError}</div>}
            <div className="layout"><section className="main-column">
                <div className="cards">
                    <RecommendationCard item={computed.fit[0]} tier={tierFor(computed.fit[0])} alternatives={computed.fit.slice(1, 3)} canDraft={canDraft} target={!!computed.fit[0] && targets.has(computed.fit[0].player.id)} onList={() => setTab('fit')} onPick={p => pick(p, true)} onDetails={showDetails} onAvoid={toggleDoNotDraft} onTarget={toggleTarget} />
                    <ValueCard item={computed.bestAvailable} tier={tierFor(computed.bestAvailable)} canDraft={canDraft} target={!!computed.bestAvailable && targets.has(computed.bestAvailable.player.id)} onList={() => setTab('value')} onPick={p => pick(p, true)} onDetails={showDetails} onAvoid={toggleDoNotDraft} onTarget={toggleTarget} />
                </div>
                <section className="panel board">
                    <div className="tabs" role="tablist">
                        {([['fit', 'For Varrock', computed.fit.length], ['value', 'Best available', computed.available], ['prospects', 'Prospects', null], ['tiers', 'Tiers', null], ['log', 'Log', draft.picks.length]] as const).map(([id, label, count]) =>
                            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}{count !== null && <span className="count">{count.toLocaleString('en-CA')}</span>}</button>)}
                        <button className="tab-help" onClick={() => setModal('scoring')} aria-label="How values are calculated" title="How values are calculated">?</button>
                    </div>
                    {isList(tab) && <>
                        <div className="toolbar">
                            <label className="search"><input ref={searchInput} value={search} onChange={e => { setSearch(e.target.value); setLimit(PAGE); }} placeholder="Search" aria-label="Search players" /><kbd>/</kbd></label>
                            <div className="segmented" role="group" aria-label="Position">{(['ALL', ...POSITIONS] as const).map(p => <button key={p} aria-pressed={position === p} onClick={() => { setPosition(p); setLimit(PAGE); }}>{p === 'ALL' ? 'All' : p}</button>)}</div>
                            <button className={`toggle ${targetsOnly ? 'on' : ''}`} aria-pressed={targetsOnly} onClick={() => setTargetsOnly(v => !v)}>★ Targets</button>
                            {tab === 'value' && <button className={`toggle ${showUnrated ? 'on' : ''}`} aria-pressed={showUnrated} onClick={() => setShowUnrated(v => !v)}>Unrated</button>}
                        </div>
                        <div className="table-scroll"><table className="data-table">
                            <thead><tr><th className="col-rank">#</th><th>Player</th><th title="Players within 20 points of their tier's best are interchangeable. Tiers stay fixed through the draft.">Tier</th>
                                {tab === 'fit' ? <><th className="num" title="Expected points with projected games">Exp</th><th className="num" title="Points above the best player at this position expected to be left after the draft">vs waivers</th><th className="num" title="Points lost at this position by waiting until your next pick">If you wait</th></>
                                    : <><th className="num" title="Board estimate, fantasy points">Est</th><th className="num">Proj</th><th className="num">Last</th><th className="num" title="Board estimate minus the next-best available player at the same position. Red marks an unusually large drop.">Drop to next</th></>}
                                {oddsSlot !== null && <th className="num" title="Chance available, 64 simulated drafts">At #{oddsSlot + 1}</th>}<th>Fit</th><th><span className="sr-only">Actions</span></th></tr></thead>
                            <tbody>{board.slice(0, limit).map(({ row, rank }, index, rows) => {
                                const comparison = position === 'ALL' ? row.role ?? row.player.positions[0] : position;
                                const next = row.nextByPosition?.[comparison], outlook = row.outlook, tier = tierFor(row, comparison);
                                const header = tierHeaders && tier && (index === 0 || tierFor(rows[index - 1].row, comparison) !== tier);
                                return [header && <tr key={`tier-${tier.number}`} className={`tier-row ${tier.strongBreak ? 'tier-strong' : ''}`}><td colSpan={listColumns}><div className="tier-row-inner"><TierSummary tier={tier} slot={oddsSlot} useNext={turn.before === 0} /><span className="tier-range">{points(tier.top)}–{points(tier.bottom)}</span></div></td></tr>,
                                <tr key={row.player.id} className={[computed.fit[0]?.player.id === row.player.id && 'row-top', row.doNotDraft && 'row-avoid'].filter(Boolean).join(' ')}>
                                    <td className="col-rank">{rank ?? ''}</td>
                                    <td><PlayerCell player={row.player} target={targets.has(row.player.id)} onTarget={toggleTarget} onOpen={() => showDetails(row.player, comparison)} /></td>
                                    <td>{tier ? <span className={`tier-cell ${tier.left === 1 ? 'last' : ''}`} title={`${comparison} tier ${tier.number}: ${points(tier.top)}–${points(tier.bottom)}`}><span className="tier-badge">{comparison} T{tier.number}</span><small>{tier.left === 1 ? 'last' : `${tier.left} left`}</small></span> : <span className="muted">—</span>}</td>
                                    {tab === 'fit' ? <>
                                        <td className="num"><strong>{points(row.recommendationValue.points)}</strong><small>{points(row.recommendationValue.games)} gp</small></td>
                                        <td className="num">{outlook ? signed(outlook.overReplacement) : '—'}{outlook && <small>{row.role} ~{points(outlook.replacement)}</small>}</td>
                                        <td className="num">{outlook ? <span className={outlook.waitCost >= 40 ? 'drop drop-break' : 'drop'}>{outlook.waitCost ? `−${points(outlook.waitCost)}` : '0'}</span> : row.alternative ? `−${points(row.alternative.gap)}` : '—'}
                                            {outlook ? <small>{outlook.waitSlot === null ? 'waivers' : `#${outlook.waitSlot + 1}`} ~{points(outlook.wait)}</small> : row.alternative && <small className="next-name">{row.alternative.player.name}</small>}</td>
                                    </> : <>
                                        <td className="num"><strong>{points(row.value.points)}</strong><small>{rate(row.value.perGame)}</small></td>
                                        <td className="num muted">{points(row.value.projectedPoints)}</td>
                                        <td className="num muted">{points(row.player.previous?.points)}</td>
                                        <td className="num" title={next ? `Next ${comparison}: ${next.player.name} · ${points(next.points)}` : undefined}><span className={next?.tierBreak ? 'drop drop-break' : 'drop'}>{points(next?.gap)}</span>{next && <small className="next-name">{next.player.name}</small>}</td>
                                    </>}
                                    {oddsSlot !== null && <td className="num"><Odds value={odds(row)} /></td>}
                                    <td><span className={`fit ${row.fitScore === null ? 'muted' : row.slotWeight === 1 ? 'fit-starter' : ''}`}>{row.reason}</span></td>
                                    <td><div className="row-end"><button className="icon-button" aria-pressed={row.doNotDraft} title={row.doNotDraft ? 'Allow again' : 'Do not draft'} aria-label={`${row.doNotDraft ? 'Allow' : 'Do not draft'} ${row.player.name}`} onClick={() => toggleDoNotDraft(row.player.id)}>{row.doNotDraft ? '↺' : '✕'}</button>{pickButtons(row.player)}</div></td>
                                </tr>];
                            })}</tbody></table></div>
                        {!board.length && <p className="empty">No players match.</p>}
                        {board.length > limit && <button className="show-more" onClick={() => setLimit(n => n + PAGE)}>Show more · {board.length - limit} left</button>}
                    </>}
                    {tab === 'prospects' && <>
                        <div className="toolbar">
                            <div className="segmented" role="group" aria-label="Position">{(['ALL', ...POSITIONS] as const).map(p => <button key={p} aria-pressed={prospectPosition === p} onClick={() => setProspectPosition(p)}>{p === 'ALL' ? 'All' : p}</button>)}</div>
                            <div className="segmented" role="group" aria-label="Maximum age">{[21, 23, 25].map(age => <button key={age} aria-pressed={maxAge === age} onClick={() => setMaxAge(age)}>≤{age}</button>)}</div>
                            <span className="caption">Under {PROSPECT_GAMES} NHL GP across 2024–25 and 2025–26 · Minors {draft.minorIds.length}/2</span>
                        </div>
                        <div className="table-scroll"><table className="data-table">
                            <thead><tr><th>Player</th><th className="num">Age</th><th className="num" title="NHL games played">GP 24–25</th><th className="num" title="NHL games played">GP 25–26</th><th className="num" title="Expected points with projected games">Proj</th><th className="num">FP/G</th>{oddsSlot !== null && <th className="num">At #{oddsSlot + 1}</th>}<th><span className="sr-only">Actions</span></th></tr></thead>
                            <tbody>{prospects.slice(0, limit).map(row => <tr key={row.player.id} className={row.doNotDraft ? 'row-avoid' : ''}>
                                <td><PlayerCell player={row.player} target={targets.has(row.player.id)} onTarget={toggleTarget} onOpen={() => showDetails(row.player)} /></td>
                                <td className="num">{row.player.age}</td>
                                <td className="num muted">{points(row.player.gamesPlayed?.['2024-25'])}</td>
                                <td className="num muted">{points(row.player.gamesPlayed?.['2025-26'])}</td>
                                <td className="num"><strong>{points(row.recommendationValue.points)}</strong><small>{points(row.recommendationValue.games)} gp</small></td>
                                <td className="num">{rate(row.recommendationValue.perGame)}</td>
                                {oddsSlot !== null && <td className="num"><Odds value={odds(row)} /></td>}
                                <td><div className="row-end">{pickButtons(row.player, true)}</div></td>
                            </tr>)}</tbody></table></div>
                        {!prospects.length && <p className="empty">No players match.</p>}
                        {prospects.length > limit && <button className="show-more" onClick={() => setLimit(n => n + PAGE)}>Show more · {prospects.length - limit} left</button>}
                    </>}
                    {tab === 'tiers' && <TierBoard tiers={computed.tiers} depth={computed.depth} counts={assignment.counts} first={turn.first} next={turn.next} slot={oddsSlot} useNext={turn.before === 0} odds={oddsById} unknownTeams={computed.unknownTeams} targets={targets} onDetails={showDetails} onTarget={toggleTarget} />}
                    {tab === 'log' && (draft.picks.length ? <div className="table-scroll"><table className="data-table">
                        <tbody>{[...draft.picks].map((p, i) => ({ ...p, number: (p.slot ?? i) + 1 })).sort((a, b) => b.number - a.number).map(p => {
                            const player = computed.byId.get(p.id)!;
                            return <tr key={p.id} className={p.mine ? 'row-mine' : ''}><td className="col-rank">{p.number}</td>
                                <td><PlayerCell player={player} target={targets.has(p.id)} onTarget={toggleTarget} onOpen={() => showDetails(player)} /></td>
                                <td>{p.team ?? (p.mine ? 'Varrock' : 'Taken')}{draft.minorIds.includes(p.id) && <span className="chip chip-muted">Minors</span>}</td>
                                <td><div className="row-end"><button className="button ghost compact" onClick={() => undoPick(p.id)}>Undo</button></div></td></tr>;
                        })}</tbody></table></div> : <p className="empty">No picks yet.</p>)}
                </section>
            </section>
            <aside className="sidebar">
                <section className="panel side">
                    <div className="side-heading"><h2>Roster</h2><span className="caption">{computed.roster.length}/16 · Minors {draft.minorIds.length}/2</span></div>
                    <div className="needs">{POSITIONS.map(p => {
                        const count = assignment.counts[p], starters = STARTERS[p];
                        return <div key={p} className={count >= starters ? 'covered' : 'open'}><span>{p}</span><strong>{Math.min(count, starters)}/{starters}</strong>{count > starters && <small>+{count - starters}</small>}</div>;
                    })}</div>
                    <div className="roster-list">{POSITIONS.map(p => <div className="roster-row" key={p}><span className="roster-pos">{p}</span><div>
                        {computed.roster.filter(r => assignment.roles.get(r.id) === p).map(r => <button key={r.id} className={`roster-name ${draft.keeperIds.includes(r.id) ? '' : 'picked'}`} onClick={() => showDetails(r)}>{r.name}</button>)}
                        {!assignment.counts[p] && <span className="muted">—</span>}</div></div>)}
                        {computed.roster.some(r => !assignment.roles.has(r.id)) && <div className="roster-row"><span className="roster-pos">?</span><div>{computed.roster.filter(r => !assignment.roles.has(r.id)).map(r => <span key={r.id} className="roster-name">{r.name}</span>)}</div></div>}
                        <div className="roster-row"><span className="roster-pos">MIN</span><div>{draft.minorIds.map(id => <button key={id} className="roster-name" onClick={() => showDetails(computed.byId.get(id)!)}>{computed.byId.get(id)?.name}</button>)}{!draft.minorIds.length && <span className="muted">—</span>}</div></div>
                    </div>
                    <button className="link-button" onClick={() => setModal('keepers')}>Edit keepers & minors</button>
                </section>
                <section className="panel side">
                    <div className="side-heading"><h2>Targets</h2>{targetRows.length > 0 && <span className="caption">{targetRows.filter(t => !t.takenBy).length} left</span>}</div>
                    {targetRows.length ? <ul className="target-list">{targetRows.map(t => <li key={t.id} className={t.takenBy ? 'taken' : ''}>
                        <Star on name={t.player.name} onClick={() => toggleTarget(t.id)} />
                        <button className="target-name" onClick={() => showDetails(t.player)}>{t.player.name}</button>
                        <Positions player={t.player} />
                        {t.takenBy ? <span className="target-taken">{t.takenBy}</span> : <><span className="num">{points(t.row?.value.points)}</span>{oddsSlot !== null && t.row && <Odds value={odds(t.row)} />}</>}
                    </li>)}</ul> : <p className="caption">☆ players to track them here.</p>}
                </section>
                <section className="panel side setup">
                    <div className="setup-row"><span>Order</span><strong title={draft.plan?.fantraxFetchedAt ? `Fantrax · ${timestamp(draft.plan.fantraxFetchedAt)} ET` : undefined}>{draft.plan ? `${draft.plan.order.length} picks · ${Object.keys(draft.plan.keepers).length} keeper sets` : 'Not set'}</strong>
                        <div><button className="link-button" onClick={importFantraxOrder} disabled={loadingOrder}>{loadingOrder ? '…' : draft.plan ? 'Refresh' : 'Import'}</button><button className="link-button" onClick={() => setModal('order')}>Edit</button></div></div>
                    <div className="setup-row"><span>Pool</span><strong title={draft.importedAt ? `Imported ${timestamp(draft.importedAt)} ET` : undefined}>{draft.importedAt ? draft.poolLabel : 'Fantrax FAs'}</strong>
                        <div><button className="link-button" onClick={() => csvInput.current?.click()}>CSV</button></div></div>
                    <div className="setup-row"><span>Data</span><strong>{timestamp(snapshot.fetchedAt)}</strong>
                        <div><button className="link-button" onClick={loadLatest} disabled={loading}>{loading ? '…' : 'Reload'}</button><button className="link-button" onClick={() => backupInput.current?.click()}>Restore</button></div></div>
                    {snapshot.warnings.length > 0 && <button className="link-button warn" onClick={() => setModal('scoring')}>{snapshot.warnings.length} data warnings</button>}
                </section>
            </aside></div>
        </main>{fileInputs}
        {toast && <div className={`toast toast-${toast.tone}`} role="status"><span>{toast.text}</span><button onClick={() => setToast(null)} aria-label="Dismiss">×</button></div>}
        {modal === 'order' && <Modal title="Draft order" close={() => setModal(null)}><DraftOrderEditor draft={draft} save={plan => { setWorkspace({ snapshot, draft: applyPlan(draft, plan) }); setModal(null); notify('Draft order saved.'); }} /></Modal>}
        {details && <Modal title={details.player.name} close={() => setDetails(null)}>
            <PlayerDetails player={details.player} position={details.position} snapshot={snapshot} candidate={computed.rankedById.get(details.player.id)} first={turn.first} next={turn.next} target={targets.has(details.player.id)} onAvoid={toggleDoNotDraft} onTarget={toggleTarget} />
            {computed.rankedById.has(details.player.id) && <div className="button-row">{draft.plan
                ? <button className={`button ${myTurn ? 'primary' : 'secondary'}`} disabled={!canRecord} onClick={() => { pick(details.player); setDetails(null); }}>{myTurn ? 'Draft' : `Taken by ${turn.current?.team ?? 'current team'}`}</button>
                : <><button className="button primary" disabled={rosterFull} onClick={() => { pick(details.player, true); setDetails(null); }}>Draft for Varrock</button><button className="button secondary" onClick={() => { pick(details.player, false); setDetails(null); }}>Taken</button></>}
                <button className="button ghost" disabled={!canMinors} onClick={() => { pick(details.player, true, true); setDetails(null); }}>Draft to minors</button></div>}
        </Modal>}
        {modal === 'scoring' && <Modal title="How values work" close={() => setModal(null)}><dl className="definitions">
            <dt>Est</dt><dd>Board estimate: 60% projected + 40% last-season FP/G (less history under 25 GP), × 84 games for skaters with a 40-GP NHL season, otherwise projected games. Goalies use projected wins and shutouts plus their own save-% bonus rate.</dd>
            <dt>Best for Varrock</dt><dd>Expected points with projected games. Score = slot weight × (points − waiver level + cost of waiting). Starters (2 LW, 2 C, 2 RW, 4 D, 2 G) weigh 1; bench {BENCH_WEIGHT}.</dd>
            <dt>vs waivers</dt><dd>Points above the best player at that position expected to be left after the draft.</dd>
            <dt>If you wait</dt><dd>Points lost versus the best player at that position expected at your next pick.</dd>
            <dt>Tiers</dt><dd>Each position is split into the fewest groups whose players are within 20 board points of the group&rsquo;s best, with breaks at the biggest gaps. ▼ marks a real drop from the tier above. Tiers include drafted players so they stay fixed; &ldquo;~1.4 at #18&rdquo; is how many are expected to still be there.</dd>
            <dt>Drop to next</dt><dd>Board estimate minus the next-best available player at the same position, named underneath. In a mixed-position list that player is often not the next row. Red marks an unusually large drop.</dd>
            <dt>At #</dt><dd>Chance a player is still there at that pick, from 64 simulated drafts. Opponent needs come from their Fantrax rosters.</dd>
            <dt>Scoring</dt><dd>F: G 5, A 3. D: G 6, A 4. SOG and hits 0.25, blocks 0.5, GWG and STP 1. G: W 6, OTL 2, SO 4, plus SV% bonus.</dd>
            {snapshot.warnings.map(w => <dd key={w} className="warn">{w}</dd>)}
        </dl></Modal>}
        {pendingImport && <Modal title="Replace player pool?" close={() => setPendingImport(null)}>
            <dl className="stat-list"><dt>File</dt><dd>{pendingImport.name}</dd><dt>Pool</dt><dd>{pendingImport.ids.length}</dd><dt>Keepers excluded</dt><dd>{pendingImport.excludedKeepers}</dd><dt>Owned rows skipped</dt><dd>{pendingImport.ignoredOwned}</dd><dt>New, unrated</dt><dd>{pendingImport.added}</dd></dl>
            <div className="button-row"><button className="button primary" onClick={() => { setWorkspace({ snapshot: { ...snapshot, players: pendingImport.players }, draft: { ...draft, poolIds: pendingImport.ids, poolLabel: pendingImport.name, importedAt: new Date().toISOString() } }); notify('Player pool replaced.'); setPendingImport(null); }}>Replace pool</button><button className="button secondary" onClick={() => setPendingImport(null)}>Cancel</button></div>
        </Modal>}
        {modal === 'keepers' && <Modal title="Keepers & minors" close={() => setModal(null)}>{error && <p className="error" role="alert">{error}</p>}
            <div className="keeper-list">{[...draft.keeperIds, ...draft.picks.filter(p => p.mine).map(p => p.id)].map(id => { const p = computed.byId.get(id)!; return <div className="keeper-row" key={id}>
                <span><strong>{p.name}</strong> <Positions player={p} /></span>
                <button className="button secondary compact" onClick={() => toggleMinor(id)}>{draft.minorIds.includes(id) ? 'To roster' : 'To minors'}</button>
                {draft.keeperIds.includes(id) && <button className="icon-button" aria-label={`Remove ${p.name} from keepers`} title="Remove keeper" onClick={() => update(d => ({ ...d, keeperIds: d.keeperIds.filter(x => x !== id), minorIds: d.minorIds.filter(x => x !== id), poolIds: [...new Set([...d.poolIds, id])] }))}>✕</button>}
            </div>; })}</div>
            <label className="field-label">Add keeper<input value={keeperSearch} onChange={e => setKeeperSearch(e.target.value)} placeholder="Search all players" /></label>
            <div className="keeper-results">{keeperCandidates.map(p => <button key={p.id} onClick={() => addKeeper(p)}><span>{p.name} <small className="muted">{p.team} · {p.positions.join('/')}</small></span><span>+</span></button>)}</div>
        </Modal>}
    </>;
}

function PlayerDetails({ player, position, snapshot, candidate, first, next, target, onAvoid, onTarget }: {
    player: Player; position?: Position; snapshot: Snapshot; candidate?: DraftCandidate; first: number | null; next: number | null; target: boolean;
    onAvoid: (id: string) => void; onTarget: (id: string) => void;
}) {
    const value = valuePlayer(player, goalieBaseline(snapshot.players));
    const recommendation = candidate?.recommendationValue, timing = candidate?.timing, outlook = candidate?.outlook;
    const comparison = position ?? candidate?.role ?? player.positions[0];
    const nextPlayer = candidate?.nextByPosition?.[comparison];
    const missed = averageMissedGames(player);
    const goalie = player.positions.includes('G');
    const categories = goalie ? ['W', 'OL+ShL', 'SHO', 'SV%'] : ['G', 'A', 'SOG', 'GWG', 'STP', 'Hit', 'Blk'];
    return <div className="player-details">
        <div className="detail-meta"><Positions player={player} /><span>{player.team || 'FA'}</span>{player.age != null && <span>Age {player.age}</span>}<Flags player={player} />
            {candidate && <span className="detail-toggles"><Star on={target} name={player.name} onClick={() => onTarget(player.id)} /><button className="icon-button" aria-pressed={candidate.doNotDraft} title={candidate.doNotDraft ? 'Allow again' : 'Do not draft'} aria-label={candidate.doNotDraft ? 'Allow again' : 'Do not draft'} onClick={() => onAvoid(player.id)}>{candidate.doNotDraft ? '↺' : '✕'}</button></span>}</div>
        {player.note && <p className="source-note">{player.note}</p>}
        <div className="detail-grid">
            <div><span>Board est</span><strong>{points(value.points)}</strong><small>{rate(value.perGame)} × {points(value.games)}{value.confidence && ` · ${value.confidence}`}</small></div>
            {recommendation && <div><span>Expected</span><strong>{points(recommendation.points)}</strong><small>{points(recommendation.games)} gp{recommendation.confidence && ` · ${recommendation.confidence}`}</small></div>}
            {outlook && <div><span>vs waivers</span><strong>{signed(outlook.overReplacement)}</strong><small>{candidate?.role} waiver ~{points(outlook.replacement)}</small></div>}
            {outlook && <div><span>If you wait</span><strong>{outlook.waitCost ? `−${points(outlook.waitCost)}` : '0'}</strong><small>{outlook.waitSlot === null ? 'waivers' : `#${outlook.waitSlot + 1}`} ~{points(outlook.wait)}</small></div>}
            {candidate && (value.points ?? 0) > 0 && <div><span>Next {comparison}</span><strong>{nextPlayer ? `−${points(nextPlayer.gap)}` : '—'}</strong><small>{nextPlayer?.player.name ?? 'None'}</small></div>}
            {timing && first !== null && <div><span>Available</span><strong><Odds value={timing.atPick} /></strong><small>at #{first + 1}{next !== null && <> · <Odds value={timing.atNext} /> at #{next + 1}</>}</small></div>}
            {!goalie && <div><span>NHL GP</span><strong>{points(player.gamesPlayed?.['2024-25'])} · {points(player.gamesPlayed?.['2025-26'])}</strong><small>{missed === null ? '24–25 · 25–26' : `${rate(missed)} missed/season`}</small></div>}
        </div>
        <table className="data-table compact-table"><thead><tr><th></th><th className="num">2025–26</th><th className="num">2026–27 proj</th></tr></thead><tbody>
            <tr><td>GP</td><td className="num">{points(player.previous?.games)}</td><td className="num">{points(player.projected?.games)}</td></tr>
            <tr><td>FPts</td><td className="num">{points(player.previous?.points)}</td><td className="num">{points(player.projected?.points)}</td></tr>
            {categories.map(key => <tr key={key}><td>{key}</td><td className="num">{key === 'SV%' ? player.previous?.categories[key]?.toFixed(3) ?? '—' : points(player.previous?.categories[key])}</td><td className="num">{key === 'SV%' ? player.projected?.categories[key]?.toFixed(3) ?? '—' : points(player.projected?.categories[key])}</td></tr>)}
            {goalie && <tr><td>Adjusted</td><td className="num">—</td><td className="num">{points(value.projectedPoints)}</td></tr>}
        </tbody></table>
    </div>;
}
