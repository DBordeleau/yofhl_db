import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const directory = new URL('../../public/coachs-corner/', import.meta.url);
const html = new URL('episode-scan-temp.html', directory);
const js = new URL('episode-scan-temp.js', directory);
const clean = () => Promise.all([rm(html, { force: true }), rm(js, { force: true })]);
const escapeHtml = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// Remove an older successful scan before validating input. A failed build must
// not leave a page that appears to test the newly requested episode.
await clean();
try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--clean') process.exit(0);
    if (args.length && (args.length !== 2 || args[0] !== '--script' || args[1].startsWith('--'))) {
        throw new Error('Usage: node scripts/audio/build-episode-scan.mjs [--script <screenplay.txt> | --clean]');
    }
    let source, id, sourceKind;
    if (args.length) {
        const path = resolve(args[1]);
        if (extname(path).toLowerCase() !== '.txt') throw new Error('--script requires a screenplay .txt file, not a fact packet or environment file.');
        if (!(await stat(path)).isFile()) throw new Error('--script must name a regular file.');
        source = await readFile(path, 'utf8');
        id = basename(path).toLowerCase() === 'script.txt' ? basename(dirname(path)) : basename(path, extname(path));
        sourceKind = 'local-script';
    } else {
        const pilot = await tsImport('../../lib/coachs-corner/pilot.ts', import.meta.url);
        source = pilot.PILOT_SCRIPT;
        id = pilot.PILOT_SLUG;
        sourceKind = 'bundled-pilot';
    }
    const { parseScript } = await tsImport('../../lib/coachs-corner/script.ts', import.meta.url);
    const script = parseScript(source);
    const errors = script.diagnostics.filter(item => item.severity === 'error');
    if (errors.length) throw new Error(errors.map(item => `Line ${item.line}: ${item.message}`).join('\n'));
    // Keep performed content and cues only. Do not bundle the packet, local path,
    // script comments, or stage notes into the temporary public diagnostic.
    script.events = script.events.map(event => {
        if (event.kind !== 'stage') return event;
        const stage = { ...event };
        delete stage.note;
        return stage;
    });
    const episode = { id: id.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'episode',
        title: script.meta.title, sourceKind, scriptSha256: createHash('sha256').update(source).digest('hex') };
    await mkdir(directory, { recursive: true });
    const built = await build({ entryPoints: [fileURLToPath(new URL('episode-scan.mjs', import.meta.url))],
        outfile: fileURLToPath(js), bundle: true, platform: 'browser', format: 'esm', write: false,
        plugins: [{ name: 'selected-episode', setup(build) {
            build.onResolve({ filter: /^coachs-episode-scan-input$/ }, () => ({ path: 'selected-episode', namespace: 'episode' }));
            build.onLoad({ filter: /.*/, namespace: 'episode' }, () => ({
                contents: `export const episode = ${JSON.stringify(episode)}; export const script = ${JSON.stringify(script)};`, loader: 'js',
            }));
        } }] });
    const bundle = built.outputFiles[0].contents;
    const version = createHash('sha256').update(bundle).digest('hex').slice(0, 16);
    await writeFile(js, bundle);
    await writeFile(html, `<!doctype html><meta charset="utf-8"><title>${escapeHtml(episode.title)} · Coach's Corner audio scan</title>
<style>body{font:16px system-ui;min-width:600px;max-width:960px;margin:40px auto;padding:0 24px;background:#111a22;color:#eef3f6}h1{font-size:28px}pre{white-space:pre-wrap;font-size:13px}a{color:#90d6ff}audio{display:block;width:100%;margin:24px 0}</style>
<h1>${escapeHtml(episode.title)}</h1><p>Full episode audio scan · ${escapeHtml(episode.id)} · ${episode.sourceKind}</p><p id="status" role="status">Loading</p><p id="summary"></p><div id="downloads"></div><details><summary>Detailed measurements</summary><pre id="results"></pre></details>
<script type="module" src="./episode-scan-temp.js?v=${version}"></script>`);
    console.log(`Built audio scan for ${episode.title} (${episode.id}, ${episode.sourceKind}).`);
    console.log('Open http://localhost:3000/coachs-corner/episode-scan-temp.html with the dev server running.');
} catch (error) {
    await clean();
    console.error(`Audio scan build failed: ${error.message}`);
    process.exitCode = 1;
}
