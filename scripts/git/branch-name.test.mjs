import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { rejectedBranches } from './branch-name.mjs';

const sha = 'a'.repeat(40), zero = '0'.repeat(40);
const push = (ref, local = sha) => `refs/heads/x ${local} ${ref} ${zero}\n`;

test('branches named <type>/<issue>-<slug> push', () => {
    for (const branch of ['feat/38-episode-module', 'fix/7-standings-bye-slots', 'chore/120-ci', 'docs/3-coachs-corner-format']) {
        assert.deepEqual(rejectedBranches(push(`refs/heads/${branch}`)), [], branch);
    }
});

test('any other branch name is rejected', () => {
    for (const branch of ['master', 'focus-audit', 'spec-1-tier-1', 'feat/episode-module', 'feat/38', 'feature/38-episode', 'feat/38-Episode', 'feat/38-episode-', 'claude/issue-36-implementation']) {
        assert.deepEqual(rejectedBranches(push(`refs/heads/${branch}`)), [branch], branch);
    }
});

test('tags and branch deletions are not branch names to check', () => {
    assert.deepEqual(rejectedBranches(push('refs/tags/v1.0')), []);
    assert.deepEqual(rejectedBranches(push('refs/heads/focus-audit', zero)), []);
});

test('the hook script exits non-zero with a message for a bad name, zero for a good one', () => {
    const script = fileURLToPath(new URL('./branch-name.mjs', import.meta.url));
    const bad = spawnSync(process.execPath, [script], { input: push('refs/heads/focus-audit'), encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /focus-audit must be named <type>\/<issue>-<slug>/);
    const good = spawnSync(process.execPath, [script], { input: push('refs/heads/feat/38-episode-module'), encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr);
});
