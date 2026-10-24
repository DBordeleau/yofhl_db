import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateAssets } from '../../scripts/coachs-corner/assets.mjs';
import manifest from './media.json';
import { artUrl, mediaUrl, THEME_URL } from './media';
import { compile } from './timeline';
import { parseScript } from './script';
import { PILOT_SCRIPT } from './pilot';
import sharp from 'sharp';

// Pose art lives outside public/; its manifest keys keep the /coachs-corner/robots-v2/ form.
const sourceFile = (source: string) => source.startsWith('/coachs-corner/robots-v2/')
    ? path.join('assets', source) : path.join('public', source);

test('every versioned asset matches its hash and source, including all pilot poses', async () => {
    for (const [source, url] of Object.entries(manifest)) {
        const bytes = await readFile(path.join('public', url));
        const original = await readFile(sourceFile(source));
        assert.deepEqual(bytes, original, `stale manifest: ${source}`);
        assert.ok(url.includes(`.${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.`));
    }
    assert.ok(Object.keys(manifest).every(source => !source.endsWith('.webp')), 'only AVIF artwork ships');
    for (const pose of compile(parseScript(PILOT_SCRIPT)).art) {
        assert.match(artUrl(pose), /\/media\/.+\.avif$/);
        assert.match(artUrl(pose, true), /\/media\/.+-640\..+\.avif$/);
        for (const small of [false, true]) {
            const webp = await sharp(sourceFile(`/coachs-corner/robots-v2/${pose}${small ? '-640' : ''}.webp`)).metadata();
            const avif = sharp(path.join('public', artUrl(pose, small)));
            const metadata = await avif.metadata();
            assert.equal(metadata.width, webp.width);
            assert.equal(metadata.height, webp.height);
            assert.equal(metadata.hasAlpha, true, `${pose}: transparency is required`);
            const decoded = await avif.raw().toBuffer({ resolveWithObject: true });
            assert.equal(decoded.info.channels, 4);
            assert.equal(decoded.data.length, webp.width! * webp.height! * 4, `${pose}: entire AVIF decodes`);
        }
    }
    assert.match(THEME_URL, /\/media\//);
    assert.throws(() => mediaUrl('/missing.wav'), /Missing Coach/);
});

test('AVIF generation uses PNG originals, reuses unchanged encodes, and repairs stale/corrupt outputs', async t => {
    const prefix = path.join(os.tmpdir(), 'coachs-avif-');
    const root = await mkdtemp(prefix);
    t.after(async () => { assert.ok(path.resolve(root).startsWith(prefix)); await rm(root, { recursive: true, force: true }); });
    const base = path.join(root, 'public/coachs-corner');
    const art = path.join(root, 'assets/coachs-corner/robots-v2');
    await mkdir(art, { recursive: true });
    await mkdir(path.join(base, 'audio'), { recursive: true });
    await writeFile(path.join(base, 'coachs_corner_theme.mp3'), 'theme');
    const original = path.join(art, 'test-pose.png');
    const webp = path.join(art, 'test-pose.webp');
    const avif = path.join(art, 'test-pose.avif');
    const make = (colour: string) => sharp({ create: { width: 32, height: 32, channels: 4, background: colour } }).png().toBuffer();
    const firstPng = await make('#c8102e80');
    await writeFile(original, firstPng);
    await sharp(firstPng).webp().toFile(webp);
    const baselineWebp = await readFile(webp);
    const first = await generateAssets(root);
    const firstModified = (await stat(avif)).mtimeMs;
    assert.deepEqual(await generateAssets(root), first);
    assert.equal((await stat(avif)).mtimeMs, firstModified, 'builds reuse the committed encode');
    await writeFile(avif, 'corrupt');
    assert.deepEqual(await generateAssets(root), first, 'corrupt output regenerates deterministically');
    await writeFile(original, await make('#12345680'));
    const updated = await generateAssets(root);
    assert.notEqual(updated['/coachs-corner/robots-v2/test-pose.avif'], first['/coachs-corner/robots-v2/test-pose.avif']);
    assert.equal(updated['/coachs-corner/robots-v2/test-pose.webp'], undefined, 'WebP exports are not published');
    assert.deepEqual(await readFile(webp), baselineWebp, 'conversion never overwrites the WebP export');
    await sharp(await readFile(path.join(root, 'public', first['/coachs-corner/robots-v2/test-pose.avif']))).raw().toBuffer();
});

test('changed bytes get a new URL; identical builds are stable and retain earlier versions', async t => {
    const prefix = path.join(os.tmpdir(), 'coachs-media-');
    const root = await mkdtemp(prefix);
    t.after(async () => { assert.ok(path.resolve(root).startsWith(prefix)); await rm(root, { recursive: true, force: true }); });
    for (const dir of ['public/coachs-corner/audio', 'assets/coachs-corner/robots-v2']) await mkdir(path.join(root, dir), { recursive: true });
    const theme = path.join(root, 'public/coachs-corner/coachs_corner_theme.mp3');
    await writeFile(theme, 'first version');
    const first = await generateAssets(root);
    assert.deepEqual(await generateAssets(root), first);
    await writeFile(theme, 'new version');
    const second = await generateAssets(root);
    assert.notDeepEqual(first, second);
    assert.equal(await readFile(path.join(root, 'public', Object.values(first)[0] as string), 'utf8'), 'first version');
    assert.equal(await readFile(path.join(root, 'public', Object.values(second)[0] as string), 'utf8'), 'new version');
});
