import assert from 'node:assert/strict';
import test from 'node:test';
import { episodeFrom } from './episode';
import { frameAt } from './timeline';

const head = (week: number | null = 6, season: number | null = 2027) =>
    `---\ntitle: Test\n${season === null ? '' : `season: ${season}\n`}${week === null ? '' : `week: ${week}\n`}---\n`;

/** a short episode with one flashback in the middle */
const withFlashback = (header: string, front = head()) => `${front}DON: This week.

${header}
RON: Who's he going to get in a trade?

DON (point): He's sitting right there.
[end flashback]

RON: Back to now.`;

const middle = (line: { t0: number; t1: number }) => (line.t0 + line.t1) / 2;

test('a flashback block plays its lines as a flashback with a tag counted from this week', () => {
    const episode = episodeFrom(withFlashback('[flashback: week 4]'));
    assert.deepEqual(episode.diagnostics, []);
    const [now, first, second, after] = episode.timeline.lines;
    assert.equal(frameAt(episode.timeline, middle(now)).flashback, null);
    for (const line of [first, second]) {
        const frame = frameAt(episode.timeline, middle(line));
        assert.equal(frame.flashback?.tag, '2 WEEKS AGO');
        assert.equal(frame.flashback?.transition, null);
    }
    assert.equal(frameAt(episode.timeline, middle(after)).flashback, null);
});

/** the errors a script reports, as [line, message] */
const errors = (source: string) => episodeFrom(source).diagnostics.filter(d => d.severity === 'error').map(d => [d.line, d.message] as const);
const flashbackError = (source: string, line: number, pattern: RegExp) => {
    const found = errors(source);
    assert.ok(found.some(([at, message]) => at === line && pattern.test(message)), `no ${pattern} on line ${line}: ${JSON.stringify(found)}`);
};

test('a block that is never closed, nested in another, or closed without opening is an error on its line', () => {
    flashbackError(`${head()}[flashback: week 4]\nRON: Who's he going to get?`, 6, /never closed/);
    flashbackError(`${head()}[flashback: week 4]\nRON: Who's he going to get?\n[flashback: week 3]\nDON: Nobody.\n[end flashback]`, 8, /inside another/);
    flashbackError(`${head()}RON: Hi.\n[end flashback]`, 7, /no \[flashback: …\] open/);
});

test('a block replays one to eight lines; stage lines inside don’t count', () => {
    flashbackError(`${head()}DON: Hi.\n[flashback: week 4]\n[don: stare, 1s]\n[end flashback]`, 7, /no lines/);
    const nine = Array.from({ length: 9 }, (_, i) => `${i % 2 ? 'RON' : 'DON'}: Line ${i + 1}.`).join('\n\n');
    flashbackError(`${head()}[flashback: week 4]\n${nine}\n[end flashback]`, 6, /9 lines.*8/);
    const eight = Array.from({ length: 8 }, (_, i) => `${i % 2 ? 'RON' : 'DON'}: Line ${i + 1}.\n[beat]`).join('\n');
    assert.deepEqual(errors(`${head()}[flashback: week 4]\n${eight}\n[end flashback]`), []);
});

test('a flashback only goes back: this week, a later week and a later season are errors', () => {
    flashbackError(withFlashback('[flashback: week 6]'), 8, /this week/);
    flashbackError(withFlashback('[flashback: week 7]'), 8, /later than this week/);
    flashbackError(withFlashback('[flashback: 2027 week 9]'), 8, /later than this week/);
    flashbackError(withFlashback('[flashback: 2028 week 1]'), 8, /2028 season is later/);
});

test('the tag needs this episode’s week, and its season when the source names one', () => {
    flashbackError(withFlashback('[flashback: week 4]', head(null)), 7, /week:/);
    flashbackError(withFlashback('[flashback: 2026 week 4]', head(6, null)), 7, /season:/);
    assert.deepEqual(errors(withFlashback('[flashback: week 4]', head(6, null))), []);
});

test('a header that names no source is an error', () => {
    flashbackError(withFlashback('[flashback: last tuesday]'), 8, /like \[flashback: week 4\]/);
    flashbackError(withFlashback('[flashback: week 4, cam: wide]'), 8, /like \[flashback: week 4\]/);
});
