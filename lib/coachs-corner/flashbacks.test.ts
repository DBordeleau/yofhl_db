import assert from 'node:assert/strict';
import test from 'node:test';
import { episodeFrom } from './episode';
import { FLASHBACK_ENTRY_MS, FLASHBACK_EXIT_MS, frameAt, frameSignature } from './timeline';

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

test('the tag counts weeks back in this season and seasons back before it; the pilot is week 0 of 2027', () => {
    const tag = (header: string, front = head()) => {
        const episode = episodeFrom(withFlashback(header, front));
        assert.deepEqual(episode.diagnostics, []);
        return frameAt(episode.timeline, middle(episode.timeline.lines[1])).flashback?.tag;
    };
    assert.equal(tag('[flashback: week 5]'), '1 WEEK AGO');
    assert.equal(tag('[flashback: week 2]'), '4 WEEKS AGO');
    assert.equal(tag('[flashback: pilot]'), '6 WEEKS AGO');
    assert.equal(tag('[flashback: pilot]', head(1)), '1 WEEK AGO');
    assert.equal(tag('[flashback: 2027 week 3]'), '3 WEEKS AGO');
    assert.equal(tag('[flashback: 2027 week 3]', head(1, 2028)), 'LAST SEASON');
    assert.equal(tag('[flashback: pilot]', head(20, 2028)), 'LAST SEASON');
    assert.equal(tag('[flashback: 2027 week 12]', head(2, 2030)), '3 SEASONS AGO');
    assert.equal(tag('[Flashback:  2027  Week 3]'), '3 WEEKS AGO');
});

test('going in and coming out add their transitions to the runtime, and frames report how far through each one is', () => {
    const plain = episodeFrom(withFlashback('[beat]').replace('[end flashback]', '[beat]'));
    const episode = episodeFrom(withFlashback('[flashback: week 4]'));
    assert.ok(FLASHBACK_ENTRY_MS > FLASHBACK_EXIT_MS && FLASHBACK_EXIT_MS > 0);
    // the two [beat]s stand in for the markers, so the only difference is the transitions
    const beats = 2 * 450;
    assert.equal(episode.summary.runtime - (plain.summary.runtime - beats), FLASHBACK_ENTRY_MS + FLASHBACK_EXIT_MS);
    assert.equal(episode.summary.segment, episode.summary.runtime - 6000);

    const [span] = episode.timeline.flashbacks!;
    const [now, first, second, after] = episode.timeline.lines;
    assert.equal(span.t0, now.end);
    assert.equal(span.entered - span.t0, FLASHBACK_ENTRY_MS);
    assert.equal(first.t0, span.entered);
    assert.equal(span.leaving, second.end);
    assert.equal(span.t1 - span.leaving, FLASHBACK_EXIT_MS);
    assert.equal(after.t0, span.t1);
    assert.deepEqual(episode.timeline.lines.map(line => line.flashback), [undefined, true, true, undefined]);

    const at = (t: number) => frameAt(episode.timeline, t).flashback;
    assert.equal(at(span.t0 - 1), null);
    assert.deepEqual(at(span.t0)?.transition, { edge: 'entry', progress: 0 });
    assert.deepEqual(at(span.t0 + FLASHBACK_ENTRY_MS / 2)?.transition, { edge: 'entry', progress: 0.5 });
    assert.equal(at(span.entered)?.transition, null);
    assert.deepEqual(at(span.leaving + FLASHBACK_EXIT_MS / 4)?.transition, { edge: 'exit', progress: 0.25 });
    assert.equal(at(span.t1), null);
    // the studio re-renders as a transition moves, and holds still between them
    const signature = (t: number) => frameSignature(frameAt(episode.timeline, t));
    assert.notEqual(signature(span.t0 + 100), signature(span.t0 + 400));
    assert.notEqual(signature(span.t1 - 1), signature(span.t1));
});

test('the plates clear as the flashback starts and again as it ends', () => {
    const episode = episodeFrom(withFlashback('[flashback: week 4]'));
    const [span] = episode.timeline.flashbacks!;
    const [, first, second, after] = episode.timeline.lines;
    const plates = (t: number) => frameAt(episode.timeline, t).captions;
    assert.notEqual(plates(span.t0 - 1).don, null);
    assert.deepEqual(plates(span.t0), { don: null, ron: null });
    assert.equal(plates(middle(second)).ron?.line, first.index);
    assert.notEqual(plates(span.leaving - 1).don, null);
    assert.deepEqual(plates(span.leaving), { don: null, ron: null });
    // Don's plate from the past doesn't come back with the present
    assert.equal(plates(middle(after)).don, null);
    assert.equal(plates(middle(after)).ron?.line, after.index);
});

test('a jump into the middle of a flashback lands in it, the same frame every time', () => {
    const episode = episodeFrom(withFlashback('[flashback: week 4]'));
    const t = middle(episode.timeline.lines[2]);
    const landed = frameAt(episode.timeline, t);
    assert.deepEqual(landed.flashback, { span: 0, tag: '2 WEEKS AGO', transition: null });
    frameAt(episode.timeline, episode.timeline.flashbacks![0].t0);
    frameAt(episode.timeline, episode.timeline.showEnd);
    assert.deepEqual(frameAt(episode.timeline, t), landed);
    assert.equal(frameSignature(frameAt(episode.timeline, t)), frameSignature(landed));
});
