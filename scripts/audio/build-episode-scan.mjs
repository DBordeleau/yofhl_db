import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = new URL('../../public/coachs-corner/', import.meta.url);
const html = new URL('episode-scan-temp.html', directory);
const js = new URL('episode-scan-temp.js', directory);
if (process.argv.includes('--clean')) {
    await Promise.all([rm(html, { force: true }), rm(js, { force: true })]);
} else {
    await mkdir(directory, { recursive: true });
    await build({ entryPoints: [fileURLToPath(new URL('episode-scan.mjs', import.meta.url))],
        outfile: fileURLToPath(js), bundle: true, platform: 'browser', format: 'esm' });
    await writeFile(html, `<!doctype html><meta charset="utf-8"><title>Coach's Corner audio verification</title>
<style>body{font:16px system-ui;min-width:600px;max-width:960px;margin:40px auto;padding:0 24px;background:#111a22;color:#eef3f6}h1{font-size:28px}pre{white-space:pre-wrap;font-size:13px}a{color:#90d6ff}audio{display:block;width:100%;margin:24px 0}</style>
<h1>Coach's Corner · full episode audio scan</h1><p id="status" role="status">Loading</p><p id="summary"></p><div id="downloads"></div><details><summary>Detailed measurements</summary><pre id="results"></pre></details>
<script type="module" src="./episode-scan-temp.js"></script>`);
    console.log('Open http://localhost:3000/coachs-corner/episode-scan-temp.html with the dev server running.');
}
