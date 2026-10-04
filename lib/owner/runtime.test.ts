import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('Firebase Auth loads without experimental CommonJS-to-ESM interop', () => {
    // Vercel can disable require(ESM), even when the local Node version enables it.
    const result = spawnSync(process.execPath, [
        '--no-experimental-require-module', '-e', 'require("firebase-admin/auth")',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
});
