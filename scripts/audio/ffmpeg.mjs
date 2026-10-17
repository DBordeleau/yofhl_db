import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function ffmpegPath() {
    if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
    const folder = path.join(root, '.cache/audio-tools');
    if (existsSync(folder)) for (const name of readdirSync(folder).sort().reverse()) {
        const executable = path.join(folder, name, 'bin/ffmpeg.exe');
        if (existsSync(executable)) return executable;
    }
    return 'ffmpeg';
}

export function runFfmpeg(args) {
    const result = spawnSync(ffmpegPath(), ['-hide_banner', '-nostdin', ...args], { maxBuffer: 64 * 1024 * 1024 });
    if (result.error) throw new Error(`FFmpeg unavailable. See scripts/audio/README.md. ${result.error.message}`);
    if (result.status !== 0) throw new Error(result.stderr.toString());
    return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = runFfmpeg(process.argv.slice(2));
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
}
