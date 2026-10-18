import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { root, runFfmpeg } from './ffmpeg.mjs';

// Original deterministic, aperiodic impact. The first version's fixed wood
// modes sounded like a pitched instrument. Here the body is filtered noise,
// with one non-repeating pressure pulse and a short broadband contact. There
// are no oscillators, resonant filters, metal modes, delay, or reverb.
// Start after the player's 8 ms sample fade-in.
const recipe = {
    revision: 2,
    sampleRate: 48000,
    durationSeconds: 0.28,
    impactAtSeconds: 0.01,
    attackSeconds: 0.00045,
    fadeOutAtSeconds: 0.15,
    silenceAtSeconds: 0.23,
    peakTargetDbfs: -10,
    seed: 20261018,
    bodyNoise: { amplitude: 3.4, decaySeconds: 0.022, lowpassHz: 850 },
    contactNoise: { amplitude: 0.72, decaySeconds: 0.0036, lowpassHz: 4200 },
    pressurePulse: { amplitude: 0.28, centerSeconds: 0.007, widthSeconds: 0.0028 },
    highpassHz: 45,
    lowpassHz: 4700,
    recommendedBankGain: 0.8,
};

const samples = new Float64Array(Math.round(recipe.sampleRate * recipe.durationSeconds));
const twoPi = 2 * Math.PI;
let seed = recipe.seed;
const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
};
const lowpassAlpha = hz => 1 - Math.exp(-twoPi * hz / recipe.sampleRate);
const bodyAlpha = lowpassAlpha(recipe.bodyNoise.lowpassHz);
const contactAlpha = lowpassAlpha(recipe.contactNoise.lowpassHz);
const outputAlpha = lowpassAlpha(recipe.lowpassHz);
const highpassAlpha = Math.exp(-twoPi * recipe.highpassHz / recipe.sampleRate);
let bodyNoise = 0, contactNoise = 0, lowpass = 0, highpass = 0, previous = 0;
for (let i = 0; i < samples.length; i++) {
    const time = i / recipe.sampleRate;
    const impactTime = time - recipe.impactAtSeconds;
    if (impactTime < 0 || time >= recipe.silenceAtSeconds) continue;
    bodyNoise += bodyAlpha * (random() - bodyNoise);
    contactNoise += contactAlpha * (random() - contactNoise);
    let value = recipe.bodyNoise.amplitude * bodyNoise
        * Math.exp(-impactTime / recipe.bodyNoise.decaySeconds)
        + recipe.contactNoise.amplitude * contactNoise
        * Math.exp(-impactTime / recipe.contactNoise.decaySeconds);
    // One derivative-of-Gaussian pressure displacement, not a repeated cycle.
    // It adds weight under the irregular contact without a ringing drum note.
    const pulseTime = (impactTime - recipe.pressurePulse.centerSeconds) / recipe.pressurePulse.widthSeconds;
    value += recipe.pressurePulse.amplitude * pulseTime * Math.exp(-0.5 * pulseTime * pulseTime);
    // Raised-cosine attack prevents an artificial single-sample click.
    value *= 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, impactTime / recipe.attackSeconds));
    highpass = highpassAlpha * (highpass + value - previous);
    previous = value;
    lowpass += outputAlpha * (highpass - lowpass);
    const fade = time <= recipe.fadeOutAtSeconds ? 1 : 0.5 + 0.5 * Math.cos(Math.PI
        * (time - recipe.fadeOutAtSeconds) / (recipe.silenceAtSeconds - recipe.fadeOutAtSeconds));
    samples[i] = lowpass * fade;
}

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
wav.writeUInt32LE(recipe.sampleRate, 24);
wav.writeUInt32LE(recipe.sampleRate * 2, 28);
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
if (peakDbfs > -9 || !Number.isFinite(rmsDbfs)) throw new Error('Invalid audio level');
const output = path.join(root, 'public/coachs-corner/audio');
mkdirSync(output, { recursive: true });
const wavPath = path.join(output, 'desk-pound.wav');
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
const ffmpegPeakDbfs = stat('Peak level dB');
const ffmpegRmsDbfs = stat('RMS level dB');
const ffmpegSamples = stat('Number of samples');
if (ffmpegSamples !== samples.length || Math.abs(ffmpegPeakDbfs - peakDbfs) > 0.001
    || Math.abs(ffmpegRmsDbfs - rmsDbfs) > 0.001) throw new Error('FFmpeg validation differs from PCM measurements');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const provenance = {
    file: '/coachs-corner/audio/desk-pound.wav',
    description: 'One short, dull desk impact: irregular low body, dry broadband contact, and no pitched or metallic ring.',
    origin: 'Original deterministic offline synthesis; no external audio source or text-to-sound generator.',
    generator: 'scripts/audio/generate-desk-pound.mjs',
    generatorSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    regenerate: 'node scripts/audio/generate-desk-pound.mjs',
    sha256: hash(wav),
    encoding: { codec: 'pcm_s16le', channels: 1, sampleRate: recipe.sampleRate, bitsPerSample: 16 },
    recipe,
    normalizationGain,
    measurements: {
        durationSeconds: samples.length / recipe.sampleRate,
        sampleCount: samples.length,
        bytes: wav.length,
        peakDbfs,
        rmsDbfs,
        dcOffset: dcSum / samples.length,
        lastNonzeroAtSeconds: lastNonzeroSample / recipe.sampleRate,
        trailingSilenceSeconds: (samples.length - 1 - lastNonzeroSample) / recipe.sampleRate,
    },
    ffmpeg: {
        command: 'node scripts/audio/ffmpeg.mjs -i public/coachs-corner/audio/desk-pound.wav -af astats=metadata=1:reset=0 -f null -',
        peakDbfs: ffmpegPeakDbfs,
        rmsDbfs: ffmpegRmsDbfs,
        sampleCount: ffmpegSamples,
        durationSeconds: ffmpegSamples / recipe.sampleRate,
    },
    integration: {
        suggestedSoundId: 'desk-pound',
        recommendedBankGain: recipe.recommendedBankGain,
        sampleEffectGate: 0.25,
        masterGain: 0.38,
        estimatedPeakBeforeCompressorDbfs: peakDbfs + 20 * Math.log10(0.25 * 0.38 * recipe.recommendedBankGain),
        cue: 'One explicit sfx:desk-pound during the silent desk-pound pose after Ron says "You did.", before Don says "I looked at the rest!".',
        note: '10 ms source lead-in clears the engine fade-in. Revision 2 replaces the rejected pitched modal knock with aperiodic impact noise. Preserve existing thud. Final voice balance and once-only firing need in-episode validation.',
    },
    listening: 'No subjective listening review performed by the generator; measurements only.',
};
writeFileSync(path.join(output, 'desk-pound.json'), JSON.stringify(provenance, null, 2) + '\n');
console.log(JSON.stringify({ file: provenance.file, sha256: provenance.sha256, ...provenance.measurements,
    recommendedBankGain: recipe.recommendedBankGain, ffmpeg: provenance.ffmpeg }, null, 2));
