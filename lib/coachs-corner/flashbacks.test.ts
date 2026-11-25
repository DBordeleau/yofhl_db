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
