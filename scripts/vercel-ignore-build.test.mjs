import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The Vercel ignore step decides whether a push deploys. A path excluded by
// mistake stops deploying real changes, and the symptom is a stale site rather
// than a failure, so the list is checked here instead of in production.

const script = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'vercel-ignore-build.sh'), 'utf8');

/** The pathspecs the script excludes from its `git diff`, in the order they appear. */
const excluded = [...script.matchAll(/':\(exclude(?:,glob)?\)([^']+)'/g)].map(([, spec]) => spec);

test('the script excludes some paths', () => {
    assert.ok(excluded.length > 5, `parsed only ${excluded.length} pathspecs; did the script's shape change?`);
});

test('every path a reader changes is excluded', () => {
    for (const spec of [
        'docs/',
        '.agents/',
        '.claude/',
        '.gitignore',
        '**/*.md',
        'assets/coachs-corner/editorial/',
    ]) {
        assert.ok(excluded.includes(spec), `${spec} should skip the build but is not excluded`);
    }
});

test('no path the site reads is excluded', () => {
    // A build input, or a file next build resolves. Excluding any of these ships
    // a change without rebuilding.
    const buildInputs = [
        'app/', 'lib/', 'components/', 'public/', 'db/', 'league/', 'data/',
        'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json',
        'tailwind.config.ts', 'postcss.config.mjs', 'drizzle.config.ts', 'vercel.json',
        'scripts/', 'assets/',
    ];
    for (const input of buildInputs) {
        assert.ok(
            !excluded.includes(input),
            `${input} is a build input and must not be excluded; the site would ship unbuilt`,
        );
    }
});

test('a path under an excluded directory is still narrower than that directory', () => {
    // lib/ and assets/ hold build inputs, so only named subtrees of them may be
    // excluded. This catches ':(exclude)lib/' slipping in beside the goldens.
    for (const spec of excluded) {
        for (const parent of ['lib/', 'assets/', 'scripts/', 'app/']) {
            if (spec === parent) assert.fail(`${spec} excludes a whole build directory`);
        }
    }
    assert.ok(excluded.includes('lib/coachs-corner/goldens/'), 'the goldens should still be excluded');
});
