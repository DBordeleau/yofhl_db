import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { comparableTimeline } from './golden-timeline';
import { parseScript } from './script';
import { compile } from './timeline';

// Every published episode as it compiled when it shipped (scripts/coachs-corner/export-goldens.mjs).
// A deliberate compiler change refreshes these with the export's --update flag, never by hand.
const DIR = path.join('lib', 'coachs-corner', 'goldens');
const goldens = readdirSync(DIR).filter(file => file.endsWith('.json'));

test('the golden set covers the pilot and this season’s published episodes', () => {
    assert.ok(goldens.includes('opening-week.json'));
    assert.ok(goldens.length >= 5);
});

for (const file of goldens) test(`${file} compiles exactly as it shipped`, () => {
    const golden = JSON.parse(readFileSync(path.join(DIR, file), 'utf8'));
    assert.deepEqual(comparableTimeline(compile(parseScript(golden.script))), comparableTimeline(golden.timeline));
});
