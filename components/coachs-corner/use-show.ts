'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Episode } from '@/lib/coachs-corner/episode';
import { frameAt, frameSignature, type Frame } from '@/lib/coachs-corner/timeline';
import { createTransport, type BumperState, type TransportOutput } from '@/lib/coachs-corner/transport';
import type { ShowAudio } from './audio';

// The transport owns show time; this hook runs its animation-frame loop and applies each output:
// cues to the Web Audio graph, theme commands to the theme's audio element, and the bumper state
// to the studio. The frame is a pure function of time, so React only re-renders when something
// visible changes (a word lands, a mouth opens, a pose changes).

/** The theme is moved back into step with show time when it drifts further than this. */
const THEME_DRIFT_MS = 150;
const THEME_VOLUME = 0.8;

export interface Show {
    frame: Frame;
    /** coarse time for labels, about ten times a second */
    time: number;
    playing: boolean;
    started: boolean;
    rate: number;
    bumper: BumperState | null;
    play: () => void;
    pause: () => void;
    toggle: () => void;
    seek: (t: number) => void;
    setRate: (rate: number) => void;
    /** fine-grained time for the scrub bar, without re-rendering */
    subscribe: (fn: (t: number) => void) => () => void;
    timeRef: React.MutableRefObject<number>;
}

interface ShowOptions {
    sound: boolean;
    startAt?: number;
    audio: ShowAudio;
    theme: React.RefObject<HTMLAudioElement | null>;
}

export function useShow(episode: Episode, { sound: soundOn, startAt, audio, theme }: ShowOptions): Show {
    const { timeline: tl, audioCues, openingPicture } = episode;
    const timeRef = useRef(startAt ?? 0);
    const [firstTransport] = useState(() => createTransport(tl, audioCues, { time: startAt }));
    const transport = useRef(firstTransport);
    const [frame, setFrame] = useState(() => startAt === undefined ? openingPicture : frameAt(tl, startAt));
    const [time, setTime] = useState(startAt ?? 0);
    const [playing, setPlaying] = useState(false);
    const [started, setStarted] = useState(startAt !== undefined);
    const [rate, setRateState] = useState(1);
    const [bumper, setBumper] = useState<BumperState | null>(null);
    const sigRef = useRef(frameSignature(frame));
    const listeners = useRef(new Set<(t: number) => void>());
    const soundRef = useRef(soundOn);
    soundRef.current = soundOn;
    const playingRef = useRef(false);
    const lastLabel = useRef(0);

    const publish = useCallback((t: number, force = false) => {
        const f = frameAt(tl, t);
        const sig = frameSignature(f);
        if (force || sig !== sigRef.current) {
            sigRef.current = sig;
            setFrame(f);
        }
        listeners.current.forEach(fn => fn(t));
    }, [tl]);

    const applyTheme = useCallback((out: TransportOutput) => {
        const el = theme.current;
        if (!el) return;
        el.muted = !soundRef.current;
        el.volume = THEME_VOLUME;
        if (out.theme === 'pause') el.pause();
        else if (out.theme) {
            el.currentTime = out.theme.play / 1000;
            void el.play().catch(() => { /* blocked until a gesture */ });
        } else if (out.playing && out.phase === 'intro' && !el.paused && Math.abs(el.currentTime * 1000 - out.time) > THEME_DRIFT_MS) {
            el.currentTime = out.time / 1000;
        }
    }, [theme]);

    // Every transport operation goes through here, so all of them leave the show in the same state.
    const apply = useCallback((out: TransportOutput, { force = false, label = false } = {}) => {
        timeRef.current = out.time;
        applyTheme(out);
        if (soundRef.current) for (const cue of out.cues) audio.fire(cue, out.rate);
        audio.sync(out.playing, soundRef.current, out.time, tl.showEnd);
        setBumper(prev => prev?.mount === out.bumper?.mount && prev?.paused === out.bumper?.paused ? prev : out.bumper);
        playingRef.current = out.playing;
        setPlaying(out.playing);
        publish(out.time, force);
        if (label || !out.playing) setTime(out.time);
    }, [applyTheme, audio, tl, publish]);

    // a recompiled script (admin edits) keeps the playhead and speed where they were
    const firstTimeline = useRef(true);
    useEffect(() => {
        if (firstTimeline.current) { firstTimeline.current = false; return; }
        audio.stop();
        const wasPlaying = playingRef.current;
        transport.current = createTransport(tl, audioCues, { time: timeRef.current, speed: rate });
        if (wasPlaying) apply(transport.current.play(performance.now()), { force: true });
        else if (started) apply(transport.current.seek(timeRef.current), { force: true });
        else setFrame(openingPicture);
    }, [episode]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        audio.sync(playing, soundOn, timeRef.current, tl.showEnd);
        const el = theme.current;
        // muting silences the theme in place, so unmuting brings it back at the right point
        if (el) el.muted = !soundOn;
    }, [audio, playing, soundOn, tl, theme]);
    useEffect(() => () => audio.stop(), [audio]);

    useEffect(() => {
        const onVisibility = () => { if (document.hidden && playingRef.current) apply(transport.current.pause()); };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [apply]);

    useEffect(() => {
        if (!playing) return;
        let raf = 0;
        const tick = (now: number) => {
            const label = now - lastLabel.current > 100;
            if (label) lastLabel.current = now;
            const out = transport.current.tick(now);
            apply(out, { label });
            if (out.playing) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [playing, apply]);

    // Called from the click itself: the theme command applies inside the gesture, which Safari needs.
    const play = useCallback(() => {
        setStarted(true);
        apply(transport.current.play(performance.now()), { force: true, label: true });
    }, [apply]);
    const pause = useCallback(() => apply(transport.current.pause()), [apply]);
    const seek = useCallback((t: number) => {
        audio.stop();
        setStarted(true);
        apply(transport.current.seek(t), { force: true, label: true });
    }, [audio, apply]);
    const setRate = useCallback((next: number) => {
        transport.current.setSpeed(next);
        setRateState(next);
    }, []);

    const subscribe = useCallback((fn: (t: number) => void) => {
        listeners.current.add(fn);
        fn(timeRef.current);
        return () => { listeners.current.delete(fn); };
    }, []);

    return useMemo(() => ({
        frame, time, playing, started, rate, bumper,
        play, pause, toggle: () => (playing ? pause() : play()), seek, setRate, subscribe, timeRef,
    }), [frame, time, playing, started, rate, bumper, play, pause, seek, setRate, subscribe]);
}
