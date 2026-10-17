'use client';

import { useEffect, useRef } from 'react';
import type { Player } from '../lib/model';
import InjuryFlag, { StatusFlag } from './injury-flag';

export const points = (n: number | null | undefined) => n == null ? '—' : Math.round(n).toLocaleString('en-CA');
export const rate = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const signed = (n: number) => `${n >= 0 ? '+' : '−'}${points(Math.abs(n))}`;

export function Positions({ player }: { player: Player }) {
    return <span className="positions">{player.positions.map(p => <span key={p} className={`pos pos-${p}`}>{p}</span>)}</span>;
}

export function Flags({ player }: { player: Player }) {
    return <><InjuryFlag player={player} /><StatusFlag player={player} /></>;
}

export function Star({ on, name, onClick }: { on: boolean; name: string; onClick: () => void }) {
    return <button className={`star ${on ? 'on' : ''}`} aria-pressed={on} aria-label={`${on ? 'Remove' : 'Add'} ${name} ${on ? 'from' : 'to'} targets`} title={on ? 'Remove target' : 'Add target'} onClick={onClick}>{on ? '★' : '☆'}</button>;
}

export function PlayerCell({ player, target, onTarget, onOpen }: { player: Player; target: boolean; onTarget: (id: string) => void; onOpen: () => void }) {
    return <div className="player-cell"><Star on={target} name={player.name} onClick={() => onTarget(player.id)} />
        <button className="player-name" onClick={onOpen}>{player.name}</button>
        <span className="player-meta"><Positions player={player} /><span className="team">{player.team || 'FA'}</span><Flags player={player} /></span></div>;
}

export function Odds({ value }: { value: number | null | undefined }) {
    if (value == null) return <span className="muted">—</span>;
    return <span className={`odds ${value >= 0.7 ? 'odds-high' : value >= 0.3 ? 'odds-mid' : 'odds-low'}`}>{Math.round(value * 100)}%</span>;
}

export function Modal({ title, close, children, wide }: { title: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => { dialog.current?.showModal(); }, []);
    return <dialog ref={dialog} className={`modal ${wide ? 'modal-wide' : ''}`} aria-label={title} onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}>
        <div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Close">×</button></div>
        <div className="modal-body">{children}</div>
    </dialog>;
}
