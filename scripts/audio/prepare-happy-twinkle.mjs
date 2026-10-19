import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { root, runFfmpeg } from './ffmpeg.mjs';

const source = JSON.parse(readFileSync(path.join(root, '.cache/freesound/787357.json'), 'utf8'));
const input = path.join(root, '.cache/freesound/787357.mp3');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
if (source.license !== 'CC0-1.0' || sha(readFileSync(input)) !== source.sha256) throw new Error('Verify the requested CC0 source first.');
const raw = runFfmpeg(['-i', input, '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1']).stdout;
let peak = 0, square = 0;
for (let i = 0; i < raw.length; i += 4) { const x = raw.readFloatLE(i); peak = Math.max(peak, Math.abs(x)); square += x * x; }
const duration = raw.length / 4 / 48000;
if (!(peak > 0 && Number.isFinite(square))) throw new Error('Invalid source audio');
const gain = Math.min(10 ** (-6 / 20) / peak, 10 ** (-20 / 20) / Math.sqrt(square / (raw.length / 4)));
const filter = `volume=${gain},afade=t=in:d=0.01,afade=t=out:st=${duration - .3}:d=0.3`;
const output = path.join(root, 'public/coachs-corner/audio/happy-twinkle.wav');
runFfmpeg(['-y', '-i', input, '-af', filter, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', output]);
const metadata = { name: 'Happy twinkle', source, duration, filter, outputSha256: sha(readFileSync(output)), bankGain: .12,
    use: 'One quiet accent during an explicit happy particle cue; playback is limited to the visible cue duration.',
    attribution: 'Twinkle (1) by Alexia205, Freesound 787357, CC0 1.0. Processed public high-quality MP3 preview, not the original M4A.' };
writeFileSync(output.replace('.wav', '.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify(metadata, null, 2));
