import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CHARACTERS, poseOf } from './cast';
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
    const timeline = compile(parseScript(golden.script));
    assert.deepEqual(comparableTimeline(timeline), comparableTimeline(golden.timeline));
    for (const who of CHARACTERS) for (const pose of timeline.art[who]) assert.equal(poseOf(pose)?.host, who, `${pose} is filed under ${who}`);
});
