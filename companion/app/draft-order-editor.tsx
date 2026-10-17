'use client';

import { useState } from 'react';
import { POSITIONS, type Draft } from '../lib/model';
import { parseOrder, type DraftPlan, type PositionCounts } from '../lib/order';

export default function DraftOrderEditor({ draft, save }: { draft: Draft; save: (plan: DraftPlan) => void }) {
    const [text, setText] = useState(draft.plan?.order.join('\n') ?? '');
    const [myTeam, setMyTeam] = useState(draft.plan?.myTeam ?? '');
    const [keepers, setKeepers] = useState(draft.plan?.keepers ?? {});
    const [error, setError] = useState('');
    const order = parseOrder(text), teams = [...new Set(order)];
    const selected = myTeam || teams.find(team => /varrock/i.test(team)) || '';
    function submit(e: React.FormEvent) {
        e.preventDefault();
        try { save({ order, myTeam: selected, keepers: Object.fromEntries(Object.entries(keepers).filter(([team]) => teams.includes(team) && team !== selected)),
            ...(selected === draft.plan?.myTeam && JSON.stringify(order) === JSON.stringify(draft.plan.order) ? { fantraxFetchedAt: draft.plan.fantraxFetchedAt } : {}) }); }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not save the draft order.'); }
    }
    return <form className="order-editor" onSubmit={submit}>
        <label className="field-label">Pick owners, one per line<textarea rows={9} maxLength={50000} value={text} onChange={e => setText(e.target.value)} placeholder={'Team A\nVarrock Dark Wizards\nTeam B\nTeam A\nVarrock Dark Wizards'} required /></label>
        <div className="order-summary"><label className="field-label">Your team<select value={selected} onChange={e => setMyTeam(e.target.value)} required><option value="">Choose team</option>{teams.map(team => <option key={team}>{team}</option>)}</select></label><span>{order.length} picks · {order.filter(team => team === selected).length} yours</span></div>
        <details className="order-counts"><summary>Opponent keepers · {Object.keys(keepers).filter(team => team !== selected && teams.includes(team)).length}/{teams.filter(team => team !== selected).length}</summary>
            {teams.filter(team => team !== selected).map(team => <div className="opponent-counts" key={team}>
                <label className="checkbox"><input type="checkbox" checked={Object.hasOwn(keepers, team)} onChange={e => setKeepers(current => {
                    const next = { ...current }; if (e.target.checked) next[team] = { LW: 0, C: 0, RW: 0, D: 0, G: 0 }; else delete next[team]; return next;
                })} />{team}</label>
                {Object.hasOwn(keepers, team) && <div className="counts-inputs">{POSITIONS.map(p => <label key={p}>{p}<input aria-label={`${team} ${p} keepers`} type="number" min={0} max={16} required value={Number.isFinite(keepers[team][p]) ? keepers[team][p] : ''} onChange={e => setKeepers(current => ({ ...current, [team]: { ...current[team], [p]: e.target.valueAsNumber } as PositionCounts }))} /></label>)}</div>}
            </div>)}
        </details>
        {order.length > 0 && <details className="order-preview"><summary>Review pick order</summary><ol>{order.map((team, i) => <li key={i} className={team === selected ? 'your-turn' : ''}>{team}</li>)}</ol></details>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="button-row"><button className="button primary" type="submit">Save draft order</button></div>
    </form>;
}
