'use client';

import { THEME_URL } from '@/lib/coachs-corner/media';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiMaximize, FiMinimize, FiPause, FiPlay, FiRotateCcw, FiSkipBack, FiSkipForward, FiVolume2, FiVolumeX } from 'react-icons/fi';
import ShareButton from '@/components/share/share-button';
import type { ShareCard } from '@/lib/share/model';
import { CAST } from '@/lib/coachs-corner/cast';
import { markEpisodeSeen } from '@/lib/coachs-corner/seen';
import { parseScript } from '@/lib/coachs-corner/script';
import { compile, INTRO_MS, lineAtTime, type Timeline } from '@/lib/coachs-corner/timeline';
import type { StudioBanner, StudioPlayer, StudioTeam } from '@/lib/coachs-corner/teams';
import { createShowAudio, type ShowAudio } from './audio';
import Studio, { TitleCard } from './studio';
import { useShow, type Show } from './use-show';
import styles from './coachs-corner.module.css';

const SOUND_KEY = 'coachs-corner:sound';
const RATES = [1, 1.25, 1.5];

const mmss = (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** a plain video-player timeline */
function Scrubber({ tl, show }: { tl: Timeline; show: Show }) {
    const track = useRef<HTMLDivElement>(null);
    const head = useRef<HTMLDivElement>(null);
    const played = useRef<HTMLDivElement>(null);
    const drag = useRef<{ id: number; x: number; y: number; seeking: boolean } | null>(null);
    const span = tl.showEnd;
    const pct = (t: number) => Math.max(0, Math.min(1, t / span)) * 100;

    useEffect(() => show.subscribe(t => {
        const p = `${pct(t)}%`;
        if (head.current) head.current.style.left = p;
        if (played.current) played.current.style.width = p;
        track.current?.setAttribute('aria-valuenow', String(Math.round(Math.min(t, span) / 1000)));
        track.current?.setAttribute('aria-valuetext', `${mmss(Math.min(t, span))} of ${mmss(span)}`);
    }), [show, tl]); // eslint-disable-line react-hooks/exhaustive-deps

    const seekTo = (clientX: number) => {
        const r = track.current!.getBoundingClientRect();
        show.seek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * span);
    };

    return (
        <div
            ref={track}
            className={styles.scrub}
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuenow={Math.round(Math.min(show.timeRef.current, span) / 1000)}
            aria-valuemax={Math.round(span / 1000)}
            onPointerDown={e => {
                if (!e.isPrimary || e.button !== 0) return;
                drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, seeking: false };
                e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={e => {
                const start = drag.current;
                if (!start || start.id !== e.pointerId) return;
                // Let a vertical swipe scroll the page without jumping the episode.
                if (!start.seeking && Math.abs(e.clientX - start.x) > Math.max(8, Math.abs(e.clientY - start.y))) start.seeking = true;
                if (start.seeking) seekTo(e.clientX);
            }}
            onPointerUp={e => {
                const start = drag.current;
                if (start?.id === e.pointerId && (start.seeking || Math.abs(e.clientY - start.y) < 8)) seekTo(e.clientX);
                drag.current = null;
            }}
            onPointerCancel={() => { drag.current = null; }}
            onLostPointerCapture={() => { drag.current = null; }}
            onKeyDown={e => {
                if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
                    e.preventDefault();
                    e.stopPropagation();
                    show.seek(e.key === 'Home' ? 0 : e.key === 'End' ? tl.duration : show.timeRef.current + (e.key === 'ArrowRight' ? 5000 : -5000));
                }
            }}
        >
            <div className={styles.scrubTrack}><div ref={played} className={styles.scrubPlayed} /></div>
            <div ref={head} className={styles.scrubHead} />
        </div>
    );
}

export interface PlayerProps {
    script: string;
    /** Only public episodes record viewing; admin previews omit this key. */
    episodeKey?: string;
    teams: StudioTeam[];
    players?: StudioPlayer[];
    banners?: StudioBanner[];
    /** "page" listens for keyboard shortcuts anywhere; "focus" only while the player has focus */
    keys?: 'page' | 'focus';
    /** admin preview: jump here (ms) whenever it changes */
    cue?: { t: number; n: number };
    onLine?: (sourceLine: number) => void;
    nextHref?: string;
    /** Optional sound controller for an audition; regular episodes use the current mix. */
    audio?: ShowAudio;
    /** Public episodes get a share card button in the control bar. */
    share?: ShareCard;
    /** the episode's schedule slot, like "Pilot" or "Week 2", for the title card and chyron */
    label?: string | null;
}

export default function Player({ script, episodeKey, teams, players = [], banners = [], keys = 'page', cue, onLine, nextHref, audio: suppliedAudio, share, label }: PlayerProps) {
    const tl = useMemo(() => {
        const compiled = compile(parseScript(script));
        return label ? { ...compiled, meta: { ...compiled.meta, label } } : compiled;
    }, [script, label]);
    const [ownAudio] = useState(() => createShowAudio());
    const audio = suppliedAudio ?? ownAudio;
    const [audioError, setAudioError] = useState('');
    // sound is on unless the viewer muted it; pressing Watch is the gesture browsers need
    const [soundOn, setSoundOn] = useState(true);
    const show = useShow(tl, { sound: soundOn, audio });
    const rootRef = useRef<HTMLDivElement>(null);
    const railRef = useRef<HTMLDivElement>(null);
    const [fullscreen, setFullscreen] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const isFullscreen = fullscreen || expanded;
    const [introOffset, setIntroOffset] = useState(0);
    const { frame, playing, started, time } = show;

    useEffect(() => () => audio.dispose(), [audio]);

    const enableAudio = useCallback(() => {
        if (!audio.unlock()) { setAudioError('Audio is unavailable in this browser.'); return; }
        setAudioError('');
        void audio.prepare().catch(() => setAudioError('An audio file could not be loaded. Check its path or try another file.'));
    }, [audio]);

    useEffect(() => {
        try { setSoundOn(localStorage.getItem(SOUND_KEY) !== 'off'); } catch { /* storage blocked */ }
    }, []);

    const toggleSound = useCallback(() => {
        const next = !soundOn;
        if (next) enableAudio();
        setSoundOn(next);
        try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch { /* storage blocked */ }
    }, [soundOn, enableAudio]);

    // the bumper remembers where it was entered so seeks and pauses resume it in place
    const startPlay = useCallback(() => {
        if (soundOn) enableAudio();
        const t = show.timeRef.current >= tl.duration ? 0 : show.timeRef.current;
        if (t < INTRO_MS) {
            setIntroOffset(t);
            // start the theme inside the click itself; Safari ignores play() called later
            const audio = theme.current;
            if (audio) { audio.muted = !soundOn; audio.currentTime = t / 1000; void audio.play().catch(() => {}); }
        }
        show.play();
        if (episodeKey) markEpisodeSeen(episodeKey);
    }, [show, soundOn, tl, episodeKey, enableAudio]);
    const seek = useCallback((t: number) => {
        if (t < INTRO_MS) setIntroOffset(Math.max(0, t));
        show.seek(t);
    }, [show]);

    const stepLine = useCallback((dir: 1 | -1) => {
        const now = show.timeRef.current;
        const i = lineAtTime(tl, now);
        // back: restart this line unless it only just began
        const target = dir > 0 ? i + 1 : (i >= 0 && now - tl.lines[i].t0 > 900 ? i : i - 1);
        if (target < 0) return seek(INTRO_MS);
        if (target >= tl.lines.length) return seek(tl.showEnd);
        seek(tl.lines[target].t0);
    }, [show, tl, seek]);

    const toggle = useCallback(() => (playing ? show.pause() : startPlay()), [playing, show, startPlay]);

    const toggleFullscreen = useCallback(async () => {
        const el = rootRef.current;
        if (!el) return;
        if (expanded) { setExpanded(false); return; }
        if (document.fullscreenElement === el) { await document.exitFullscreen().catch(() => {}); return; }
        if (el.requestFullscreen) {
            try { await el.requestFullscreen(); return; } catch { /* Use the in-page view when native fullscreen is denied. */ }
        }
        setExpanded(true);
    }, [expanded]);
    useEffect(() => {
        const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    // The picture and its type share one measured container, including short landscape screens.
    useEffect(() => {
        const root = rootRef.current;
        const rail = railRef.current;
        if (!isFullscreen || !root || !rail) return;
        const measure = () => root.style.setProperty('--rail-height', `${rail.getBoundingClientRect().height}px`);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(rail);
        return () => { observer.disconnect(); root.style.removeProperty('--rail-height'); };
    }, [isFullscreen]);

    useEffect(() => {
        const root = rootRef.current;
        if (!expanded || !root) return;
        const previousFocus = document.activeElement as HTMLElement | null;
        const overflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        // Keep the expanded view modal without remounting the running player.
        const siblings = new Map<HTMLElement, boolean>();
        for (let branch: HTMLElement = root; branch.parentElement; branch = branch.parentElement) {
            for (const sibling of branch.parentElement.children) {
                if (sibling !== branch && sibling instanceof HTMLElement) {
                    siblings.set(sibling, sibling.inert);
                    sibling.inert = true;
                }
            }
            if (branch.parentElement === document.body) break;
        }
        root.focus({ preventScroll: true });
        const onKey = (event: KeyboardEvent) => {
            if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('dialog'))) return;
            if (event.key === 'Escape') { event.preventDefault(); setExpanded(false); }
            if (event.key === 'Tab') {
                const controls = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [role="slider"]')];
                const first = controls[0], last = controls[controls.length - 1];
                if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.documentElement.style.overflow = overflow;
            siblings.forEach((inert, sibling) => { sibling.inert = inert; });
            if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        };
    }, [expanded]);

    useEffect(() => {
        if (!cue) return;
        seek(cue.t);
        show.play();
    }, [cue]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (onLine && frame.line >= 0) onLine(tl.lines[frame.line].sourceLine);
    }, [frame.line, tl, onLine]);

    useEffect(() => {
        const target = keys === 'page' ? window : rootRef.current;
        if (!target) return;
        const onKey = (e: Event) => {
            const k = e as KeyboardEvent;
            const el = k.target instanceof HTMLElement ? k.target : null;
            if (k.metaKey || k.ctrlKey || k.altKey || el?.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (el?.closest('button') && (k.key === ' ' || k.key === 'Enter')) return;
            const act: Record<string, () => void> = {
                ' ': toggle, k: toggle,
                ArrowRight: () => stepLine(1), l: () => stepLine(1),
                ArrowLeft: () => stepLine(-1), j: () => stepLine(-1),
                m: toggleSound, f: toggleFullscreen,
            };
            const fn = act[k.key.length === 1 ? k.key.toLowerCase() : k.key];
            if (!fn) return;
            k.preventDefault();
            fn();
        };
        target.addEventListener('keydown', onKey);
        return () => target.removeEventListener('keydown', onKey);
    }, [keys, toggle, stepLine, toggleSound, toggleFullscreen]);

    // the intro theme follows the clock: it starts, pauses and seeks with the bumper
    const theme = useRef<HTMLAudioElement | null>(null);
    const inIntro = frame.phase === 'intro';
    useEffect(() => {
        const audio = theme.current;
        if (!audio) return;
        audio.muted = !soundOn;
        audio.volume = 0.8;
        const t = show.timeRef.current;
        if (playing && t < INTRO_MS) {
            audio.currentTime = t / 1000;
            void audio.play().catch(() => { /* blocked until a gesture */ });
        } else {
            audio.pause();
        }
    }, [playing, soundOn, introOffset, inIntro, show.timeRef]);

    const ended = started && frame.phase === 'end';
    const current = frame.line >= 0 ? tl.lines[frame.line] : null;

    return (
        <div ref={rootRef} className={styles.player} data-fullscreen={isFullscreen || undefined} data-expanded={expanded || undefined}
            role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={expanded ? "Coach’s Corner player" : undefined}
            tabIndex={expanded ? -1 : keys === 'focus' ? 0 : undefined}>
            <div className={styles.presentation}>
                <div className={styles.frame}>
                    <audio ref={theme} src={THEME_URL} preload="auto" />
                    <Studio tl={tl} frame={frame} teams={teams} players={players} banners={banners} started={started} playing={playing} introOffset={introOffset} fullscreen={isFullscreen} />

                    {!started && <TitleCard tl={tl} />}
                    {!started && (
                        <button type="button" className={styles.poster} onClick={startPlay}>
                            <span className={styles.posterSlab}><FiPlay aria-hidden="true" className={styles.fillIcon} /> Watch</span>
                            <span className={styles.posterTime}>{mmss(tl.showEnd)}</span>
                        </button>
                    )}
                    {ended && <TitleCard tl={tl} closing />}
                    {ended && (
                        <div className={styles.endCard}>
                            <button type="button" className={styles.posterSlab} onClick={() => { seek(0); startPlay(); }}>
                                <FiRotateCcw aria-hidden="true" className={styles.strokeIcon} /> Replay
                            </button>
                            {nextHref && <a href={nextHref} className={styles.endLink}>Previous episode</a>}
                        </div>
                    )}
                </div>

                <div ref={railRef} className={styles.rail}>
                    <div className={styles.transport}>
                        <button type="button" onClick={() => stepLine(-1)} aria-label="Previous line" disabled={!started}><FiSkipBack /></button>
                        <button type="button" className={styles.playButton} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
                            {playing ? <FiPause /> : <FiPlay />}
                        </button>
                        <button type="button" onClick={() => stepLine(1)} aria-label="Next line"><FiSkipForward /></button>
                    </div>
                    <Scrubber tl={tl} show={show} />
                    <span className={styles.time}>{mmss(Math.min(time, tl.showEnd))}<small> / {mmss(tl.showEnd)}</small></span>
                    <div className={styles.options}>
                        <button type="button" className={styles.rate} onClick={() => show.setRate(RATES[(RATES.indexOf(show.rate) + 1) % RATES.length])} aria-label={`Speed ${show.rate}×`}>
                            {show.rate}×
                        </button>
                        <button type="button" onClick={toggleSound} aria-label={soundOn ? 'Mute' : 'Turn sound on'} aria-pressed={soundOn} data-on={soundOn || undefined}>
                            {soundOn ? <FiVolume2 /> : <FiVolumeX />}
                        </button>
                        {share && <ShareButton card={share} title="Share this episode" bare />}
                        <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}>
                            {isFullscreen ? <FiMinimize /> : <FiMaximize />}
                        </button>
                    </div>
                </div>
            </div>

            {audioError && <p role="status">{audioError}</p>}

            {/* the dialogue for screen readers, one line at a time */}
            <p className={styles.srOnly} aria-live="polite">
                {started && current ? `${CAST[current.speaker].name}: ${current.text}` : ''}
            </p>
        </div>
    );
}
