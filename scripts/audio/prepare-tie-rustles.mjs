import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, runFfmpeg } from './ffmpeg.mjs';

// Isolated movements, with a little space for fades on both ends. Times refer
// to the downloaded HQ preview, so edits can be reproduced without guessing.
const edits = [
    { id: '19291', name: 'Sleeve rustle', file: 'tie-sleeve.wav', start: 0.48, duration: 0.36 },
    { id: '435292', name: 'Cloth rustle 7', file: 'tie-cloth-7.wav', start: 49.44, duration: 0.4 },
    { id: '435296', name: 'Cloth rustle 8', file: 'tie-cloth-8.wav', start: 2.53, duration: 0.46 },
];
const output = path.join(root, 'public/coachs-corner/audio');
mkdirSync(output, { recursive: true });
const results = [];
for (const edit of edits) {
    const input = path.join(root, `.cache/freesound/${edit.id}.mp3`);
    const source = JSON.parse(readFileSync(path.join(root, `.cache/freesound/${edit.id}.json`), 'utf8'));
    const hash = createHash('sha256').update(readFileSync(input)).digest('hex');
    if (hash !== source.sha256 || source.license !== 'CC0-1.0') throw new Error(`Source verification failed: ${edit.id}`);
    const filter = `highpass=f=180,lowpass=f=6000,afade=t=in:d=0.012,afade=t=out:st=${(edit.duration - 0.055).toFixed(3)}:d=0.055`;
    const base = ['-ss', String(edit.start), '-t', String(edit.duration), '-i', input];
    const raw = runFfmpeg([...base, '-af', filter, '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1']).stdout;
    let sum = 0, peak = 0;
    for (let i = 0; i < raw.length; i += 4) {
        const value = raw.readFloatLE(i);
        if (!Number.isFinite(value)) throw new Error('Invalid decoded sample');
        sum += value * value;
        peak = Math.max(peak, Math.abs(value));
    }
    const rms = Math.sqrt(sum / (raw.length / 4));
    if (rms < 1e-6) throw new Error(`Silent selection: ${edit.id}`);
    const gain = Math.min(10 ** (-26 / 20) / rms, 10 ** (-6 / 20) / peak);
    runFfmpeg(['-y', ...base, '-af', `${filter},volume=${gain}`, '-ac', '1', '-ar', '48000',
        '-c:a', 'pcm_s16le', '-metadata', `title=${edit.name}`, path.join(output, edit.file)]);
    results.push({ ...edit, source, filter, gain, rmsDb: 20 * Math.log10(rms * gain), peakDb: 20 * Math.log10(peak * gain) });
}
writeFileSync(path.join(output, 'tie-rustles.json'), JSON.stringify(results, null, 2) + '\n');
const credits = ['# Tie rustle recordings', '', 'All three source recordings are CC0 1.0. These edits use Freesound’s public high-quality MP3 previews, not original WAV downloads.', '',
    'The excerpts are trimmed, filtered at 180–6000 Hz, faded, and matched to -26 dBFS RMS (with a -6 dBFS peak ceiling). Outputs are mono 48 kHz, 16-bit WAV. No synthetic mechanical layer is added.', ''];
for (const { file, name, start, duration, source } of results) {
    credits.push(`- **${file}**: [${name}](${source.page}) by ${source.author}. Excerpt ${start.toFixed(2)}–${(start + duration).toFixed(2)} seconds. [CC0 1.0](${source.licenseUrl}).`);
}
credits.push('', 'Source hashes and exact processing settings are in `tie-rustles.json`. Rebuild with `node scripts/audio/prepare-tie-rustles.mjs`; see `scripts/audio/README.md` for source retrieval and FFmpeg setup.', '');
writeFileSync(path.join(output, 'CREDITS.md'), credits.join('\n'));
console.log(JSON.stringify(results.map(({ file, duration, rmsDb, peakDb }) => ({ file, duration, rmsDb, peakDb })), null, 2));
