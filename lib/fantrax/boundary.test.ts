// The lint rule that keeps the live season module's seam closed: outside lib/fantrax/, code imports only its
// public files. Linting sample imports proves the rule matches something, so it cannot pass silently.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// ESLint 8 ships no types; this is the part of its API the test uses.
type LintMessage = { ruleId: string | null; message: string };
type Linter = { lintText(code: string, options: { filePath: string }): Promise<{ messages: LintMessage[] }[]> };
const { ESLint } = createRequire(import.meta.url)('eslint') as { ESLint: new (options: { cwd: string }) => Linter };

const eslint = new ESLint({ cwd: fileURLToPath(new URL('../..', import.meta.url)) });

/** the boundary errors from linting `source` as if it were the file at `filePath` */
async function boundaryErrors(filePath: string, source: string) {
    const [result] = await eslint.lintText(source, { filePath });
    return result.messages.filter(message => message.ruleId === 'import/no-restricted-paths').map(message => message.message);
}

test('outside the live season module, an import of a module internal fails the lint', async () => {
    assert.equal((await boundaryErrors('lib/records/sample.ts', "export { fantraxSource } from '../fantrax/fantrax-source';\n")).length, 1);
    assert.equal((await boundaryErrors('app/sample.ts', "export { FANTRAX_TAG } from '@/lib/fantrax/cache-policy';\n")).length, 1);
    assert.equal((await boundaryErrors('components/sample.tsx', "export type { SourceCore } from '@/lib/fantrax/live-season-source';\n")).length, 1);
});

test('outside the live season module, its public files may be imported', async () => {
    assert.deepEqual(await boundaryErrors('app/sample.ts', [
        "export { FANTRAX_TAG, getLiveSeason } from '@/lib/fantrax/live-season';",
        "export { fantraxLeagueUrl } from '@/lib/fantrax/config';",
        "export { seasonYearFromFantrax } from '@/lib/fantrax/season';",
        "export { scheduledRefreshTime } from '@/lib/fantrax/schedule';",
    ].join('\n') + '\n'), []);
});

test("the Fantrax client may be imported only from the Coach's Corner production code and the database schema", async () => {
    const client = "export { readCore } from '@/lib/fantrax/fantrax-client';\n";
    assert.deepEqual(await boundaryErrors('lib/coachs-corner/production/sample.ts', client), []);
    assert.deepEqual(await boundaryErrors('db/schema.ts', client), []);
    assert.equal((await boundaryErrors('lib/coachs-corner/sample.ts', client)).length, 1);
    assert.equal((await boundaryErrors('lib/coachs-corner/production/sample.ts', "export { fantraxSource } from '@/lib/fantrax/fantrax-source';\n")).length, 1);
});

test('inside the live season module, its files import each other freely', async () => {
    assert.deepEqual(await boundaryErrors('lib/fantrax/sample.test.ts', "export { fantraxSource } from './fantrax-source';\n"), []);
});
