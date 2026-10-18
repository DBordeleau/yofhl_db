// Browser integration check: uses the real engine, bank, screenplay and Chromium DSP.
// Build with build-episode-scan.mjs; this diagnostic is not part of the player.
import { createShowAudio } from '../../components/coachs-corner/audio.ts';
import { CURRENT_SOUND_BANK } from '../../lib/coachs-corner/sound-bank.ts';
import { compileAudioCues } from '../../lib/coachs-corner/audio-cues.ts';
import { episode, script } from 'coachs-episode-scan-input';
import { compile, INTRO_MS } from '../../lib/coachs-corner/timeline.ts';

const timeline = compile(script);
const cues = compileAudioCues(timeline);
const sampleRate = 48000;
const duration = timeline.duration / 1000;
const status = document.getElementById('status');
const results = document.getElementById('results');
const report = { episode: timeline.meta.title, episodeId: episode.id, sourceKind: episode.sourceKind, scriptSha256: episode.scriptSha256,
    scriptWarnings: script.diagnostics, showSeconds: timeline.showEnd / 1000, renderedSeconds: duration,
    sampleRate, channels: 2, defaults: CURRENT_SOUND_BANK, method: 'Continuous Chromium offline render, one-second scheduling windows',
    passes: {}, checks: {} };
const display = message => { status.textContent = message; results.textContent = JSON.stringify(report, null, 2); };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const db = amplitude => 20 * Math.log10(Math.max(amplitude, 1e-12));

function measure(buffer, from = 0, to = buffer.duration) {
    let sum = 0, peak = 0, nonfinite = 0, clipped = 0, n = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = Math.max(0, Math.floor(from * sampleRate)); i < Math.min(data.length, Math.ceil(to * sampleRate)); i++) {
            const value = data[i];
            if (!Number.isFinite(value)) nonfinite++;
            if (Math.abs(value) >= 1) clipped++;
            peak = Math.max(peak, Math.abs(value)); sum += value * value; n++;
        }
    }
    return { rmsDb: db(Math.sqrt(sum / Math.max(1, n))), peakDb: db(peak), nonfinite, clipped, samples: n };
}

const only = ids => Object.fromEntries(Object.entries(CURRENT_SOUND_BANK).map(([id, slot]) =>
    [id, { ...slot, gain: ids.includes(id) ? slot.gain : 0 }]));

async function render(label, bank, themeBuffer, seconds = duration, windowSeconds = 1) {
    let clock = 0, cursor = 0, sources = 0, ended = 0, maxLiveSources = 0;
    const context = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const events = [...cues, { t: INTRO_MS - 400 }, { t: timeline.showEnd }]
        .filter(cue => cue.t < seconds * 1000).sort((a, b) => a.t - b.t);
    const proxy = new Proxy(context, { get(target, key) {
        if (key === 'state') return 'running';
        if (key === 'currentTime') return clock;
        if (key === 'close') return () => Promise.resolve();
        const value = Reflect.get(target, key, target);
        if (key === 'createOscillator' || key === 'createBufferSource') return (...args) => {
            const source = value.apply(target, args);
            sources++; maxLiveSources = Math.max(maxLiveSources, sources - ended);
            source.addEventListener('ended', () => { ended++; });
            return source;
        };
        return typeof value === 'function' ? value.bind(target) : value;
    } });
    const original = window.AudioContext;
    window.AudioContext = class { constructor() { return proxy; } };
    const started = performance.now();
    let timer;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded 30 seconds`)), 30000); });
    const wait = promise => Promise.race([promise, deadline]);
    try {
        const audio = createShowAudio(bank);
        assert(audio.unlock(), 'Audio engine unavailable');
        await wait(audio.prepare()); // A missing/undecodable cloth sample must fail the scan.
        if (themeBuffer) {
            const theme = context.createBufferSource(), gain = context.createGain();
            theme.buffer = themeBuffer; gain.gain.value = .8;
            theme.connect(gain).connect(context.destination);
            theme.start(0); theme.stop(INTRO_MS / 1000);
        }
        const schedule = until => {
            while (cursor < events.length && events[cursor].t < until * 1000) {
                const cue = events[cursor++]; clock = cue.t / 1000;
                audio.sync(true, true, cue.t, timeline.showEnd);
                if (cue.id) audio.fire(cue, 1);
            }
        };
        schedule(windowSeconds || seconds);
        let boundary = windowSeconds;
        let suspended = boundary > 0 && boundary < seconds ? context.suspend(boundary) : null;
        const rendering = context.startRendering();
        // Keep one continuous context: no stitching, restarted ambience, or compressor resets.
        // Register each suspension before resume so rendering cannot run past unscheduled cues.
        while (suspended) {
            await wait(suspended);
            boundary += windowSeconds;
            schedule(boundary);
            suspended = boundary < seconds ? context.suspend(boundary) : null;
            await wait(context.resume());
            if (boundary % 30 === 0) display(`${label}: rendered ${Math.min(boundary, seconds).toFixed(0)} / ${seconds.toFixed(0)} seconds`);
        }
        const buffer = await wait(rendering);
        assert(cursor === events.length, `${label}: skipped scheduled cues`);
        const stats = { renderMs: Math.round(performance.now() - started), sources, ended, maxLiveSources,
            events: cursor, ...measure(buffer) };
        assert(stats.nonfinite === 0, `${label}: invalid samples`);
        assert(stats.clipped === 0, `${label}: clipping`);
        if (windowSeconds) assert(maxLiveSources < 80, `${label}: audio graph was not bounded`);
        report.passes[label] = stats;
        return buffer;
    } finally { clearTimeout(timer); window.AudioContext = original; }
}

function download(blob, filename, text) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    a.textContent = text; a.style.marginRight = '24px'; document.getElementById('downloads').append(a);
    return a.href;
}

function wave(buffer) {
    const channels = buffer.numberOfChannels, size = buffer.length * channels * 2;
    const bytes = new ArrayBuffer(44 + size), view = new DataView(bytes);
    const text = (at, value) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
    text(0, 'RIFF'); view.setUint32(4, 36 + size, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, size, true);
    const data = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
    for (let i = 0; i < buffer.length; i++) for (let c = 0; c < channels; c++)
        view.setInt16(44 + (i * channels + c) * 2, Math.round(Math.max(-1, Math.min(1, data[c][i])) * 32767), true);
    return new Blob([bytes], { type: 'audio/wav' });
}

async function run() {
    display('Checking scheduler equivalence');
    const response = await fetch('/coachs-corner/coachs_corner_theme.mp3', { signal: AbortSignal.timeout(15000) });
    assert(response.ok, 'Intro theme failed to load');
    const decoder = new OfflineAudioContext(2, 1, sampleRate);
    const theme = await decoder.decodeAudioData(await response.arrayBuffer());
    // Differential regression at the real browser/engine seam, before the full render.
    const old = await render('reference-20s', CURRENT_SOUND_BANK, theme, 20, 0);
    const bounded = await render('bounded-20s', CURRENT_SOUND_BANK, theme, 20);
    let difference = 0;
    for (let c = 0; c < 2; c++) {
        const a = old.getChannelData(c), b = bounded.getChannelData(c);
        for (let i = 0; i < a.length; i++) difference = Math.max(difference, Math.abs(a[i] - b[i]));
    }
    report.checks.schedulerMaxSampleDifference = difference;
    assert(difference < .0001, 'Incremental scheduling changed the audible mix');

    const full = await render('full-mix', CURRENT_SOUND_BANK, theme);
    report.minutes = Array.from({ length: Math.ceil(duration / 60) }, (_, index) => index * 60).map(from =>
        ({ from, to: Math.min(from + 60, duration), ...measure(full, from, Math.min(from + 60, duration)) }));
    report.checks.tail = measure(full, timeline.showEnd / 1000 + .2);
    assert(report.checks.tail.peakDb < -90, 'Audio remains after the end card fade');
    const fullUrl = download(wave(full), `${episode.id}-audio-mix.wav`, 'Download full episode WAV');
    const audio = document.createElement('audio'); audio.controls = true; audio.src = fullUrl;
    document.getElementById('downloads').append(audio);

    const voices = await render('dialogue', only(['don', 'ron']), null);
    const room = await render('ambience', only(['room']), null);
    report.lines = timeline.lines.map(line => {
        const from = line.t0 / 1000, to = line.t1 / 1000;
        const voice = measure(voices, from, to), ambience = measure(room, from, to);
        return { line: line.index + 1, speaker: line.speaker, from, to, ...voice, aboveAmbienceDb: voice.rmsDb - ambience.rmsDb };
    });
    const voiceCues = cues.filter(cue => cue.voice);
    const silentSyllables = voiceCues.filter(cue => measure(voices, cue.t / 1000 + .005,
        (cue.t + cue.voice.duration) / 1000 + .005).peakDb < -70);
    report.checks.dialogueLines = report.lines.length;
    report.checks.syllables = voiceCues.length;
    report.checks.silentSyllables = silentSyllables.length;
    report.checks.minimumDialogueAboveAmbienceDb = Math.min(...report.lines.map(line => line.aboveAmbienceDb));
    assert(silentSyllables.length === 0, 'At least one syllable failed to sound');
    assert(report.checks.minimumDialogueAboveAmbienceDb > 10, 'Dialogue is masked by ambience');

    const effects = await render('effects', only(Object.keys(CURRENT_SOUND_BANK).filter(id => !['don', 'ron', 'room'].includes(id))), null);
    report.effects = cues.filter(cue => !cue.voice).map(cue => ({ id: cue.id, at: cue.t / 1000,
        ...measure(effects, cue.t / 1000, cue.t / 1000 + .4) }));
    assert(report.effects.every(effect => effect.peakDb > -70), 'An effect failed to sound');
    report.checks.effects = report.effects.length;
    report.status = 'PASS';
    document.getElementById('summary').textContent = `${report.showSeconds.toFixed(1)} seconds + end card · ${report.checks.dialogueLines} dialogue lines · ${report.checks.syllables} syllables · ${report.checks.effects} effects. No clipping, missing syllables or invalid samples. Dialogue stays at least ${report.checks.minimumDialogueAboveAmbienceDb.toFixed(1)} dB above ambience. End card is silent. Full mix rendered in ${(report.passes['full-mix'].renderMs / 1000).toFixed(2)} seconds.`;
    download(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `${episode.id}-audio-scan.json`, 'Download scan report');
    display('PASS · Entire episode rendered and checked');
}

run().catch(error => { report.status = 'FAIL'; report.error = String(error); display('FAIL · ' + error.message); });
