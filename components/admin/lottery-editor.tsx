'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import TeamBadge from '@/components/team-badge';
import { cancelLottery, saveLottery } from '@/app/admin/lottery/actions';
import { easternInput, finalRevealAt, FINALE_MS, formatEastern, type LotteryInput, type LotteryRecord, type LotteryTeam } from '@/lib/lottery/model';

const control = 'min-h-11 rounded-xl border border-line-strong bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rink-blue disabled:bg-ice';
const defaultEntries = (teams: LotteryTeam[]) => teams.map((team, index) => ({ id: team.id, odds: [40, 30, 20, 10][index] ?? null }));
const LotteryPreview = dynamic(() => import('./lottery-preview'));

export default function LotteryEditor({ initial, teams }: { initial: LotteryRecord | null; teams: LotteryTeam[] }) {
    const router = useRouter();
    const [saved, setSaved] = useState(initial);
    const [creating, setCreating] = useState(!initial);
    const [title, setTitle] = useState(initial?.title ?? 'YOFHL Draft Lottery');
    const [dateTime, setDateTime] = useState(initial ? easternInput(initial.startsAt) : '');
    const [entries, setEntries] = useState<LotteryInput['entries']>(initial?.entries.map(({ id, odds }) => ({ id, odds })) ?? defaultEntries(teams));
    const [now, setNow] = useState(0);
    const [message, setMessage] = useState<{ error?: string; success?: string }>({});
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [pending, setPending] = useState(false);
    const [preview, setPreview] = useState(false);
    useEffect(() => {
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
    const started = !creating && !!saved && now >= new Date(saved.startsAt).getTime();
    const complete = started && !!saved?.winnerId && now >= finalRevealAt(saved.startsAt, saved.entries) + FINALE_MS;
    useEffect(() => {
        if (!started || complete) return;
        const timer = setInterval(() => router.refresh(), 10_000);
        return () => clearInterval(timer);
    }, [started, complete, router]);
    useEffect(() => {
        if (initial?.winnerId && initial.id === saved?.id && !saved.winnerId) setSaved(initial);
    }, [initial, saved]);
    const total = entries.reduce((sum, entry) => sum + Math.round((entry.odds ?? 0) * 100), 0) / 100;
    const participants = entries.filter((entry) => entry.odds !== null).length;
    const dirty = creating || title !== saved?.title || dateTime !== easternInput(saved.startsAt) ||
        JSON.stringify(entries) !== JSON.stringify(saved.entries.map(({ id, odds }) => ({ id, odds })));

    const move = (index: number, direction: number) => {
        const next = [...entries];
        [next[index], next[index + direction]] = [next[index + direction], next[index]];
        setEntries(next);
        setMessage({});
    };

    const save = async () => {
        if (pending) return;
        setPending(true);
        setMessage({});
        try {
            const result = await saveLottery({ id: creating ? null : saved!.id, version: saved?.version ?? 0, title, easternDateTime: dateTime, entries });
            if (result.error) setMessage({ error: result.error });
            else if (result.lottery) {
                setSaved(result.lottery);
                setCreating(false);
                setMessage({ success: `Scheduled for ${formatEastern(result.lottery.startsAt)}. The room is ready to share.` });
                router.refresh();
            }
        } catch {
            setMessage({ error: 'Could not save. Check your connection and admin session, then try again.' });
        } finally {
            setPending(false);
        }
    };

    return <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-ink p-5 text-white md:p-6">
            <div><p className="font-wide text-lg font-extrabold">One draw. The whole league watching.</p>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-300">The winning team moves to pick #1. All other teams keep their relative order. The live room reveals the full order automatically, with the first two picks announced together.</p></div>
            {saved && !creating && <Link href={`/lottery?id=${saved.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-white/30 px-4 text-sm font-bold hover:bg-white/10">Open lottery room ↗</Link>}
        </div>
        {started && <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gold-light bg-gold-tint p-5">
            <div><p className="font-bold">{complete ? 'Lottery concluded' : 'Lottery is live'}</p><p className="mt-1 text-sm text-ink-soft">The schedule, odds and order are locked once the event starts.</p></div>
            {complete && <button type="button" className="min-h-11 rounded-xl bg-ink px-4 text-sm font-bold text-white" onClick={() => {
                setCreating(true); setTitle('YOFHL Draft Lottery'); setDateTime(''); setEntries(defaultEntries(teams)); setMessage({});
            }}>Schedule another lottery</button>}
        </div>}
        <form onSubmit={(event) => { event.preventDefault(); save(); }} className="space-y-6">
            <fieldset disabled={pending || started} className="grid gap-5 rounded-3xl border border-line bg-white p-5 md:grid-cols-2 md:p-7">
                <legend className="sr-only">Event details</legend>
                <label className="flex flex-col gap-2 text-sm font-bold">Event title
                    <input className={control} maxLength={80} required value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-bold">Date & time · Eastern Time
                    <input type="datetime-local" className={`${control} max-w-full`} required value={dateTime} onChange={(event) => setDateTime(event.target.value)} />
                    <span className="text-xs font-normal text-ink-muted">Toronto / New York time. EST and EDT are handled automatically.</span>
                </label>
                <p className="text-sm leading-relaxed text-ink-muted md:col-span-2">The “Draft Lottery” navigation link appears 24 hours before the start, changes to a red Live badge during the reveal, then shows Results. You can share the room link as soon as you schedule it.</p>
            </fieldset>
            <fieldset disabled={pending || started} className="overflow-hidden rounded-3xl border border-line bg-white">
                <legend className="sr-only">Starting draft order and lottery odds</legend>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5 md:p-7">
                    <div><h2 className="font-wide text-xl font-extrabold">Starting draft order</h2>
                        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">Use the arrows to set every team’s position, including teams outside the lottery. Turn Lottery on or off to add or remove a participant.</p></div>
                    <div className={`rounded-xl px-4 py-3 ${total === 100 && participants >= 2 ? 'bg-[#DDF3E6] text-[#1E7A4D]' : 'bg-award-single text-gold-deep'}`}>
                        <p className="text-2xl font-black tabular-nums">{total.toFixed(2).replace(/\.00$/, '')}% <span className="text-xs font-semibold">/ 100%</span></p>
                        <p className="mt-1 text-xs font-semibold">{participants} lottery teams</p>
                    </div>
                </div>
                <ol className="divide-y divide-line-soft">
                    {entries.map((entry, index) => {
                        const team = saved?.entries.find((team) => team.id === entry.id) ?? teams.find((team) => team.id === entry.id)!;
                        const logo = teams.find((team) => team.id === entry.id)?.logo ?? team.logo;
                        return <li key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-4 md:px-7">
                            <span className="w-6 text-center text-lg font-black tabular-nums text-ink-muted">{index + 1}</span>
                            <TeamBadge logo={logo} abbreviation={team.abbreviation} teamName={team.name} size={40} ring="none" />
                            <span className="min-w-0 flex-1 basis-24 text-sm font-bold">{team.name}</span>
                            <div className="flex gap-1">
                                <button type="button" aria-label={`Move ${team.name} up`} disabled={index === 0 || started || pending} onClick={() => move(index, -1)} className="h-11 w-9 rounded-lg border border-line text-lg hover:bg-ice disabled:opacity-25">↑</button>
                                <button type="button" aria-label={`Move ${team.name} down`} disabled={index === entries.length - 1 || started || pending} onClick={() => move(index, 1)} className="h-11 w-9 rounded-lg border border-line text-lg hover:bg-ice disabled:opacity-25">↓</button>
                            </div>
                            <div className="flex w-full items-center justify-end gap-4 pl-9 sm:w-auto sm:pl-0">
                                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
                                    <input type="checkbox" className="h-5 w-5 accent-rink-blue" checked={entry.odds !== null} aria-label={`${team.name} participates in lottery`}
                                        onChange={(event) => setEntries(entries.map((item) => item.id === entry.id ? { ...item, odds: event.target.checked ? 10 : null } : item))} />Lottery
                                </label>
                                {entry.odds !== null ? <label className="flex items-center gap-1 text-sm font-bold">
                                    <input type="number" min="0.01" max="100" step="0.01" required aria-label={`${team.name} odds percent`} className={`${control} w-20 text-right tabular-nums`}
                                        value={Number.isNaN(entry.odds) ? '' : entry.odds} onChange={(event) => setEntries(entries.map((item) => item.id === entry.id ? { ...item, odds: event.target.valueAsNumber } : item))} />%
                                </label> : <span className="w-[92px] text-center text-xs font-semibold text-ink-faint">Fixed order</span>}
                            </div>
                        </li>;
                    })}
                </ol>
            </fieldset>
            {!started && <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={pending || !dirty || total !== 100 || participants < 2} className="min-h-12 rounded-xl bg-rink-blue px-6 text-sm font-bold text-white hover:bg-ink disabled:cursor-not-allowed disabled:opacity-40">{pending ? 'Saving…' : creating ? 'Schedule lottery' : 'Save changes'}</button>
                {total !== 100 && <p className="text-sm text-gold-deep">Adjust the odds to total exactly 100%.</p>}
                {!creating && saved && !confirmCancel && <button type="button" onClick={() => setConfirmCancel(true)} className="min-h-11 px-4 text-sm font-bold text-rink-red">Cancel lottery</button>}
            </div>}
            <div role="status" className={`text-sm font-semibold ${message.error ? 'text-rink-red' : 'text-[#1E7A4D]'}`}>{message.error ?? message.success}</div>
        </form>
        {confirmCancel && !started && <div className="rounded-2xl border border-rink-red/30 bg-white p-5">
            <p className="font-bold">Cancel this scheduled lottery?</p><p className="mt-1 text-sm text-ink-muted">The navigation link and room will be taken offline.</p>
            <div className="mt-3 flex gap-3"><button disabled={pending} className="min-h-11 rounded-xl bg-rink-red px-4 text-sm font-bold text-white" onClick={async () => {
                setPending(true);
                try {
                    const result = await cancelLottery(saved!.id, saved!.version);
                    if (result.error) setMessage({ error: result.error });
                    else { setSaved(null); setCreating(true); setDateTime(''); setMessage({ success: 'Lottery cancelled.' }); router.refresh(); }
                } catch { setMessage({ error: 'Could not cancel. Check your connection and admin session.' }); }
                setConfirmCancel(false);
                setPending(false);
            }}>Yes, cancel lottery</button><button className="min-h-11 px-4 text-sm font-bold" onClick={() => setConfirmCancel(false)}>Keep lottery</button></div>
        </div>}
        <button type="button" aria-expanded={preview} onClick={() => setPreview(!preview)} disabled={participants < 2 || !Number.isFinite(total)} className="min-h-11 rounded-xl border border-line-strong bg-white px-4 text-sm font-bold text-ink hover:bg-rink-wash disabled:opacity-40">{preview ? 'Close presentation preview' : 'Preview presentation'}</button>
        {preview && participants >= 2 && Number.isFinite(total) && <LotteryPreview key={JSON.stringify([title, dateTime, entries])} title={title} easternDateTime={dateTime} entries={entries.map((entry) => {
            const team = saved?.entries.find((team) => team.id === entry.id) ?? teams.find((team) => team.id === entry.id)!;
            return { ...team, logo: teams.find((team) => team.id === entry.id)?.logo ?? team.logo, odds: entry.odds };
        })} />}
    </div>;
}
