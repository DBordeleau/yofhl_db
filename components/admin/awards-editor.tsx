'use client';

import { FC, useState, useTransition } from 'react';
import { saveAwards } from '@/app/admin/actions';
import PlayerPicker from '@/components/admin/player-picker';
import SaveBar, { SaveStatus } from '@/components/admin/save-bar';
import type { AdminAward, AdminPlayer } from '@/lib/admin/data';
import { formatFpts } from '@/lib/league';

type Picks = Record<string, AdminPlayer | null>;

// The season's award winners: editable, one per award, unless the season's award vote is published, when they are
// the vote's (co-winners included) and only shown.
const AwardsEditor: FC<{ year: number; awards: AdminAward[]; published?: boolean }> = ({ published = false, ...props }) =>
    published ? <PublishedAwards awards={props.awards} /> : <EditableAwards {...props} />;

const PublishedAwards: FC<{ awards: AdminAward[] }> = ({ awards }) => {
    // a published award has a row per co-winner
    const byAward = new Map<string, { award: AdminAward; winners: AdminPlayer[] }>();
    for (const award of awards) {
        const entry = byAward.get(award.name) ?? { award, winners: [] };
        if (award.winner) entry.winners.push(award.winner);
        byAward.set(award.name, entry);
    }
    return (
        <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">This season&apos;s award vote is published, so these are its winners and can&apos;t be changed here.</p>
            <ul className="grid gap-3 md:grid-cols-2">
                {[...byAward.values()].map(({ award, winners }) => (
                    <li key={award.name} className="rounded-2xl border border-line bg-white p-4">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="font-bold">{award.label}</span>
                            <span className="text-xs font-bold uppercase tracking-[.12em] text-ink-faint">{award.honor}</span>
                        </div>
                        {winners.length ? winners.map((winner) => (
                            <div key={winner.id} className="mt-3 flex min-h-11 items-center rounded-xl bg-award-single px-3">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-bold">{winner.name}</span>
                                    <span className="text-xs font-semibold text-ink-muted">{winner.positions} · {winner.team} · {formatFpts(winner.fpts)} FPts</span>
                                </span>
                            </div>
                        )) : <p className="mt-3 text-sm font-semibold text-ink-faint">No winner</p>}
                    </li>
                ))}
            </ul>
        </div>
    );
};

// one winner per award for the season
const EditableAwards: FC<{ year: number; awards: AdminAward[] }> = ({ year, awards }) => {
    const initial: Picks = Object.fromEntries(awards.map((a) => [a.name, a.winner]));
    const [saved, setSaved] = useState<Picks>(initial);
    const [picks, setPicks] = useState<Picks>(initial);
    const [pending, startTransition] = useTransition();
    const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

    const dirty = awards.some((a) => (picks[a.name]?.id ?? null) !== (saved[a.name]?.id ?? null));
    const set = (award: string, player: AdminPlayer | null) => setPicks((p) => ({ ...p, [award]: player }));

    const save = () =>
        startTransition(async () => {
            try {
                // only send awards that changed, so a save never touches the others
                const changed = awards.filter((a) => (picks[a.name]?.id ?? null) !== (saved[a.name]?.id ?? null));
                await saveAwards(year, changed.map((a) => ({ award: a.name, playerId: picks[a.name]?.id ?? null })));
                setSaved(picks);
                setStatus({ kind: 'saved', message: `Saved ${changed.length} award${changed.length === 1 ? '' : 's'}.` });
            } catch (e) {
                setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Saving failed.' });
            }
        });

    return (
        <div className="flex flex-col gap-5">
            <ul className="grid gap-3 md:grid-cols-2">
                {awards.map((award) => {
                    const winner = picks[award.name];
                    return (
                        <li key={award.name} className="rounded-2xl border border-line bg-white p-4">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="font-bold">{award.label}</span>
                                <span className="text-xs font-bold uppercase tracking-[.12em] text-ink-faint">{award.honor}</span>
                            </div>
                            {winner ? (
                                <div className="mt-3 flex min-h-11 items-center gap-3 rounded-xl bg-award-single px-3">
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-bold">{winner.name}</span>
                                        <span className="text-xs font-semibold text-ink-muted">{winner.positions} · {winner.team} · {formatFpts(winner.fpts)} FPts</span>
                                    </span>
                                    <button type="button" onClick={() => set(award.name, null)} className="min-h-9 rounded-lg px-3 text-sm font-bold text-ink-muted hover:bg-white hover:text-rink-red">
                                        Clear
                                    </button>
                                </div>
                            ) : (
                                <p className="mt-3 text-sm font-semibold text-ink-faint">No winner set</p>
                            )}
                            <div className="mt-3">
                                <PlayerPicker year={year} onPick={(p) => set(award.name, p)} placeholder={winner ? `Change the ${award.label} winner` : `Choose the ${award.label} winner`} />
                            </div>
                        </li>
                    );
                })}
            </ul>
            <SaveBar dirty={dirty} pending={pending} status={status} onSave={save} onReset={() => setPicks(saved)} label="Save awards" />
        </div>
    );
};

export default AwardsEditor;
