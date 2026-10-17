import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

// Encode from the original PNG, never from an already-lossy WebP. Full colour
// resolution avoids colour bleeding around the hosts' patterned suits.
export const AVIF_OPTIONS = { quality: 65, effort: 4, chromaSubsampling: '4:4:4' };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const writeChanged = async (file, bytes) => {
    const old = await readFile(file).catch(() => null);
    if (!old || !old.equals(Buffer.from(bytes))) await writeFile(file, bytes);
};

/** Keep old versions: cached pages may still reference them after an art edit. */
export async function generateAssets(root = process.cwd()) {
    const base = path.join(root, 'public/coachs-corner');
    const sources = ['coachs_corner_theme.mp3'];
    for (const [dir, extension] of [['robots-v2', '.webp'], ['audio', '.wav']]) {
        for (const file of await readdir(path.join(base, dir))) {
            if (file.endsWith(extension)) sources.push(`${dir}/${file}`);
        }
    }
    const media = path.join(base, 'media');
    await mkdir(media, { recursive: true });
    const buildPath = path.join(root, 'lib/coachs-corner/avif-build.json');
    await mkdir(path.dirname(buildPath), { recursive: true });
    const previous = JSON.parse(await readFile(buildPath, 'utf8').catch(() => '{}'));
    const recipe = JSON.stringify({ options: AVIF_OPTIONS, sharp: sharp.versions.sharp, heif: sharp.versions.heif });
    const avifBuild = { recipe, files: {} };
    for (const source of sources.filter(source => source.endsWith('.webp'))) {
        const original = source.replace(/(?:-640)?\.webp$/, '.png');
        const input = await readFile(path.join(base, original));
        const { width, height } = await sharp(await readFile(path.join(base, source))).metadata();
        const inputHash = digest(input);
        const avif = source.replace(/\.webp$/, '.avif');
        const outputPath = path.join(base, avif);
        let output = await readFile(outputPath).catch(() => null);
        const old = previous.files?.[avif];
        // Committed generated files make normal builds a hash check, not another
        // encode. Source edits, settings changes, or corrupt outputs regenerate.
        if (!output || previous.recipe !== recipe || old?.inputHash !== inputHash ||
            old?.width !== width || old?.height !== height || old?.outputHash !== digest(output)) {
            output = await sharp(input).resize(width, height).avif(AVIF_OPTIONS).toBuffer();
            await writeChanged(outputPath, output);
        }
        avifBuild.files[avif] = { inputHash, width, height, outputHash: digest(output) };
        sources.push(avif);
    }
    await writeChanged(buildPath, `${JSON.stringify(avifBuild, null, 2)}\n`);
    /** @type {Record<string, string>} */
    const manifest = {};
    for (const source of sources.sort()) {
        const bytes = await readFile(path.join(base, source));
        const hash = digest(bytes).slice(0, 16);
        const { name, ext } = path.parse(source);
        const target = `${name}.${hash}${ext}`;
        await copyFile(path.join(base, source), path.join(media, target));
        manifest[`/coachs-corner/${source}`] = `/coachs-corner/media/${target}`;
    }
    const manifestPath = path.join(root, 'lib/coachs-corner/media.json');
    await mkdir(path.dirname(manifestPath), { recursive: true });
    const json = `${JSON.stringify(manifest, null, 2)}\n`;
    if (await readFile(manifestPath, 'utf8').catch(() => '') !== json) await writeFile(manifestPath, json);
    return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    generateAssets().then(manifest => {
        console.log(`Prepared ${Object.keys(manifest).length} versioned Coach's Corner assets.`);
    }).catch(error => { console.error(error); process.exitCode = 1; });
}
