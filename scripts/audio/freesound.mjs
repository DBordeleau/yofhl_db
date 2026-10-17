// Fetch one CC0 sound's public high-quality preview, with provenance. No login,
// API key or scraping of search results. Original WAV downloads require Freesound login.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const url = new URL(process.argv[2]);
const match = url.pathname.match(/^\/people\/([^/]+)\/sounds\/(\d+)\/$/);
if (url.protocol !== 'https:' || url.hostname !== 'freesound.org' || !match || url.search) {
    throw new Error('Pass one https://freesound.org/people/NAME/sounds/ID/ URL.');
}
const response = await fetch(url);
if (!response.ok) throw new Error(`Freesound page returned ${response.status}`);
const html = await response.text();
if (!/href="https?:\/\/creativecommons.org\/publicdomain\/zero\/1.0\//.test(html)) {
    throw new Error('This helper only imports sounds explicitly marked CC0.');
}
const preview = html.match(/data-static-file-url="(https:\/\/cdn\.freesound\.org\/previews\/[^"<>]+-hq\.mp3)"/)?.[1];
if (!preview) throw new Error('No public high-quality MP3 preview found.');
const audioResponse = await fetch(preview);
if (!audioResponse.ok) throw new Error(`Preview returned ${audioResponse.status}`);
const bytes = Buffer.from(await audioResponse.arrayBuffer());
const folder = path.join(root, '.cache/freesound');
await mkdir(folder, { recursive: true });
const id = match[2];
const metadata = { id, author: match[1], page: url.href, preview,
    license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    retrieved: new Date().toISOString(), sourceFormat: 'Freesound high-quality MP3 preview',
    sha256: createHash('sha256').update(bytes).digest('hex') };
await writeFile(path.join(folder, `${id}.mp3`), bytes);
await writeFile(path.join(folder, `${id}.json`), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ id, author: metadata.author, license: metadata.license,
    bytes: bytes.length, file: path.join(folder, `${id}.mp3`) }));
