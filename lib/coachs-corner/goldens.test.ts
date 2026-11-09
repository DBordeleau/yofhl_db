import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CHARACTERS } from './cast';
import { parseScript } from './script';
import { compile } from './timeline';

// Every published episode as it compiled when it shipped (scripts/coachs-corner/export-goldens.mjs).
// A deliberate compiler change refreshes these with the export's --update flag, never by hand.
const DIR = path.join('lib', 'coachs-corner', 'goldens');
const goldens = readdirSync(DIR).filter(file => file.endsWith('.json'));

// Snapshots taken before #43 list the art flat; it is now grouped by host. Both read the same in host order.
const flatArt = (art: string[] | Record<string, string[]>) => Array.isArray(art) ? art : CHARACTERS.flatMap(who => art[who]);
const plain = (timeline: object) => JSON.parse(JSON.stringify(timeline));

test('the golden set covers the pilot and this season’s published episodes', () => {
    assert.ok(goldens.includes('opening-week.json'));
    assert.ok(goldens.length >= 5);
});

for (const file of goldens) test(`${file} compiles exactly as it shipped`, () => {
    const golden = JSON.parse(readFileSync(path.join(DIR, file), 'utf8'));
    const timeline = plain(compile(parseScript(golden.script)));
    assert.deepEqual({ ...timeline, art: flatArt(timeline.art) }, { ...golden.timeline, art: flatArt(golden.timeline.art) });
});
