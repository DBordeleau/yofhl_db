'use client';

import { FC, useEffect, useId, useState } from 'react';
import { findSeasonPlayers } from '@/app/admin/actions';
import type { AdminPlayer } from '@/lib/admin/data';
import { formatFpts } from '@/lib/league';

// search box over everyone with stats in the season; pick a result to use it
const PlayerPicker: FC<{ year: number; onPick: (player: AdminPlayer) => void; placeholder?: string; exclude?: string[] }> = ({ year, onPick, placeholder = 'Search players from this season', exclude = [] }) => {
    const id = useId();
    const [q, setQ] = useState('');
    const [results, setResults] = useState<AdminPlayer[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (q.trim().length < 2) {
            setResults([]);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            setBusy(true);
            try {
                const found = await findSeasonPlayers(year, q);
                if (!cancelled) setResults(found);
            } finally {
                if (!cancelled) setBusy(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [q, year]);

    const shown = results.filter((p) => !exclude.includes(p.id));

    return (
        <div className="relative">
            <label htmlFor={id} className="sr-only">{placeholder}</label>
            <input
                id={id}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder}
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-line-strong bg-white px-3.5 text-[15px] outline-none focus:border-rink-blue focus:shadow-[0_0_0_3px_rgba(31,111,194,.15)]"
            />
            {q.trim().length >= 2 && (
                <div className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-[0_24px_48px_-24px_rgba(31,39,69,.45)]">
                    {busy && !shown.length && <div className="px-3 py-2.5 text-sm text-ink-muted">Searching…</div>}
                    {!busy && !shown.length && <div className="px-3 py-2.5 text-sm text-ink-muted">No players found</div>}
                    {shown.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                                onPick(p);
                                setQ('');
                            }}
                            aria-label={`${p.name}, ${p.positions}, ${p.team === 'FA' ? 'free agent' : p.team}, ${formatFpts(p.fpts)} fantasy points`}
                            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left hover:bg-rink-wash"
                        >
                            <span className="min-w-0">
                                <span className="block truncate font-bold">{p.name}</span>
                                <span className="text-xs font-semibold text-ink-faint">{p.positions} · {p.team}</span>
                            </span>
                            <span className="tabular text-sm font-bold text-ink-muted">{formatFpts(p.fpts)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PlayerPicker;
