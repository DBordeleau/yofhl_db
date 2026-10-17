import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, runFfmpeg } from './ffmpeg.mjs';

// Short excerpts of real CRT recordings. Remove long whines and static beds so
// every screen change ends before the next words need space.
const edits = [
    { id: '616850', name: 'CRT click', file: 'tv-crt-click.wav', start: 0.89, duration: 0.32, highpass: 120, lowpass: 4800 },
    { id: '693860', name: 'Relay snap', file: 'tv-relay-snap.wav', start: 0.205, duration: 0.24, highpass: 160, lowpass: 5500 },
    { id: '786065', name: 'Channel fuzz', file: 'tv-channel-fuzz.wav', start: 0.52, duration: 0.22, highpass: 280, lowpass: 4200 },
];
const output = path.join(root, 'public/coachs-corner/audio');
mkdirSync(output, { recursive: true });
const results = [];
for (const edit of edits) {
    const input = path.join(root, `.cache/freesound/${edit.id}.mp3`);
    const source = JSON.parse(readFileSync(path.join(root, `.cache/freesound/${edit.id}.json`), 'utf8'));
    const hash = createHash('sha256').update(readFileSync(input)).digest('hex');
    if (hash !== source.sha256 || source.license !== 'CC0-1.0') throw new Error(`Source verification failed: ${edit.id}`);
    const filter = `highpass=f=${edit.highpass},lowpass=f=${edit.lowpass},afade=t=in:d=0.004,afade=t=out:st=${(edit.duration - 0.045).toFixed(3)}:d=0.045`;
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
    if (!Number.isFinite(rms) || rms < 1e-6) throw new Error(`Silent selection: ${edit.id}`);
    const gain = Math.min(10 ** (-28 / 20) / rms, 10 ** (-6 / 20) / peak);
    runFfmpeg(['-y', ...base, '-af', `${filter},volume=${gain}`, '-ac', '1', '-ar', '48000',
        '-c:a', 'pcm_s16le', '-metadata', `title=${edit.name}`, path.join(output, edit.file)]);
    results.push({ ...edit, source, filter, gain, rmsDb: 20 * Math.log10(rms * gain), peakDb: 20 * Math.log10(peak * gain) });
}
writeFileSync(path.join(output, 'tv-switches.json'), JSON.stringify(results, null, 2) + '\n');
const credits = ['# TV switch recordings', '', 'All three source recordings are CC0 1.0. These edits use Freesound\'s public high-quality MP3 previews, not original WAV downloads.', '',
    'Excerpts are filtered, faded, and matched to -28 dBFS RMS with a -6 dBFS peak ceiling. Outputs are mono 48 kHz, 16-bit WAV. The original recordings are longer; these short edits are for screen changes during dialogue.', ''];
for (const { file, name, start, duration, source } of results) {
    credits.push(`- **${file}**: [${name}](${source.page}) by ${source.author}. Excerpt ${start.toFixed(3)} to ${(start + duration).toFixed(3)} seconds. [CC0 1.0](${source.licenseUrl}).`);
}
credits.push('', 'Source hashes and exact processing settings are in `tv-switches.json`. Rebuild with `node scripts/audio/prepare-tv-switches.mjs`; see `scripts/audio/README.md` for source retrieval and FFmpeg setup.', '');
writeFileSync(path.join(output, 'TV-SWITCH-CREDITS.md'), credits.join('\n'));
console.log(JSON.stringify(results.map(({ file, duration, rmsDb, peakDb }) => ({ file, duration, rmsDb, peakDb })), null, 2));
