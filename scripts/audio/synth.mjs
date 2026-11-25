// Shared pieces of the deterministic sound generators (generate-*.mjs): seeded noise, one-pole
// filter coefficients, 16-bit mono WAV encoding with level measurements, an independent FFmpeg
// check of the written file, and the provenance JSON written beside it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { root, runFfmpeg } from './ffmpeg.mjs';

export const AUDIO_DIR = path.join(root, 'public/coachs-corner/audio');
const twoPi = 2 * Math.PI;

/** a linear congruential generator from `seed`, giving the same noise in -1..1 on every run */
export function seededRandom(seed) {
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2147483648 - 1;
    };
}

/** the smoothing coefficient of a one-pole lowpass at `hz` */
export const lowpassAlpha = (hz, sampleRate) => 1 - Math.exp(-twoPi * hz / sampleRate);
/** the feedback coefficient of a one-pole highpass at `hz` */
export const highpassAlpha = (hz, sampleRate) => Math.exp(-twoPi * hz / sampleRate);

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** a generator script's hash, with line endings as committed so a Windows checkout records the same one */
export const generatorSha256 = moduleUrl => sha256(readFileSync(fileURLToPath(moduleUrl), 'utf8').replace(/\r\n/g, '\n'));

/** Normalizes `samples` to `peakTargetDbfs` and encodes them as 16-bit mono PCM, measuring the result. */
export function encodeWav(samples, sampleRate, peakTargetDbfs) {
    const rawPeak = samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
    const normalizationGain = 10 ** (peakTargetDbfs / 20) / rawPeak;
    const dataBytes = samples.length * 2;
    const wav = Buffer.alloc(44 + dataBytes);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + dataBytes, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); // Integer PCM.
    wav.writeUInt16LE(1, 22); // Mono.
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 2, 28);
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
    if (peakDbfs > peakTargetDbfs + 1 || !Number.isFinite(rmsDbfs)) throw new Error('Invalid audio level');
    return { wav, normalizationGain, measurements: {
        durationSeconds: samples.length / sampleRate,
        sampleCount: samples.length,
        bytes: wav.length,
        peakDbfs,
        rmsDbfs,
        dcOffset: dcSum / samples.length,
        lastNonzeroAtSeconds: lastNonzeroSample / sampleRate,
        trailingSilenceSeconds: (samples.length - 1 - lastNonzeroSample) / sampleRate,
    } };
}

/** Writes `<id>.wav` to the audio folder and returns its path. */
export function writeWav(id, wav) {
    mkdirSync(AUDIO_DIR, { recursive: true });
    const wavPath = path.join(AUDIO_DIR, `${id}.wav`);
    writeFileSync(wavPath, wav);
    return wavPath;
}

/**
 * Decodes the written file with FFmpeg and measures it independently, throwing if it disagrees with
 * `measurements`. Failure leaves the WAV for inspection but no completed provenance file.
 */
export function ffmpegCheck(id, measurements) {
    const command = `node scripts/audio/ffmpeg.mjs -i public/coachs-corner/audio/${id}.wav -af astats=metadata=1:reset=0 -f null -`;
    const analysis = runFfmpeg(['-i', path.join(AUDIO_DIR, `${id}.wav`), '-af', 'astats=metadata=1:reset=0', '-f', 'null', '-']).stderr.toString();
    const stat = label => {
        const matches = [...analysis.matchAll(new RegExp(`${label}: ([^\\r\\n]+)`, 'g'))];
        const value = Number(matches.at(-1)?.[1]);
        if (!Number.isFinite(value)) throw new Error(`FFmpeg omitted ${label}`);
        return value;
    };
    const ffmpeg = { command, peakDbfs: stat('Peak level dB'), rmsDbfs: stat('RMS level dB'), sampleCount: stat('Number of samples') };
    if (ffmpeg.sampleCount !== measurements.sampleCount || Math.abs(ffmpeg.peakDbfs - measurements.peakDbfs) > 0.001
        || Math.abs(ffmpeg.rmsDbfs - measurements.rmsDbfs) > 0.001) throw new Error(`${id}: FFmpeg validation differs from PCM measurements`);
    return ffmpeg;
}

/** Writes `<id>.json`, the provenance of a generated sound. */
export function writeProvenance(id, provenance) {
    writeFileSync(path.join(AUDIO_DIR, `${id}.json`), JSON.stringify(provenance, null, 2) + '\n');
}
