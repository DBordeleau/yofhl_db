'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHARACTERS, gestureAction } from '@/lib/coachs-corner/cast';
import { frameAt, INTRO_MS, type Frame, type Timeline } from '@/lib/coachs-corner/timeline';
import { audioCuesBetween, compileAudioCues } from '@/lib/coachs-corner/audio-cues';
import type { ShowAudio } from './audio';

// One requestAnimationFrame clock drives the show. The frame is a pure function of time, so React
// only re-renders when something visible changes (a word lands, a mouth opens, a pose changes).

export const frameSignature = (f: Frame) => {
    let s = `${f.phase}|${f.monitor}|${f.shot}|${f.punch?.index ?? -1}|${f.line}|${Math.ceil(f.clock / 1000)}`;
    for (const who of CHARACTERS) {
        const h = f.hosts[who];
        const c = f.captions[who];
        s += `|${h.gesture}${h.open ? 1 : 0}${h.motion ?? '-'}${h.flinch ? 1 : 0}|${c ? `${c.line}.${c.shown}.${c.active ? 1 : 0}${c.knocked ? 1 : 0}` : '-'}`;
        // Publish the short contact animation, then return to sparse updates.
        if (who === 'don' && gestureAction(h.gesture) === 'pound') s += `|impact:${Math.min(10, Math.floor(h.gestureMs / 16))}`;
        if (h.reaction) s += `|fx:${h.reaction.effect}:${Math.floor(h.reaction.elapsed / 32)}`;
    }
    return s;
};

export interface Show {
    frame: Frame;
    /** coarse time for labels, about ten times a second */
    time: number;
    playing: boolean;
    started: boolean;
    rate: number;
    play: () => void;
    pause: () => void;
    toggle: () => void;
    seek: (t: number) => void;
    setRate: (rate: number) => void;
    /** fine-grained time for the scrub bar, without re-rendering */
    subscribe: (fn: (t: number) => void) => () => void;
    timeRef: React.MutableRefObject<number>;
}

export function useShow(tl: Timeline, { sound: soundOn, startAt, audio }: { sound: boolean; startAt?: number; audio: ShowAudio }): Show {
    const audioCues = useMemo(() => compileAudioCues(tl), [tl]);
    const timeRef = useRef(startAt ?? 0);
    const [frame, setFrame] = useState(() => frameAt(tl, startAt ?? INTRO_MS - 1));
    const [time, setTime] = useState(startAt ?? 0);
    const [playing, setPlaying] = useState(false);
    const [started, setStarted] = useState(startAt !== undefined);
    const [rate, setRate] = useState(1);
    const sigRef = useRef(frameSignature(frame));
    const listeners = useRef(new Set<(t: number) => void>());
    const soundRef = useRef(soundOn);
    soundRef.current = soundOn;
    const rateRef = useRef(rate);
    rateRef.current = rate;

    const publish = useCallback((t: number, force = false) => {
        // before the first play the studio shows its opening picture, not the bumper
        const f = frameAt(tl, t);
        const sig = frameSignature(f);
        if (force || sig !== sigRef.current) {
            sigRef.current = sig;
            setFrame(f);
        }
        listeners.current.forEach(fn => fn(t));
    }, [tl]);

    // a new script (admin edits) keeps the playhead where it was
    useEffect(() => {
        audio.stop();
        timeRef.current = Math.min(timeRef.current, tl.duration);
        if (started) publish(timeRef.current, true);
        else setFrame(frameAt(tl, INTRO_MS - 1));
    }, [tl, publish, started, audio]);

    useEffect(() => {
        audio.sync(playing, soundOn, timeRef.current, tl.showEnd);
        return () => audio.stop();
    }, [audio, playing, soundOn, tl]);

    useEffect(() => {
        const onVisibility = () => { if (document.hidden) setPlaying(false); };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    useEffect(() => {
        if (!playing) return;
        let raf = 0;
        let last = performance.now();
        let lastLabel = 0;
        const tick = (now: number) => {
            const prev = timeRef.current;
            const t = Math.min(tl.duration, prev + (now - last) * rateRef.current);
            last = now;
            timeRef.current = t;

            audio.sync(true, soundRef.current, t, tl.showEnd);
            if (soundRef.current && t > prev)
                for (const cue of audioCuesBetween(audioCues, prev, t, rateRef.current)) audio.fire(cue, rateRef.current);

            publish(t);
            if (now - lastLabel > 100) { lastLabel = now; setTime(t); }
            if (t >= tl.duration) { setPlaying(false); setTime(t); return; }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [playing, tl, publish, audio, audioCues]);

    const play = useCallback(() => {
        if (timeRef.current >= tl.duration) timeRef.current = 0;
        setStarted(true);
        setPlaying(true);
    }, [tl]);
    const pause = useCallback(() => setPlaying(false), []);
    const seek = useCallback((t: number) => {
        audio.stop();
        timeRef.current = Math.max(0, Math.min(tl.duration, t));
        setStarted(true);
        setTime(timeRef.current);
        publish(timeRef.current, true);
    }, [tl, publish, audio]);

    const subscribe = useCallback((fn: (t: number) => void) => {
        listeners.current.add(fn);
        fn(timeRef.current);
        return () => { listeners.current.delete(fn); };
    }, []);

    return useMemo(() => ({
        frame, time, playing, started, rate,
        play, pause, toggle: () => (playing ? pause() : play()), seek, setRate, subscribe, timeRef,
    }), [frame, time, playing, started, rate, play, pause, seek, subscribe]);
}
