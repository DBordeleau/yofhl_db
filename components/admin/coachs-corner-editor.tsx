'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Player from '@/components/coachs-corner/player';
import { archivoItalic } from '@/components/coachs-corner/fonts';
import { deleteEpisode, lookupPlayers, saveEpisode, unpublishEpisode } from '@/app/admin/coachs-corner/actions';
import { CAST, CHARACTERS, SHOTS, SOUNDS } from '@/lib/coachs-corner/cast';
import { parseScript, playerRefs } from '@/lib/coachs-corner/script';
import { compile, INTRO_MS } from '@/lib/coachs-corner/timeline';
import { findTeam, type StudioBanner, type StudioPlayer, type StudioTeam } from '@/lib/coachs-corner/teams';

interface EditableEpisode { id: number | null; slug: string; script: string; publishedAt: string | null }

const slugFrom = (title: string, week?: number) =>
    [week !== undefined ? `week-${week}` : null, title].filter(Boolean).join(' ')
        .toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;

const CHEATS: [string, string][] = [
    ['DON (point, firm): text', 'A line. Optional gesture, delivery, speed and “then <gesture>” for the pose afterwards.'],
    ['  indented text', 'Continues the line above. A blank line ends it.'],
    ['!!LOUD!!  **firm**', 'Yell and firm emphasis inside a line.'],
    ['{sneak fast: text}', 'Any delivery or speed for part of a line: sneak, deadpan, mock, warm, firm, yell; fast, slow.'],
    ['[beat]  [pause]  [1.5s]', 'A pause mid-line. Punctuation already adds natural pauses.'],
    ['[thumbs]  [ron: down]', 'Change the speaker’s gesture, or make the other host react, at that word.'],
    ['[don: stare, 1.9s] note', 'A stage line: poses, a silent hold, and a note that isn’t shown.'],
    ['>> matchup HH 41.5 NPD 38', 'Cut the monitor to a graphic (also inline as [>> …]).'],
    ['Line ending in --', 'Cut off: the next line starts immediately.'],
];

const GRAPHICS = [
    'off · bars · static · logo',
    'title "Big text" "small text"',
    'team HH "caption"',
    'matchup HH 41.5 NPD 38 "caption"',
    'pick 3 HH "Player" "detail"',
    'stat "76th" "Tom Wilson" "overall pick" Lali',
    'player "Tom Wilson" Lali hearts "76th overall"',
    'compare Reapers 158 TEEHAW 114.1, G 12 8, *Hit 29 17',
    'numbers HH 1 goal, 18 assists',
    'gap "Tom Wilson" "William Nylander" "Nico Hischier"',
    'list "Standings" HH 3-0, JAGR 2-1',
];

export default function ScriptEditor({ episode, teams, banners = [] }: { episode: EditableEpisode; teams: StudioTeam[]; banners?: StudioBanner[] }) {
    const router = useRouter();
    const [text, setText] = useState(episode.script);
    const [slug, setSlug] = useState(episode.slug);
    const [slugTouched, setSlugTouched] = useState(!!episode.slug);
    const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
    const [pending, startTransition] = useTransition();
    const [cue, setCue] = useState<{ t: number; n: number }>();
    const [playingLine, setPlayingLine] = useState<number | null>(null);
    const area = useRef<HTMLTextAreaElement>(null);
    const gutter = useRef<HTMLDivElement>(null);
    const deferred = useDeferredValue(text);

    const script = useMemo(() => parseScript(deferred, { knownTeam: ref => !!findTeam(teams, ref) }), [deferred, teams]);
    const tl = useMemo(() => compile(script), [script]);

    // headshots and stat lines for >> player graphics, fetched when the set of names changes
    const [players, setPlayers] = useState<StudioPlayer[]>([]);
    const names = playerRefs(script).join('|');
    useEffect(() => {
        if (!names) { setPlayers([]); return; }
        let live = true;
        const timer = window.setTimeout(() => {
            lookupPlayers(names.split('|')).then(found => { if (live) setPlayers(found); }).catch(() => {});
        }, 500);
        return () => { live = false; window.clearTimeout(timer); };
    }, [names]);
    const errors = script.diagnostics.filter(d => d.severity === 'error');
    const lineCount = text.split('\n').length;
    const marks = useMemo(() => {
        const m = new Map<number, 'error' | 'warning'>();
        for (const d of script.diagnostics) if (m.get(d.line) !== 'error') m.set(d.line, d.severity);
        return m;
    }, [script]);
    const effectiveSlug = slugTouched ? slug : slugFrom(script.meta.title, script.meta.week);

    const goToLine = (line: number) => {
        const el = area.current;
        if (!el) return;
        const lines = text.split('\n');
        const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
        el.focus();
        el.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
        el.scrollTop = Math.max(0, (line - 4) * lineHeight);
    };

    const previewFromCursor = () => {
        const el = area.current;
        const cursorLine = el ? el.value.slice(0, el.selectionStart).split('\n').length : 1;
        const line = tl.lines.find(l => l.sourceLine >= cursorLine) ?? tl.lines[tl.lines.length - 1];
        setCue(c => ({ t: line ? line.t0 : INTRO_MS, n: (c?.n ?? 0) + 1 }));
    };

    const onLine = useCallback((line: number) => setPlayingLine(line), []);

    const save = (publish?: boolean) => startTransition(async () => {
        if (episode.publishedAt && !publish) {
            setMessage({ tone: 'error', text: 'Use “Update published episode” to save changes to this live episode, or unpublish it first.' });
            return;
        }
        setMessage(null);
        let result;
        try { result = await saveEpisode({ id: episode.id, slug: effectiveSlug, script: text, publish }); }
        catch { setMessage({ tone: 'error', text: 'Could not save the episode. Please retry; your text is still here.' }); return; }
        if ('error' in result) { setMessage({ tone: 'error', text: result.error }); return; }
        setMessage({ tone: 'ok', text: publish ? 'Published.' : 'Saved.' });
        if (!episode.id) router.replace(`/admin/coachs-corner/${result.id}`);
        else router.refresh();
    });

    const unpublish = () => startTransition(async () => {
        if (!episode.id) return;
        try { await unpublishEpisode(episode.id); }
        catch { setMessage({ tone: 'error', text: 'Could not unpublish the episode. Please retry.' }); return; }
        setMessage({ tone: 'ok', text: 'Unpublished. It’s a draft again.' });
        router.refresh();
    });

    const remove = () => startTransition(async () => {
        if (!episode.id || !window.confirm('Delete this episode? This can’t be undone.')) return;
        try { await deleteEpisode(episode.id); }
        catch { setMessage({ tone: 'error', text: 'Could not delete the episode. Please retry.' }); return; }
        router.replace('/admin/coachs-corner');
    });

    return (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <section className="min-w-0">
                <div className="mb-3 flex flex-wrap items-end gap-3">
                    <label className="min-w-[240px] flex-1">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-[.12em] text-ink-muted">URL</span>
                        <span className="flex min-h-11 items-center rounded-xl border border-line-strong bg-white pl-3 text-sm focus-within:border-rink-blue">
                            <span className="text-ink-faint">/coachs-corner/</span>
                            <input value={effectiveSlug} onChange={e => { setSlug(e.target.value); setSlugTouched(true); }} className="min-w-0 flex-1 bg-transparent py-2 pr-3 font-semibold text-ink outline-none" spellCheck={false} />
                        </span>
                    </label>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${episode.publishedAt ? 'bg-[#DDF3E6] text-[#1E7A4D]' : 'bg-award-single text-gold-deep'}`}>{episode.publishedAt ? 'Published' : 'Draft'}</span>
                </div>

                <div className="flex overflow-hidden rounded-2xl border border-line-strong bg-[#0d1430] shadow-card focus-within:border-rink-blue">
                    <div ref={gutter} className="h-[62vh] min-h-[420px] w-12 flex-none select-none overflow-hidden py-3 text-right font-mono text-[13px] leading-[20px] text-[#56627a]" aria-hidden="true">
                        {Array.from({ length: lineCount }, (_, i) => {
                            const n = i + 1;
                            const mark = marks.get(n);
                            return (
                                <div key={n} className={`pr-2 ${mark === 'error' ? 'bg-[#4a1020] font-bold text-[#ff8a9a]' : mark === 'warning' ? 'text-[#f0c75e]' : ''} ${playingLine === n ? 'bg-[#1d2a57] text-white' : ''}`}>{n}</div>
                            );
                        })}
                    </div>
                    <textarea
                        ref={area}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onScroll={e => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
                        onKeyDown={e => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); previewFromCursor(); }
                            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
                        }}
                        spellCheck={false}
                        aria-label="Episode script"
                        className="h-[62vh] min-h-[420px] min-w-0 flex-1 resize-none whitespace-pre bg-transparent px-3 py-3 font-mono text-[13px] leading-[20px] text-[#e3eaf6] caret-[#ff5a6e] outline-none [scrollbar-color:#2a3866_transparent] selection:bg-[#24418f]"
                    />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {!episode.publishedAt && <button type="button" onClick={() => save()} disabled={pending} className="min-h-11 rounded-xl border border-line-strong bg-white px-4 text-sm font-bold text-ink hover:border-rink-blue disabled:opacity-50">Save draft</button>}
                    <button type="button" onClick={() => save(true)} disabled={pending || errors.length > 0} className="min-h-11 rounded-xl bg-rink-red px-5 text-sm font-bold text-white hover:bg-[#a50d26] disabled:cursor-not-allowed disabled:opacity-50">
                        {episode.publishedAt ? 'Update published episode' : 'Publish'}
                    </button>
                    {episode.publishedAt && <button type="button" onClick={unpublish} disabled={pending} className="min-h-11 rounded-xl px-3 text-sm font-bold text-ink-soft hover:text-ink">Unpublish</button>}
                    {episode.id && <button type="button" onClick={remove} disabled={pending} className="ml-auto min-h-11 rounded-xl px-3 text-sm font-bold text-rink-red hover:bg-[#fde8eb]">Delete</button>}
                    {message && <span role="status" className={`text-sm font-semibold ${message.tone === 'error' ? 'text-rink-red' : 'text-[#1E7A4D]'}`}>{message.text}</span>}
                </div>

                <div className="mt-4 rounded-2xl border border-line bg-white p-4" aria-live="polite">
                    {script.diagnostics.length === 0 ? (
                        <p className="text-sm font-semibold text-[#1E7A4D]">No problems. {tl.lines.length} lines, {mmss(tl.showEnd - INTRO_MS)} long.</p>
                    ) : (
                        <>
                            <p className="mb-2 text-sm font-bold">{errors.length ? `${errors.length} to fix before publishing` : 'Warnings'}</p>
                            <ul className="max-h-48 space-y-1 overflow-auto">
                                {script.diagnostics.map((d, i) => (
                                    <li key={i}>
                                        <button type="button" onClick={() => goToLine(d.line)} className="flex w-full gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ice">
                                            <span className={`w-14 flex-none font-mono text-xs font-bold leading-5 ${d.severity === 'error' ? 'text-rink-red' : 'text-gold-deep'}`}>Line {d.line}</span>
                                            <span className="text-ink-soft">{d.message}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            </section>

            <aside className={`min-w-0 xl:sticky xl:top-4 ${archivoItalic.variable}`}>
                <div className="rounded-2xl bg-[#070b18] p-2">
                    <Player script={deferred} teams={teams} players={players} banners={banners} keys="focus" cue={cue} onLine={onLine} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    <button type="button" onClick={previewFromCursor} className="min-h-11 rounded-xl bg-ink px-4 font-bold text-white hover:bg-[#232C4A]">Preview from cursor</button>
                    <span className="text-ink-muted">Ctrl+Enter in the script does the same. Ctrl+S saves drafts.</span>
                    {episode.publishedAt && <Link href={`/coachs-corner/${episode.slug}`} className="ml-auto font-bold text-rink-blue hover:text-ink">View live</Link>}
                </div>

                <details className="mt-4 rounded-2xl border border-line bg-white p-4" open>
                    <summary className="cursor-pointer text-sm font-bold">Script reference</summary>
                    <dl className="mt-3 grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-[minmax(0,15rem)_1fr]">
                        {CHEATS.map(([code, help]) => (
                            <div key={code} className="contents">
                                <dt><code className="rounded bg-ice px-1.5 py-0.5 font-mono text-[12px] text-ink">{code}</code></dt>
                                <dd className="text-ink-soft">{help}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className="mt-4 grid gap-4 text-[13px] sm:grid-cols-2">
                        <div>
                            <p className="mb-1 font-bold">Gestures</p>
                            {CHARACTERS.map(who => (
                                <p key={who} className="text-ink-soft"><b className="text-ink">{CAST[who].name}:</b> {Object.keys(CAST[who].gestures).join(', ')}</p>
                            ))}
                            <p className="mt-2 mb-1 font-bold">Camera and sound</p>
                            <p className="text-ink-soft">cam: {SHOTS.join(', ')}</p>
                            <p className="text-ink-soft">sfx: {SOUNDS.join(', ')}</p>
                        </div>
                        <div>
                            <p className="mb-1 font-bold">Monitor graphics</p>
                            {GRAPHICS.map(g => <p key={g}><code className="font-mono text-[12px] text-ink-soft">&gt;&gt; {g}</code></p>)}
                        </div>
                    </div>
                    <p className="mt-4 mb-1 text-[13px] font-bold">Teams</p>
                    <p className="text-[13px] leading-6 text-ink-soft">
                        {teams.map(t => <span key={t.id} className="mr-3 inline-block"><code className="font-mono text-[12px] font-bold text-ink">{t.abbreviation}</code> {t.ownerFirst ?? t.name}</span>)}
                    </p>
                </details>
            </aside>
        </div>
    );
}
