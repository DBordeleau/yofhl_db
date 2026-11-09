import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// ADR 0002: cast is the only code that names host art. Everything else asks it by host and gesture,
// so a new wardrobe never needs a regex widened or a table copied somewhere else.
const ROOTS = ['app', 'components', 'lib', 'scripts'];
const CAST = path.join('lib', 'coachs-corner', 'cast.ts');
const GOLDENS = path.join('lib', 'coachs-corner', 'goldens');
// a deploy checker, not runtime code: it fetches the published art at literal URLs
const DEPLOY_CHECKER = path.join('scripts', 'coachs-corner', 'verify-publishing.mjs');

const LEAKS: [string, RegExp][] = [
    ['an art ID', /['"`](?:don|ron)-[a-z]/],
    ['a wardrobe regex', /(?:halloween|remembrance|alternate)(?:-\[|-\\d|\|)|(?:\||\(\?:)(?:halloween|remembrance|alternate)/],
];
const ART_URL = /robots-v2\/(?:don|ron)-/;

const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || file === GOLDENS ? [] : sources(file);
    return /\.(?:ts|tsx|mjs|js)$/.test(entry.name) && !/\.test\.\w+$/.test(entry.name) && file !== CAST ? [file] : [];
});

test('no code outside cast names host art or parses a wardrobe', () => {
    const found: string[] = [];
    for (const file of ROOTS.flatMap(sources)) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
            for (const [what, pattern] of LEAKS) if (pattern.test(line)) found.push(`${file}:${index + 1} names ${what}`);
            if (file !== DEPLOY_CHECKER && ART_URL.test(line)) found.push(`${file}:${index + 1} names an art URL`);
        });
    }
    assert.deepEqual(found, [], 'ask cast (artFor, mouthClipFor, lapelFor, poseOf) instead');
});
