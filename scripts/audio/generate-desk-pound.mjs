import { encodeWav, ffmpegCheck, generatorSha256, highpassAlpha as highpassPole, lowpassAlpha, seededRandom, sha256, writeProvenance, writeWav } from './synth.mjs';

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
const random = seededRandom(recipe.seed);
const bodyAlpha = lowpassAlpha(recipe.bodyNoise.lowpassHz, recipe.sampleRate);
const contactAlpha = lowpassAlpha(recipe.contactNoise.lowpassHz, recipe.sampleRate);
const outputAlpha = lowpassAlpha(recipe.lowpassHz, recipe.sampleRate);
const highpassAlpha = highpassPole(recipe.highpassHz, recipe.sampleRate);
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

const { wav, normalizationGain, measurements } = encodeWav(samples, recipe.sampleRate, recipe.peakTargetDbfs);
writeWav('desk-pound', wav);
const ffmpeg = ffmpegCheck('desk-pound', measurements);
const provenance = {
    file: '/coachs-corner/audio/desk-pound.wav',
    description: 'One short, dull desk impact: irregular low body, dry broadband contact, and no pitched or metallic ring.',
    origin: 'Original deterministic offline synthesis; no external audio source or text-to-sound generator.',
    generator: 'scripts/audio/generate-desk-pound.mjs',
    generatorSha256: generatorSha256(import.meta.url),
    regenerate: 'node scripts/audio/generate-desk-pound.mjs',
    sha256: sha256(wav),
    encoding: { codec: 'pcm_s16le', channels: 1, sampleRate: recipe.sampleRate, bitsPerSample: 16 },
    recipe,
    normalizationGain,
    measurements,
    ffmpeg: { ...ffmpeg, durationSeconds: ffmpeg.sampleCount / recipe.sampleRate },
    integration: {
        suggestedSoundId: 'desk-pound',
        recommendedBankGain: recipe.recommendedBankGain,
        sampleEffectGate: 0.25,
        masterGain: 0.38,
        estimatedPeakBeforeCompressorDbfs: measurements.peakDbfs + 20 * Math.log10(0.25 * 0.38 * recipe.recommendedBankGain),
        cue: 'One explicit sfx:desk-pound during the silent desk-pound pose after Ron says "You did.", before Don says "I looked at the rest!".',
        note: '10 ms source lead-in clears the engine fade-in. Revision 2 replaces the rejected pitched modal knock with aperiodic impact noise. Preserve existing thud. Final voice balance and once-only firing need in-episode validation.',
    },
    listening: 'No subjective listening review performed by the generator; measurements only.',
};
writeProvenance('desk-pound', provenance);
console.log(JSON.stringify({ file: provenance.file, sha256: provenance.sha256, ...provenance.measurements,
    recommendedBankGain: recipe.recommendedBankGain, ffmpeg: provenance.ffmpeg }, null, 2));
