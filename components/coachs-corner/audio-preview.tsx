'use client';

import { useEffect, useRef, useState } from 'react';
import { AUDIO_PREVIEW_SCRIPT } from '@/lib/coachs-corner/audio-preview';
import { TIE_RUSTLES } from '@/lib/coachs-corner/tie-rustles';
import { TV_SWITCHES } from '@/lib/coachs-corner/tv-switches';
import { CURRENT_SOUND_BANK, STUDIO_SOUND_BANK, type SoundBank, type SoundId, type SoundSource } from '@/lib/coachs-corner/sound-bank';
import { compile, INTRO_MS } from '@/lib/coachs-corner/timeline';
import { parseScript } from '@/lib/coachs-corner/script';
import type { StudioBanner, StudioTeam } from '@/lib/coachs-corner/teams';
import { createShowAudio } from './audio';
import Player from './player';
import styles from './audio-preview.module.css';

const timeline = compile(parseScript(AUDIO_PREVIEW_SCRIPT));
const tieTime = timeline.gestures.don.find(cue => cue.value === 'tie')!.t;
const yellTime = timeline.punches.find(cue => cue.who === 'don')!.t;
const monitorTime = timeline.monitor.find(cue => cue.t > INTRO_MS)!.t;
const sourceLabel = (source: SoundSource) => 'files' in source
    ? [...TIE_RUSTLES, ...TV_SWITCHES].find(sound => sound.file === source.files[0])?.label ?? 'Audio file'
    : source.synth === 'monitor' ? 'Original switch' : 'Built-in sound';
const SOUND_ROWS: { id: SoundId; label: string; detail: string }[] = [
    { id: 'don', label: 'Don', detail: 'Fuller syllables, softer edges, expressive outbursts' },
    { id: 'ron', label: 'Ron', detail: 'Rounder tone, precise and understated' },
    { id: 'room', label: 'Studio ambience', detail: 'Quiet air and equipment hum' },
    { id: 'tie', label: 'Tie adjustment', detail: 'Soft cloth swishes' },
    { id: 'monitor', label: 'TV screen', detail: 'The current monitor switch sound' },
];

export default function AudioPreview({ teams, banners }: { teams: StudioTeam[]; banners: StudioBanner[] }) {
    const [mix, setMix] = useState<'a' | 'b'>('b');
    const [candidate, setCandidate] = useState<SoundBank>(STUDIO_SOUND_BANK);
    const [audio] = useState(() => createShowAudio(STUDIO_SOUND_BANK));
    const [cue, setCue] = useState<{ t: number; n: number }>();
    const [files, setFiles] = useState<Partial<Record<SoundId, string>>>({});
    const [loading, setLoading] = useState<SoundId | null>(null);
    const [error, setError] = useState('');
    const urls = useRef(new Map<SoundId, string>());
    const requests = useRef({ file: 0, jump: 0 });

    useEffect(() => { audio.setBank(mix === 'a' ? CURRENT_SOUND_BANK : candidate); }, [audio, mix, candidate]);
    useEffect(() => {
        const ownedUrls = urls.current;
        const pendingRequests = requests.current;
        return () => {
            pendingRequests.file++;
            pendingRequests.jump++;
            for (const url of ownedUrls.values()) URL.revokeObjectURL(url);
            ownedUrls.clear();
        };
    }, []);

    const jump = (t: number) => {
        const token = ++requests.current.jump;
        if (!audio.unlock()) { setError('Audio is unavailable in this browser.'); return; }
        void audio.prepare().then(() => {
            if (token === requests.current.jump) setCue(previous => ({ t, n: (previous?.n ?? 0) + 1 }));
        }).catch(() => setError('An audio file could not be loaded. Choose another file or reset that sound.'));
    };

    const changeLevel = (id: SoundId, gain: number) => {
        setCandidate(previous => ({ ...previous, [id]: { ...previous[id], gain } }));
    };

    const releaseFile = (id: SoundId) => {
        const url = urls.current.get(id);
        if (url) { audio.forget(url); URL.revokeObjectURL(url); urls.current.delete(id); }
    };

    const replaceFile = async (id: SoundId, file: File) => {
        const token = ++requests.current.file;
        if (file.size > 20 * 1024 * 1024) { setError('Choose an audio file smaller than 20 MB.'); return; }
        setLoading(id);
        setError('');
        const url = URL.createObjectURL(file);
        try {
            if (!audio.unlock()) throw new Error('Audio is unavailable in this browser.');
            // Cache the default recordings too, so Reset and A remain ready.
            await Promise.all([audio.prepare(), audio.load(url)]);
            if (token !== requests.current.file) { audio.forget(url); URL.revokeObjectURL(url); return; }
            releaseFile(id);
            urls.current.set(id, url);
            setFiles(previous => ({ ...previous, [id]: file.name }));
            setCandidate(previous => ({ ...previous, [id]: { ...previous[id], source: { files: [url] } } }));
            setMix('b');
        } catch {
            audio.forget(url);
            URL.revokeObjectURL(url);
            if (token === requests.current.file) setError('That file could not be read as audio. Try a WAV, MP3, or OGG file.');
        } finally {
            if (token === requests.current.file) setLoading(null);
        }
    };

    const resetSound = (id: SoundId) => {
        setError('');
        releaseFile(id);
        setFiles(previous => { const next = { ...previous }; delete next[id]; return next; });
        setCandidate(previous => ({ ...previous, [id]: STUDIO_SOUND_BANK[id] }));
    };

    const audition = async (id: 'tie' | 'monitor', recording: { file: string; label: string }) => {
        const token = ++requests.current.file;
        const replayToken = ++requests.current.jump;
        setLoading(id);
        setError('');
        try {
            if (!audio.unlock()) throw new Error('Audio unavailable');
            await Promise.all([audio.prepare(), audio.load(recording.file)]);
            if (token !== requests.current.file) return;
            releaseFile(id);
            setFiles(previous => ({ ...previous, [id]: recording.label }));
            setCandidate(previous => ({ ...previous, [id]: { source: { files: [recording.file] }, gain: 1 } }));
            setMix('b');
            if (replayToken === requests.current.jump) setCue(previous => ({ t: (id === 'tie' ? tieTime : monitorTime) - 700, n: (previous?.n ?? 0) + 1 }));
        } catch {
            if (token === requests.current.file) setError('That recording could not be loaded. Try it again.');
        } finally {
            if (token === requests.current.file) setLoading(null);
        }
    };

    return (
        <div className={styles.preview}>
            <div className={styles.compare}>
                <div className={styles.switch} role="group" aria-label="Compare audio mixes">
                    <button type="button" aria-pressed={mix === 'a'} onClick={() => setMix('a')}>
                        <b>A</b><span>Current mix</span>
                    </button>
                    <button type="button" aria-pressed={mix === 'b'} onClick={() => setMix('b')}>
                        <b>B</b><span>Try sounds</span>
                    </button>
                </div>
                <p>Switch while playing. Same scene, same timing.</p>
            </div>

            <Player script={AUDIO_PREVIEW_SCRIPT} teams={teams} banners={banners} audio={audio} cue={cue} keys="focus" />

            <div className={styles.passages} role="group" aria-label="Replay a passage">
                <button type="button" onClick={() => jump(0)}>Replay from start</button>
                <button type="button" onClick={() => jump(INTRO_MS)}>Dialogue</button>
                <button type="button" onClick={() => jump(yellTime - 2000)}>Don’s outburst</button>
                <button type="button" onClick={() => jump(monitorTime - 700)}>TV switches</button>
                <button type="button" onClick={() => jump(tieTime - 2500)}>Tie adjustment <small>0:{Math.round(tieTime / 1000)}</small></button>
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}

            <section className={styles.rustles} aria-labelledby="cc-tv-title">
                <h2 id="cc-tv-title">Compare TV switches</h2>
                <p>Each choice replays the same screen changes in mix B. Switch to A to hear the current TV sound with the same voices and room level.</p>
                <div className={styles.rustleOptions}>
                    {TV_SWITCHES.map(recording => (
                        <div key={recording.id}>
                            <button type="button" disabled={loading !== null}
                                aria-pressed={'files' in candidate.monitor.source && candidate.monitor.source.files[0] === recording.file}
                                onClick={() => void audition('monitor', recording)}>Play {recording.label.toLowerCase()}</button>
                            <p className={styles.optionDetail}>{recording.detail}</p>
                            <a href={recording.source} target="_blank" rel="noreferrer">{recording.author} · CC0</a>
                        </div>
                    ))}
                </div>
                <p className={styles.rustleStatus} role="status">{loading === 'monitor' ? 'Loading TV recording…' : `TV sound: ${files.monitor ?? sourceLabel(candidate.monitor.source)}`}</p>
            </section>

            <section className={styles.rustles} aria-labelledby="cc-rustle-title">
                <h2 id="cc-rustle-title">Compare cloth rustles</h2>
                <p>Cloth rustle 7 is the default. Each choice replays the same tie adjustment in mix B at a matched level.</p>
                <div className={styles.rustleOptions}>
                    {TIE_RUSTLES.map(rustle => (
                        <div key={rustle.id}>
                            <button type="button" disabled={loading !== null}
                                aria-pressed={'files' in candidate.tie.source && candidate.tie.source.files[0] === rustle.file}
                                onClick={() => void audition('tie', rustle)}>Play {rustle.label.toLowerCase()}</button>
                            <a href={rustle.source} target="_blank" rel="noreferrer">{rustle.author} · CC0</a>
                        </div>
                    ))}
                </div>
                <p className={styles.rustleStatus} role="status">{loading === 'tie' ? 'Loading cloth recording…' : `Tie sound: ${files.tie ?? sourceLabel(candidate.tie.source)}`}</p>
            </section>

            <section className={styles.mixer} aria-labelledby="cc-mix-title">
                <div className={styles.mixerHead}>
                    <h2 id="cc-mix-title">Shape mix B</h2>
                    <p>{mix === 'a' ? 'Listening to A. Switch to B to hear your changes.' : 'The intro theme stays. No background music.'}</p>
                </div>
                <div className={styles.rows}>
                    {SOUND_ROWS.map(({ id, label, detail }) => (
                        <div className={styles.row} key={id}>
                            <div className={styles.soundName}><label htmlFor={`level-${id}`}>{label}</label><small>{detail}</small></div>
                            <input id={`level-${id}`} type="range" min="0" max="2" step="0.05" value={candidate[id].gain}
                                aria-valuetext={candidate[id].gain === 0 ? 'Muted' : `${Math.round(candidate[id].gain * 100)} percent`}
                                onChange={event => changeLevel(id, Number(event.target.value))} />
                            <output htmlFor={`level-${id}`}>{Math.round(candidate[id].gain * 100)}%</output>
                        </div>
                    ))}
                </div>
                <details className={styles.files}>
                    <summary>Swap individual sounds</summary>
                    <p>Try your own WAV, MP3, or OGG files. Choose a short syllable for each voice and a seamless loop for the room. Files and mix changes stay in this tab until you reload.</p>
                    {SOUND_ROWS.map(({ id, label }) => (
                        <div className={styles.fileRow} key={id}>
                            <div><strong>{label}</strong><span>{files[id] ?? sourceLabel(candidate[id].source)}</span></div>
                            <label className={styles.fileButton}>
                                {loading === id ? 'Loading…' : 'Choose file'}
                                <input type="file" accept="audio/*,.wav,.mp3,.ogg" aria-label={`Replace ${label} sound`} disabled={loading !== null}
                                    onChange={event => {
                                        const file = event.target.files?.[0];
                                        event.target.value = '';
                                        if (file) void replaceFile(id, file);
                                    }} />
                            </label>
                            <button type="button" onClick={() => resetSound(id)} disabled={loading !== null} aria-label={`Reset ${label} sound`}>Reset</button>
                        </div>
                    ))}
                </details>
            </section>
        </div>
    );
}
