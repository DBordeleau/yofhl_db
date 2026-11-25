import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { root, runFfmpeg } from './ffmpeg.mjs';

// Original deterministic tape-rewind sounds for a flashback's entry and exit transitions.
// Each is a band-limited whine sweeping in pitch, like tape spooling past the head, with
// sped-up "garble" (irregular amplitude flutter) and a filtered hiss that follows the pitch.
// The entry runs up and ends on a small transport clunk; the exit is shorter, darker, quieter
// and sweeps down with no clunk. Lengths match FLASHBACK_ENTRY_MS and FLASHBACK_EXIT_MS in
// lib/coachs-corner/timeline.ts. Start after the player's 8 ms sample fade-in.
const SAMPLE_RATE = 48000;
const recipes = {
    'flashback-entry': {
        revision: 1,
        description: 'Tape rewinding: a whine sweeping up with garbled flutter and hiss, ending on a soft transport clunk.',
        durationSeconds: 0.9,
        startSeconds: 0.01,
        fadeInSeconds: 0.06,
        fadeOutAtSeconds: 0.76,
        silenceAtSeconds: 0.86,
        sweep: { fromHz: 260, toHz: 2300, curve: 1.6 },
        harmonics: 7,
        toneAmplitude: 0.5,
        wobble: { hz: 17, depth: 0.035 },
        garble: { minHz: 18, maxHz: 38, depth: 0.7 },
        hiss: { amplitude: 0.35, bandRatio: 2.2, q: 0.9 },
        lowpassHz: 6500,
        highpassHz: 120,
        clunk: { atSeconds: 0.8, amplitude: 0.55, decaySeconds: 0.012, lowpassHz: 900 },
        peakTargetDbfs: -12,
        seed: 20261125,
        recommendedBankGain: 0.5,
    },
    'flashback-exit': {
        revision: 1,
        description: 'A softer, shorter rewind: a darker whine sweeping down with light flutter and hiss, no clunk.',
        durationSeconds: 0.5,
        startSeconds: 0.01,
        fadeInSeconds: 0.04,
        fadeOutAtSeconds: 0.32,
        silenceAtSeconds: 0.46,
        sweep: { fromHz: 1500, toHz: 420, curve: 0.8 },
        harmonics: 5,
        toneAmplitude: 0.5,
        wobble: { hz: 13, depth: 0.025 },
        garble: { minHz: 14, maxHz: 26, depth: 0.5 },
        hiss: { amplitude: 0.25, bandRatio: 2, q: 0.8 },
        lowpassHz: 3800,
        highpassHz: 120,
        clunk: null,
        peakTargetDbfs: -16,
        seed: 20261126,
        recommendedBankGain: 0.5,
    },
};

const twoPi = 2 * Math.PI;
const onePole = hz => 1 - Math.exp(-twoPi * hz / SAMPLE_RATE);

function synthesize(recipe) {
    const samples = new Float64Array(Math.round(SAMPLE_RATE * recipe.durationSeconds));
    let seed = recipe.seed;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2147483648 - 1;
    };
    const span = recipe.silenceAtSeconds - recipe.startSeconds;
    let phase = 0, garblePhase = 0, garbleHz = recipe.garble.minHz;
    // a state-variable bandpass for the hiss, retuned every sample to follow the whine
    let bandLow = 0, bandBand = 0;
    let clunkNoise = 0, lowpass = 0, highpass = 0, previous = 0;
    const outAlpha = onePole(recipe.lowpassHz);
    const highAlpha = Math.exp(-twoPi * recipe.highpassHz / SAMPLE_RATE);
    const clunkAlpha = recipe.clunk && onePole(recipe.clunk.lowpassHz);
    for (let i = 0; i < samples.length; i++) {
        const time = i / SAMPLE_RATE;
        const local = time - recipe.startSeconds;
        if (local < 0 || time >= recipe.silenceAtSeconds) continue;
        const progress = Math.min(1, local / span) ** recipe.sweep.curve;
        const base = recipe.sweep.fromHz * (recipe.sweep.toHz / recipe.sweep.fromHz) ** progress;
        const hz = base * (1 + recipe.wobble.depth * Math.sin(twoPi * recipe.wobble.hz * local));
        phase = (phase + hz / SAMPLE_RATE) % 1;
        let tone = 0;
        for (let k = 1; k <= recipe.harmonics && k * hz < 18000; k++) tone += Math.sin(twoPi * k * phase) / k;
        // Garble: flutter whose rate wanders at random, like voices on fast-moving tape.
        garblePhase += garbleHz / SAMPLE_RATE;
        if (garblePhase >= 1) {
            garblePhase -= 1;
            garbleHz = recipe.garble.minHz + (recipe.garble.maxHz - recipe.garble.minHz) * (random() + 1) / 2;
        }
        const garble = 1 - recipe.garble.depth * (0.5 + 0.5 * Math.cos(twoPi * garblePhase));
        const f = 2 * Math.sin(Math.PI * Math.min(0.2 * SAMPLE_RATE, hz * recipe.hiss.bandRatio) / SAMPLE_RATE);
        bandLow += f * bandBand;
        const high = random() - bandLow - recipe.hiss.q * bandBand;
        bandBand += f * high;
        let value = garble * (recipe.toneAmplitude * tone + recipe.hiss.amplitude * bandBand);
        const fadeIn = Math.min(1, local / recipe.fadeInSeconds);
        const fadeOut = time <= recipe.fadeOutAtSeconds ? 1 : 0.5 + 0.5 * Math.cos(Math.PI
            * (time - recipe.fadeOutAtSeconds) / (recipe.silenceAtSeconds - recipe.fadeOutAtSeconds));
        value *= (0.5 - 0.5 * Math.cos(Math.PI * fadeIn)) * fadeOut;
        if (recipe.clunk && time >= recipe.clunk.atSeconds) {
            const since = time - recipe.clunk.atSeconds;
            clunkNoise += clunkAlpha * (random() - clunkNoise);
            value += recipe.clunk.amplitude * 4 * clunkNoise * Math.exp(-since / recipe.clunk.decaySeconds)
                * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, since / 0.0006)));
        }
        highpass = highAlpha * (highpass + value - previous);
        previous = value;
        lowpass += outAlpha * (highpass - lowpass);
        samples[i] = lowpass;
    }
    return samples;
}

function encode(samples, recipe) {
    const rawPeak = samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
    const normalizationGain = 10 ** (recipe.peakTargetDbfs / 20) / rawPeak;
    const dataBytes = samples.length * 2;
    const wav = Buffer.alloc(44 + dataBytes);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + dataBytes, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); // Integer PCM.
    wav.writeUInt16LE(1, 22); // Mono.
    wav.writeUInt32LE(SAMPLE_RATE, 24);
    wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(dataBytes, 40);
    let peak = 0, sumSquares = 0, dcSum = 0, lastNonzeroSample = -1;
    for (let i = 0; i < samples.length; i++) {
        const pcm = Math.round(samples[i] * normalizationGain * 32767);
        if (pcm < -32768 || pcm > 32767) throw new Error('PCM overflow');
        wav.writeInt16LE(pcm, 44 + i * 2);
        const value = pcm / 32768;
        peak = Math.max(peak, Math.abs(value));
        sumSquares += value * value;
        dcSum += value;
        if (pcm !== 0) lastNonzeroSample = i;
    }
    const peakDbfs = 20 * Math.log10(peak);
    const rmsDbfs = 20 * Math.log10(Math.sqrt(sumSquares / samples.length));
    if (peakDbfs > recipe.peakTargetDbfs + 1 || !Number.isFinite(rmsDbfs)) throw new Error('Invalid audio level');
    return { wav, normalizationGain, measurements: {
        durationSeconds: samples.length / SAMPLE_RATE,
        sampleCount: samples.length,
        bytes: wav.length,
        peakDbfs,
        rmsDbfs,
        dcOffset: dcSum / samples.length,
        lastNonzeroAtSeconds: lastNonzeroSample / SAMPLE_RATE,
        trailingSilenceSeconds: (samples.length - 1 - lastNonzeroSample) / SAMPLE_RATE,
    } };
}

const output = path.join(root, 'public/coachs-corner/audio');
mkdirSync(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const generatorSha256 = hash(readFileSync(fileURLToPath(import.meta.url)));
for (const [id, recipe] of Object.entries(recipes)) {
    const { wav, normalizationGain, measurements } = encode(synthesize(recipe), recipe);
    const wavPath = path.join(output, `${id}.wav`);
    writeFileSync(wavPath, wav);
    // Decode with FFmpeg and independently measure the final 16-bit file. Failure
    // leaves the WAV for inspection but does not report a completed provenance file.
    const analysis = runFfmpeg(['-i', wavPath, '-af', 'astats=metadata=1:reset=0', '-f', 'null', '-']).stderr.toString();
    const stat = label => {
        const matches = [...analysis.matchAll(new RegExp(`${label}: ([^\\r\\n]+)`, 'g'))];
        const value = Number(matches.at(-1)?.[1]);
        if (!Number.isFinite(value)) throw new Error(`FFmpeg omitted ${label}`);
        return value;
    };
    const ffmpeg = {
        command: `node scripts/audio/ffmpeg.mjs -i public/coachs-corner/audio/${id}.wav -af astats=metadata=1:reset=0 -f null -`,
        peakDbfs: stat('Peak level dB'),
        rmsDbfs: stat('RMS level dB'),
        sampleCount: stat('Number of samples'),
    };
    if (ffmpeg.sampleCount !== measurements.sampleCount || Math.abs(ffmpeg.peakDbfs - measurements.peakDbfs) > 0.001
        || Math.abs(ffmpeg.rmsDbfs - measurements.rmsDbfs) > 0.001) throw new Error(`${id}: FFmpeg validation differs from PCM measurements`);
    const provenance = {
        file: `/coachs-corner/audio/${id}.wav`,
        description: recipe.description,
        origin: 'Original deterministic offline synthesis; no external audio source or text-to-sound generator.',
        generator: 'scripts/audio/generate-flashback-rewinds.mjs',
        generatorSha256,
        regenerate: 'node scripts/audio/generate-flashback-rewinds.mjs',
        sha256: hash(wav),
        encoding: { codec: 'pcm_s16le', channels: 1, sampleRate: SAMPLE_RATE, bitsPerSample: 16 },
        recipe,
        normalizationGain,
        measurements,
        ffmpeg,
        integration: {
            soundId: id,
            recommendedBankGain: recipe.recommendedBankGain,
            cue: id === 'flashback-entry'
                ? 'Scheduled automatically as a flashback starts, over its entry transition. Not a script sfx: cue.'
                : 'Scheduled automatically as a flashback ends, over its exit transition. Not a script sfx: cue.',
            note: 'Plays at the show rate and stops by the end of its transition, so faster speeds shorten it with the transition.',
        },
        listening: 'No subjective listening review performed by the generator; measurements only.',
    };
    writeFileSync(path.join(output, `${id}.json`), JSON.stringify(provenance, null, 2) + '\n');
    console.log(JSON.stringify({ file: provenance.file, sha256: provenance.sha256, ...measurements }, null, 2));
}
