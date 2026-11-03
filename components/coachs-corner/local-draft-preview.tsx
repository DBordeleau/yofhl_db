'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Player from './player';
import { createShowAudio } from './audio';
import { scriptAirDate, type Episode } from '@/lib/coachs-corner/episode';
import type { StudioPlayer, StudioTeam } from '@/lib/coachs-corner/teams';
import type { DraftReport } from '@/lib/coachs-corner/production/local-drafts';
import { episodeShareCard } from '@/lib/share/model';

export default function LocalDraftPreview({ slug, script, episode, teams, players, report }: { slug: string; script: string; episode: Episode; teams: StudioTeam[]; players: StudioPlayer[]; report: DraftReport }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [cue, setCue] = useState<{ t: number; n: number }>();
    const [activeLine, setActiveLine] = useState<number>();
    const [audio] = useState(() => createShowAudio());
    const [audioError, setAudioError] = useState('');
    const { timeline, summary } = episode;
    // the card this episode will share once published, dated the way the pilot is
    const share = useMemo(() => episodeShareCard({
        slug, title: summary.title, week: summary.week, publishedAt: scriptAirDate(summary.date), durationMs: summary.runtime,
    }, episode.pullQuote), [slug, summary, episode]);
    const lines = useMemo(() => script.split(/\r?\n/), [script]);
    const seconds = Math.round(report.segmentSeconds);
    const playLine = (sourceLine: number) => {
        const line = timeline.lines.find(l => l.sourceLine >= sourceLine);
        if (!line) return;
        // Unlock in the click itself, including when the first action is selecting a screenplay line.
        if (audio.unlock()) {
            setAudioError('');
            void audio.prepare().catch(() => setAudioError('An audio file could not be loaded.'));
        } else setAudioError('Audio is unavailable in this browser.');
        setCue(previous => ({ t: line.t0, n: (previous?.n ?? 0) + 1 }));
    };
    return <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} segment · {report.words.don + report.words.ron} words · Don {report.words.don} / Ron {report.words.ron}</p>
            <button className="min-h-11 rounded-lg border border-line-strong bg-white px-4 font-bold" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? 'Reloading…' : 'Reload draft files'}</button>
        </div>
        <Player episode={episode} teams={teams} players={players} keys="focus" cue={cue} onLine={setActiveLine} audio={audio} share={share} />
        {audioError && <p role="status" className="mt-3 text-sm text-rink-red">{audioError}</p>}
        {report.diagnostics.length > 0 && <section className="mt-4 rounded-xl border border-line-strong bg-white p-4" aria-label="Draft checks">
            <h2 className="font-bold">Draft checks</h2>
            <ul className="mt-2 space-y-2 text-sm">{report.diagnostics.map((d, i) => <li key={i}><button className="text-left underline" onClick={() => playLine(d.line)}><strong>{d.severity === 'error' ? 'Error' : 'Review'} · line {d.line}:</strong> {d.message}</button></li>)}</ul>
        </section>}
        <details className="mt-4 rounded-xl border border-line-strong bg-white p-4">
            <summary className="cursor-pointer font-bold">Screenplay · select a line to preview</summary>
            <ol className="mt-3 max-h-[32rem] overflow-auto font-mono text-xs">{lines.map((line, i) => <li key={i} className={activeLine === i + 1 ? 'bg-blue-100' : ''}>
                <button className="flex w-full gap-3 p-1 text-left hover:bg-ice" onClick={() => playLine(i + 1)} aria-label={`Preview from line ${i + 1}`}><span className="w-8 shrink-0 text-right text-ink-muted">{i + 1}</span><span className="whitespace-pre-wrap break-words">{line || ' '}</span></button>
            </li>)}</ol>
        </details>
    </>;
}
