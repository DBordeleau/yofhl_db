// Snapshots every published Coach's Corner episode, script and compiled timeline, as a committed
// fixture in lib/coachs-corner/goldens/. lib/coachs-corner/goldens.test.ts recompiles each one, so a
// change to cast or the compiler that alters a shipped show fails loudly.
//
//   npm run coachs:goldens [-- --update]
//
// Reads league.coachs_corner_episodes only. New episodes are added; an existing fixture whose script
// or timeline would change is left alone and reported, unless --update says the change is deliberate.

import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import postgres from 'postgres';
import { comparableTimeline } from '../../lib/coachs-corner/golden-timeline.ts';
import { PILOT_SCRIPT, PILOT_SLUG } from '../../lib/coachs-corner/pilot.ts';
import { parseScript } from '../../lib/coachs-corner/script.ts';
import { compile } from '../../lib/coachs-corner/timeline.ts';

const DIR = path.join('lib', 'coachs-corner', 'goldens');

const update = process.argv.includes('--update');
assert(process.argv.slice(2).every(arg => arg === '--update'), 'Only --update is supported');
const url = process.env.DATABASE_URL_V2 ?? process.env.DATABASE_URL;
assert(url && !url.startsWith('pglite:'), 'Set DATABASE_URL_V2 (or DATABASE_URL) to the Postgres database');

const db = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
let episodes;
try {
    episodes = await db.begin('read only', tx => tx`select slug, script from league.coachs_corner_episodes
        where published_at is not null order by published_at, id`);
} finally {
    await db.end();
}
// The pilot ships in the bundle until someone republishes it.
if (!episodes.some(e => e.slug === PILOT_SLUG)) episodes = [{ slug: PILOT_SLUG, script: PILOT_SCRIPT }, ...episodes];

await mkdir(DIR, { recursive: true });
const stale = [];
for (const { slug, script } of episodes) {
    const file = path.join(DIR, `${slug}.json`);
    const timeline = compile(parseScript(script));
    const existing = await readFile(file, 'utf8').then(JSON.parse, () => null);
    if (existing?.script === script && isDeepStrictEqual(comparableTimeline(existing.timeline), comparableTimeline(timeline))) continue;
    if (existing !== null && !update) { stale.push(slug); continue; }
    await writeFile(file, `${JSON.stringify({ slug, script, timeline }, null, 1)}\n`);
    console.log(`${existing === null ? 'added' : 'updated'} ${file}`);
}
if (stale.length) {
    console.error(`These fixtures would change: ${stale.join(', ')}. Re-run with --update only if the change is deliberate.`);
    process.exitCode = 1;
}
console.log(`${episodes.length} published episodes checked.`);
