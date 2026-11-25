import assert from 'node:assert/strict';
import test from 'node:test';
import { episodeFrom } from './episode';
import { FLASHBACK_ENTRY_MS, FLASHBACK_EXIT_MS, frameAt, frameSignature } from './timeline';
import { createTransport } from './transport';

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

test('a flashback that opens the episode is played, not part of the opening picture', () => {
    const episode = episodeFrom(`${head()}[don: point]\n[flashback: week 4]\n[don: stare]\nDON: Back then.\n[end flashback]\n\nDON: Now.`);
    assert.deepEqual(episode.diagnostics, []);
    assert.equal(episode.openingPicture.hosts.don.gesture, 'point');
    assert.equal(episode.openingPicture.flashback, null);
    const [span] = episode.timeline.flashbacks!;
    assert.equal(span.t0, 6000);
});

test('don: in the header puts Don in that wardrobe for lines naming no gesture, and a prefixed gesture overrides it', () => {
    const episode = episodeFrom(`${head()}DON: This week.

[flashback: week 4, don: remembrance-rest]
DON: Back then.

DON (yell): Loud back then!

DON (alternate-4-point): Another suit.
[end flashback]

RON: Back to now.`);
    assert.deepEqual(episode.diagnostics, []);
    const [, plain, loud, prefixed] = episode.timeline.lines;
    const don = (line: { t0: number; t1: number }) => frameAt(episode.timeline, middle(line)).hosts.don.gesture;
    assert.equal(don(plain), 'remembrance-rest');
    assert.equal(don(loud), 'remembrance-angry');
    assert.equal(don(prefixed), 'alternate-4-point');
});

test('an unknown header gesture or lapel, or any other cue in the header, is an error on the header', () => {
    flashbackError(withFlashback('[flashback: week 4, don: moonwalk]'), 8, /Don has no “moonwalk” gesture/);
    flashbackError(withFlashback('[flashback: week 4, lapel: carnation]'), 8, /lapel is one of: poppy, or none/);
    flashbackError(withFlashback('[flashback: week 4, cam: wide]'), 8, /takes only don: and lapel:/);
    flashbackError(withFlashback('[flashback: week 4, ron: stare]'), 8, /takes only don: and lapel:/);
    assert.deepEqual(errors(withFlashback('[flashback: week 4, don: remembrance-rest, lapel: none]')), []);
    assert.deepEqual(errors(withFlashback('[flashback: week 4, lapel: Poppy]')), []);
});

test('the header lapel is worn for the flashback, lapel: none drops the episode’s, and leaving it out keeps it', () => {
    const poppyWeek = `---\ntitle: Test\nseason: 2027\nweek: 6\nlapel: poppy\n---\n`;
    const lapels = (header: string, front: string) => {
        const episode = episodeFrom(withFlashback(header, front));
        assert.deepEqual(episode.diagnostics, []);
        const { lines, flashbacks } = episode.timeline;
        const at = (t: number) => frameAt(episode.timeline, t).lapel;
        return [at(middle(lines[0])), at(flashbacks![0].t0), at(middle(lines[1])), at(flashbacks![0].t1 - 1), at(middle(lines[3]))];
    };
    assert.deepEqual(lapels('[flashback: week 4, lapel: poppy]', head()), [null, 'poppy', 'poppy', 'poppy', null]);
    assert.deepEqual(lapels('[flashback: week 4, lapel: none]', poppyWeek), ['poppy', null, null, null, 'poppy']);
    assert.deepEqual(lapels('[flashback: week 4]', poppyWeek), ['poppy', 'poppy', 'poppy', 'poppy', 'poppy']);
    assert.deepEqual(lapels('[flashback: week 4]', head()), [null, null, null, null, null]);
});

test('the monitor shows static for the whole flashback, ignores cuts in the copied lines, and gets its graphic back after', () => {
    const episode = episodeFrom(`${head()}>> team HH "This week"
DON: This week.

[flashback: week 4]
>> matchup HH 41.5 NPD 38
RON: Who's he going to get in a trade?
[end flashback]

RON: Back to now.`);
    assert.deepEqual(episode.diagnostics, []);
    const tl = episode.timeline;
    const [span] = tl.flashbacks!;
    const graphic = (t: number) => tl.monitor[frameAt(tl, t).monitor].value;
    assert.deepEqual(graphic(middle(tl.lines[0])), { type: 'team', team: 'HH', caption: 'This week' });
    for (const t of [span.t0, middle(tl.lines[1]), span.t1 - 1]) assert.deepEqual(graphic(t), { type: 'static' });
    assert.deepEqual(graphic(span.t1), { type: 'team', team: 'HH', caption: 'This week' });
    assert.ok(!tl.monitor.some(cut => cut.value.type === 'matchup'));
});

test('after [end flashback] both hosts’ gestures, Don’s wardrobe, the lapel and the shot are what they were before it', () => {
    const episode = episodeFrom(`---\ntitle: Test\nseason: 2027\nweek: 6\nlapel: poppy\n---\n[don: alternate-4-rest] [ron: down] [cam: don]
DON: This week.

[flashback: week 4, don: remembrance-rest, lapel: none]
[cam: close ron]
RON: Who's he going to get in a trade?

DON (remembrance-point): He's sitting right there.
[end flashback]

DON: Same suit as before.

DON (yell): Still that suit!`);
    assert.deepEqual(episode.diagnostics, []);
    const tl = episode.timeline;
    const [span] = tl.flashbacks!;
    const look = (t: number) => {
        const frame = frameAt(tl, t);
        return { don: frame.hosts.don.gesture, ron: frame.hosts.ron.gesture, shot: frame.shot, lapel: frame.lapel };
    };
    const left = look(span.t0 - 1);
    assert.deepEqual(left, { don: 'alternate-4-rest', ron: 'down', shot: 'don', lapel: 'poppy' });
    assert.deepEqual(look(middle(tl.lines[1])), { don: 'remembrance-rest', ron: 'rest', shot: 'close ron', lapel: null });
    assert.deepEqual(look(span.t1), left);
    assert.equal(look(middle(tl.lines[3])).don, 'alternate-4-rest');
    assert.equal(look(middle(tl.lines[4])).don, 'alternate-4-angry');
});

test('a reaction running into a flashback ends as it starts, and one started inside ends as it ends', () => {
    const episode = episodeFrom(`${head()}[fx: don happy]
DON: This week.

[flashback: week 4]
[fx: ron happy 12s]
RON: Who's he going to get in a trade?
[end flashback]

RON: Back to now.`);
    assert.deepEqual(episode.diagnostics, []);
    const tl = episode.timeline;
    const [span] = tl.flashbacks!;
    const reacting = (t: number) => { const { hosts } = frameAt(tl, t); return [!!hosts.don.reaction, !!hosts.ron.reaction]; };
    assert.deepEqual(reacting(span.t0 - 1), [true, false]);
    assert.deepEqual(reacting(span.t0), [false, false]);
    assert.deepEqual(reacting(span.leaving - 1), [false, true]);
    assert.deepEqual(reacting(span.leaving), [false, false]);
});

test('the opening wardrobe and the pull quote come from this week’s lines, not the flashback’s', () => {
    const episode = episodeFrom(`${head()}[flashback: week 4, don: remembrance-rest]
DON: !!THAT IS THE LONGEST SHOUT IN THE WHOLE EPISODE!!
[end flashback]

DON (alternate-4-point): !!THIS WEEK'S SHOUT!!

RON: Sure.`);
    assert.deepEqual(episode.diagnostics, []);
    assert.equal(episode.openingWardrobe, 'alternate-suit-4');
    assert.deepEqual(episode.pullQuote, { who: 'don', text: 'THIS WEEK’S SHOUT' });
});

test('with no line of Don’s outside a flashback, the opening wardrobe is normal', () => {
    const episode = episodeFrom(`${head()}[flashback: week 4]\nDON (remembrance-point): Back then.\n[end flashback]\n\nRON: Now.`);
    assert.deepEqual(episode.diagnostics, []);
    assert.equal(episode.openingWardrobe, 'normal');
});

test('a flashback rewinds on the way in and, more softly, on the way out, each over its transition', () => {
    const episode = episodeFrom(`${withFlashback('[flashback: week 4]')}\n\n[flashback: week 2]\nDON: Again.\n[end flashback]\n\nRON: Done.`);
    assert.deepEqual(episode.diagnostics, []);
    const rewinds = episode.audioCues.filter(cue => cue.id === 'flashback-entry' || cue.id === 'flashback-exit');
    const spans = episode.timeline.flashbacks!;
    assert.equal(spans.length, 2);
    assert.deepEqual(rewinds, spans.flatMap(span => [
        { t: span.t0, id: 'flashback-entry', followsShow: { duration: FLASHBACK_ENTRY_MS } },
        { t: span.leaving, id: 'flashback-exit', followsShow: { duration: FLASHBACK_EXIT_MS } },
    ]));
});

test('the monitor going to static and back at a flashback’s edges makes no TV-switch sound, but a cut cued there still does', () => {
    const episode = episodeFrom(`${head()}>> team HH "This week"
DON: This week.
>> team NPD "Just before"

[flashback: week 4]
RON: Who's he going to get in a trade?
[end flashback]
>> team HH "Just after"

RON: Back to now.

[flashback: week 2]
DON: Again.
[end flashback]

RON: Done.`);
    assert.deepEqual(episode.diagnostics, []);
    const [first, second] = episode.timeline.flashbacks!;
    const clicks = episode.audioCues.filter(cue => cue.id === 'monitor').map(cue => cue.t);
    assert.deepEqual(clicks, [first.t0, first.t1]);
    assert.ok(!clicks.includes(second.t0) && !clicks.includes(second.t1));
});

test('a script can’t cue the rewinds itself', () => {
    for (const id of ['flashback-entry', 'flashback-exit']) {
        const found = errors(`${head()}DON: Hi.\n[sfx: ${id}]\nRON: Hello.`);
        assert.ok(found.some(([at]) => at === 7), `sfx: ${id} should be an error: ${JSON.stringify(found)}`);
    }
});

test('voices inside a flashback are marked to sound like a memory, with one syllable per mouth flap as before', () => {
    const episode = episodeFrom(withFlashback('[flashback: week 4]'));
    const { timeline: tl, audioCues } = episode;
    const voices = audioCues.filter(cue => cue.voice);
    assert.equal(voices.length, tl.flaps.don.length + tl.flaps.ron.length);
    const [now, first, second, after] = tl.lines;
    const within = (line: { t0: number; t1: number }) => voices.filter(cue => cue.t >= line.t0 && cue.t < line.t1);
    for (const line of [first, second]) {
        assert.ok(within(line).length > 0);
        assert.ok(within(line).every(cue => cue.voice!.flashback === true), `line ${line.index} is muffled`);
    }
    for (const line of [now, after]) {
        assert.ok(within(line).length > 0);
        assert.ok(within(line).every(cue => !('flashback' in cue.voice!)), `line ${line.index} plays dry`);
    }
});

test('a line replayed in a flashback keeps its words, syllable timing and delivery from the first time', () => {
    const original = episodeFrom(`${head()}RON: Who's he going to get in a trade?\n\nDON (point): He's sitting right there.`);
    const replayed = episodeFrom(withFlashback('[flashback: week 4]'));
    // `variation` (pitch and vowel colour) follows each host's syllable count so far in the episode,
    // so a replay lands close to the original's pitch and vowels but not exactly on them
    const performance = (cues: typeof original.audioCues, from: number, to: number) => cues
        .filter(cue => cue.voice && cue.t >= from && cue.t < to)
        .map(({ t, voice }) => {
            const { who, delivery, duration, progress, question, wordStart, phraseEnd, cutoff, interrupting } = voice!;
            const round = (n: number) => Math.round(n * 1e6) / 1e6;
            return { t: round(t - from), who, delivery, duration: round(duration), progress: round(progress), question, wordStart, phraseEnd, cutoff, interrupting };
        });
    const [ron, don] = original.timeline.lines;
    const [, first, second] = replayed.timeline.lines;
    assert.deepEqual([first.text, second.text], [ron.text, don.text]);
    assert.deepEqual(performance(replayed.audioCues, first.t0, second.t1), performance(original.audioCues, ron.t0, don.t1));
});

test('seeking into a flashback plays its voices muffled with no rewind, then rewinds on the way out', () => {
    const { timeline: tl, audioCues } = episodeFrom(withFlashback('[flashback: week 4]'));
    const span = tl.flashbacks![0];
    for (const target of [span.t0 + FLASHBACK_ENTRY_MS / 2, middle(tl.lines[1])]) {
        const transport = createTransport(tl, audioCues);
        transport.seek(target);
        transport.play(0);
        const fired: typeof audioCues = [];
        // 16 ms frames until the exit transition is over
        for (let now = 16, out = transport.tick(now); ; now += 16, out = transport.tick(now)) {
            fired.push(...out.cues);
            if (out.time >= span.t1) break;
        }
        const ids = (until: number) => fired.filter(cue => cue.t < until).map(cue => cue.id);
        assert.ok(!ids(span.leaving).includes('flashback-entry'), `no rewind after a seek to ${target}`);
        const voices = fired.filter(cue => cue.voice && cue.t < span.leaving);
        assert.ok(voices.length > 0 && voices.every(cue => cue.voice!.flashback), 'voices play muffled');
        assert.deepEqual(fired.filter(cue => cue.id === 'flashback-exit').map(cue => cue.t), [span.leaving]);
    }
});
