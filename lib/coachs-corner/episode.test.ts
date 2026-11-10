import assert from 'node:assert/strict';
import test from 'node:test';
import { episodeFrom } from './episode';
import { PILOT_SCRIPT, PILOT_SLUG } from './pilot';

const head = '---\ntitle: Test\nseason: 2027\nweek: 3\ndate: 2026-10-22\n---\n';

test('the summary holds what the script determines', () => {
    const { summary } = episodeFrom(`${head}>> player "Tom Wilson"\nDON: Welcome to the show.\n\nRON: Good evening.`);
    assert.equal(summary.title, 'Test');
    assert.equal(summary.season, 2027);
    assert.equal(summary.week, 3);
    assert.equal(summary.date, '2026-10-22');
    assert.deepEqual(summary.players, [{ name: 'Tom Wilson' }]);
    assert.equal(episodeFrom('DON: No front matter.').summary.title, 'Untitled episode');
    assert.equal(episodeFrom('DON: No front matter.').summary.season, null);
});

test('the stats season is the season before the episode unless the script names an earlier one', () => {
    assert.equal(episodeFrom(`${head}DON: Hi.`).statsSeason, 2026);
    assert.equal(episodeFrom(head.replace('season: 2027', 'season: 2027\nstats: 2024') + 'DON: Hi.').statsSeason, 2024);
    assert.equal(episodeFrom('DON: No front matter.').statsSeason, null);
});

test('runtime includes the six-second intro and segment does not, both in whole milliseconds', () => {
    const { summary, timeline, hasErrors } = episodeFrom(PILOT_SCRIPT);
    assert.equal(hasErrors, false);
    assert.equal(timeline.lines.length, 73);
    assert.ok(Number.isInteger(summary.runtime) && Number.isInteger(summary.segment));
    assert.equal(summary.runtime - summary.segment, 6000);
    // the player's clock and scrub bar span show time up to the end of the last line
    assert.equal(summary.runtime, Math.round(timeline.showEnd));
    assert.ok(timeline.showEnd >= timeline.lines.at(-1)!.t1);
    const minutes = summary.segment / 60000;
    assert.ok(minutes > 3 && minutes < 5, `segment ${minutes.toFixed(2)} min`);
});

test('the label is "Pilot" for the pilot slug, otherwise the script week, otherwise none', () => {
    assert.equal(episodeFrom(PILOT_SCRIPT, { slug: PILOT_SLUG }).label, 'Pilot');
    assert.equal(episodeFrom(PILOT_SCRIPT).label, 'Week 1');
    assert.equal(episodeFrom(`${head}DON: Hi.`, { slug: '2027-week-3-test' }).label, 'Week 3');
    assert.equal(episodeFrom('---\ntitle: Special\n---\nDON: Hi.', { slug: 'special' }).label, null);
});

test('the opening picture is the set as the segment begins, set by cues before the first line or reaction', () => {
    const plain = episodeFrom('[don: stare, ron: down]\n>> logo\nDON: Hi.');
    assert.equal(plain.openingPicture.hosts.don.gesture, 'stare');
    assert.equal(plain.openingPicture.hosts.ron.gesture, 'down');
    assert.equal(plain.timeline.monitor[plain.openingPicture.monitor].value.type, 'logo');
    assert.equal(plain.openingPicture.phase, 'intro');
    assert.equal(plain.openingPicture.line, -1);
    // a reaction ahead of the first line is played, so poses after it aren't part of the opening picture
    const reacting = episodeFrom('[don: stare]\n[fx: don happy 2s, 1s]\n[don: point]\nDON: Hi.');
    assert.equal(reacting.openingPicture.hosts.don.gesture, 'stare');
    assert.equal(reacting.openingPicture.hosts.don.reaction, null);
});

test('the pull quote prefers the longest all-caps yell, then any yell, then a short first line; player refs come from graphics come from the same script', () => {
    const episode = episodeFrom(PILOT_SCRIPT);
    assert.deepEqual(episode.pullQuote, { who: 'don', text: 'I KNOW IT’S A KEEPER LEAGUE, RON.' });
    assert.deepEqual(episode.playerRefs, [{ name: 'Tom Wilson' }, { name: 'William Nylander' }, { name: 'Nico Hischier' }]);
    assert.deepEqual(episodeFrom(`${head}RON: Morning.\n\nDON: !!Well, get going then!!\n`).pullQuote, { who: 'don', text: 'Well, get going then' });
    assert.deepEqual(episodeFrom(`${head}RON: The draft was Saturday, Don.\n`).pullQuote, { who: 'ron', text: 'The draft was Saturday, Don.' });
});

test('audio cues follow the timeline: one voice cue per mouth flap, plus the scripted sound', () => {
    const { audioCues, timeline } = episodeFrom(`${head}RON (deadpan): You did.\n[don: pound-ready, 220ms]\n[don: pound, sfx: desk-pound, 480ms]\nDON (point): I looked at the rest!`);
    for (const who of ['don', 'ron'] as const) assert.equal(audioCues.filter(cue => cue.id === who).length, timeline.flaps[who].length);
    assert.equal(audioCues.filter(cue => cue.id === 'desk-pound').length, 1);
    assert.deepEqual(audioCues.map(cue => cue.t), [...audioCues.map(cue => cue.t)].sort((a, b) => a - b));
});

test('team cues are errors only when a team list is passed, and never change the episode', () => {
    const source = `${head}>> matchup HH 41.5 NOPE 38
RON: Hi.`;
    const teams = [{ id: 3, name: 'Hooterville Honkers', abbreviation: 'HH', owner: 'Jeremy Smith', ownerFirst: 'Jeremy', logo: null, primary: '#000000', secondary: '#FFFFFF' }];
    const unchecked = episodeFrom(source);
    const checked = episodeFrom(source, { teams });
    assert.deepEqual(unchecked.diagnostics, []);
    assert.equal(unchecked.hasErrors, false);
    assert.deepEqual(unchecked.teamRefs.map(r => r.ref), ['HH', 'NOPE']);
    assert.deepEqual(checked.diagnostics.map(d => [d.line, d.severity]), [[unchecked.teamRefs[1].line, 'error']]);
    assert.match(checked.diagnostics[0].message, /No team matches “NOPE”/);
    assert.equal(checked.hasErrors, true);
    assert.deepEqual({ ...checked, diagnostics: [], hasErrors: false }, { ...unchecked, diagnostics: [], hasErrors: false });
});

test('errors come through the diagnostics', () => {
    const episode = episodeFrom('DON: No title.');
    assert.equal(episode.hasErrors, true);
    assert.ok(episode.diagnostics.some(d => d.severity === 'error' && /title/.test(d.message)));
});

test('the episode is plain data that survives a server-to-client handoff', () => {
    const episode = episodeFrom(PILOT_SCRIPT, { slug: PILOT_SLUG });
    assert.deepEqual(structuredClone(episode), episode);
    assert.deepEqual(JSON.parse(JSON.stringify(episode.summary)), episode.summary);
});
