'use client';

import { FC, useState, useTransition } from 'react';
import { saveRoster } from '@/app/admin/actions';
import PlayerPicker from '@/components/admin/player-picker';
import SaveBar, { SaveStatus } from '@/components/admin/save-bar';
import type { AdminPlayer } from '@/lib/admin/data';
import { formatFpts } from '@/lib/league';

const byPoints = (a: AdminPlayer, b: AdminPlayer) => b.fpts - a.fpts || a.name.localeCompare(b.name);

const PlayerRow: FC<{ player: AdminPlayer; action: string; onClick: () => void; tone: 'add' | 'remove' }> = ({ player, action, onClick, tone }) => (
    <li className="flex min-h-12 items-center gap-3 border-b border-line-soft px-3 last:border-b-0">
        <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{player.name}</span>
            <span className="text-xs font-semibold text-ink-faint">
                {player.positions} · {player.team === 'FA' ? <span className="text-gold-deep">FA at season end</span> : player.team}
            </span>
        </span>
        <span className="tabular text-sm font-bold text-ink-muted">{formatFpts(player.fpts)}</span>
        <button
            type="button"
            onClick={onClick}
            className={`min-h-9 rounded-lg px-3 text-sm font-bold transition-colors ${tone === 'add' ? 'bg-rink-wash text-rink-blue hover:bg-rink-blue hover:text-white' : 'text-ink-muted hover:bg-award-multi hover:text-rink-red'}`}
        >
            {action}
        </button>
    </li>
);

// championship roster: starts from the champion's end-of-season roster; anyone from the season can be added
const RosterEditor: FC<{ year: number; championName: string; championAbbreviation: string; roster: AdminPlayer[]; suggestions: AdminPlayer[] }> = ({ year, championName, championAbbreviation, roster: initial, suggestions: initialSuggestions }) => {
    const [saved, setSaved] = useState(initial);
    const [roster, setRoster] = useState(initial);
    const [pending, startTransition] = useTransition();
    const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

    const ids = roster.map((p) => p.id);
    // the champion's end-of-season players who aren't on the ring list (including ones just removed)
    const suggestions = [...initialSuggestions, ...saved.filter((p) => p.team === championAbbreviation)]
        .filter((p, i, all) => !ids.includes(p.id) && all.findIndex((q) => q.id === p.id) === i)
        .sort(byPoints);
    const dirty = ids.length !== saved.length || ids.some((id) => !saved.some((p) => p.id === id));

    const add = (player: AdminPlayer) => setRoster((r) => (r.some((p) => p.id === player.id) ? r : [...r, player].sort(byPoints)));
    const remove = (id: string) => setRoster((r) => r.filter((p) => p.id !== id));

    const save = () =>
        startTransition(async () => {
            try {
                const result = await saveRoster(year, ids);
                setSaved(roster);
                setStatus({ kind: 'saved', message: `Saved: ${result.saved} players get a ${championName} ring.` });
            } catch (e) {
                setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Saving failed.' });
            }
        });

    return (
        <div className="flex flex-col gap-5">
            <div className="grid gap-5 lg:grid-cols-2">
                <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-[.14em] text-ink-muted">Ring roster ({roster.length})</h3>
                    {roster.length ? (
                        <ul className="overflow-hidden rounded-2xl border border-line bg-white">
                            {roster.map((p) => <PlayerRow key={p.id} player={p} action="Remove" tone="remove" onClick={() => remove(p.id)} />)}
                        </ul>
                    ) : (
                        <p className="rounded-2xl border-2 border-dashed border-line-strong px-4 py-6 text-center text-sm font-semibold text-ink-faint">No one yet. Add players from the suggestions or search.</p>
                    )}
                </div>
                <div className="flex flex-col gap-4">
                    <div>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-[.14em] text-ink-muted">Add anyone from the season</h3>
                        <PlayerPicker year={year} onPick={add} exclude={ids} />
                        <p className="mt-1.5 text-xs text-ink-faint">For players the champion dropped late in the season, who show up as free agents.</p>
                    </div>
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-[.14em] text-ink-muted">{championName} end-of-season roster ({suggestions.length})</h3>
                            {suggestions.length > 0 && (
                                <button type="button" onClick={() => suggestions.forEach(add)} className="min-h-9 rounded-lg px-3 text-sm font-bold text-rink-blue hover:bg-rink-wash">
                                    Add all
                                </button>
                            )}
                        </div>
                        {suggestions.length ? (
                            <ul className="max-h-[420px] overflow-y-auto rounded-2xl border border-line bg-white">
                                {suggestions.map((p) => <PlayerRow key={p.id} player={p} action="Add" tone="add" onClick={() => add(p)} />)}
                            </ul>
                        ) : (
                            <p className="text-sm text-ink-faint">Everyone on the end-of-season roster is on the ring roster.</p>
                        )}
                    </div>
                </div>
            </div>
            <SaveBar dirty={dirty} pending={pending} status={status} onSave={save} onReset={() => setRoster(saved)} label="Save roster" />
        </div>
    );
};

export default RosterEditor;
