import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkDraft, draftDirectory, listLocalDrafts, loadLocalDraft, localPreviewAllowed, readDraftFile, validSlug, type LocalDraft } from './local-drafts';
import { referencePacket, type FeaturedPlayer } from './facts';
import { loadLeagueConfig } from '../../../scripts/db/lib/league-config';

const reference = () => referencePacket(loadLeagueConfig(), 2027);
const player = (name: string, bornInNorthAmerica: boolean): FeaturedPlayer => ({ name, bornInNorthAmerica,
    birthCountry: bornInNorthAmerica ? 'CAN' : 'CHE', birthCity: null, nhlId: 1,
    source: { url: 'https://api-web.nhle.com/v1/player/1/landing', fetchedAt: '2026-10-17T12:00:00Z' },
    headshot: null, nhlTeam: null, positions: [], season: null, fpts: null, fpg: null, games: null });
const draft = (dialogue: string): LocalDraft => ({ slug: 'test', script: `---\ntitle: Test\nseason: 2027\nweek: 1\n---\n\n${dialogue}`,
    facts: reference(), pronunciations: [], brief: '', review: '', revision: '' });

test('local previews require development and a loopback host; paths exclude traversal and Windows devices', () => {
    assert.equal(localPreviewAllowed('development', 'localhost:3000'), true);
    assert.equal(localPreviewAllowed('development', '[::1]:3000'), true);
    assert.equal(localPreviewAllowed('production', 'localhost:3000'), false);
    assert.equal(localPreviewAllowed('development', 'localhost:3000', true), false);
    for (const host of ['localhost.attacker.test', '192.168.1.1:3000', 'example.com', null]) assert.equal(localPreviewAllowed('development', host), false);
    for (const slug of ['../secret', '..\\secret', 'C:\\data', 'a/b', '.', 'CON', 'nul', 'com1', '%2e%2e']) {
        assert.equal(validSlug(slug), false);
        assert.throws(() => draftDirectory(slug));
    }
    assert.equal(validSlug('2026-10-24-week-2'), true);
});

test('correct non-North-American surnames are rejected only in Don dialogue', async () => {
    const episode = draft('DON: Hischier was there.\n\nRON: Nico Hischier.');
    episode.facts.players = [player('Nico Hischier', false)];
    episode.pronunciations = [{ name: 'Nico Hischier', donName: 'Hishner' }];
    const wrong = await checkDraft(episode);
    assert.equal(wrong.diagnostics.filter(d => d.severity === 'error').length, 1);
    assert.match(wrong.diagnostics[0].message, /correct surname/);
    episode.script = episode.script.replace('DON: Hischier', 'DON: Hishner');
    assert.deepEqual((await checkDraft(episode)).diagnostics.filter(d => d.severity === 'error'), []);
    episode.pronunciations[0].donName = '';
    assert.ok((await checkDraft(episode)).diagnostics.some(d => /Choose Don/.test(d.message)));
});

test('North American players can retain canonical names and missing birthplace stays explicit', async () => {
    const episode = draft('DON: Nylander. Wilson.');
    episode.facts.players = [player('William Nylander', true)];
    episode.pronunciations = [{ name: 'William Nylander', donName: 'Noodles' }, { name: 'Tom Wilson', donName: 'Wilson' }];
    const result = await checkDraft(episode);
    assert.deepEqual(result.diagnostics.filter(d => d.severity === 'error'), []);
    assert.ok(result.diagnostics.some(d => /Unverified birthplace: Tom Wilson/.test(d.message)));
});

test('script period mismatches and unsupported cues remain errors', async () => {
    const episode = draft('DON: Hi. [sfx: invented-effect]');
    episode.facts.kind = 'live';
    episode.facts.period = { number: 2, startDate: '2026-10-20T00:00:00Z', endDate: '2026-10-26T00:00:00Z' };
    const errors = (await checkDraft(episode)).diagnostics.filter(d => d.severity === 'error');
    assert.ok(errors.some(d => /week must match/.test(d.message)));
    assert.ok(errors.some(d => /isn’t a sound/.test(d.message)));
});

test('gap graphics reject mixed seasons in stage and inline cues; missing stats give the capture command', async () => {
    for (const cue of ['>> gap "Tom Wilson" "William Nylander"', 'RON: The gap. [>> gap "Tom Wilson" "William Nylander"]']) {
        const episode = draft(`${cue}\n\nRON: Last year's fantasy points.`);
        episode.facts.players = [
            { ...player('Tom Wilson', true), season: 2026, fpts: 372, fpg: 5.17 },
            { ...player('William Nylander', true), season: 2025, fpts: 378.25, fpg: 5.82 },
        ];
        assert.ok((await checkDraft(episode)).diagnostics.some(d => d.severity === 'error' && /same archived season/.test(d.message)));
        episode.facts.players[1].season = 2026;
        assert.deepEqual((await checkDraft(episode)).diagnostics, []);
        episode.facts.players[1].fpts = null;
        assert.ok((await checkDraft(episode)).diagnostics.some(d => /coachs:stats/.test(d.message)));
    }
});

test('file loader reloads edits, reports missing artwork, and rejects symlink escapes', async t => {
    const prefix = path.join(os.tmpdir(), 'coachs-production-');
    const root = await mkdtemp(prefix);
    t.after(async () => {
        assert.ok(path.resolve(root).startsWith(path.resolve(prefix)));
        await rm(root, { recursive: true, force: true });
    });
    const dir = draftDirectory('sample', root);
    await mkdir(dir, { recursive: true });
    for (const [file, content] of Object.entries({ 'script.txt': draft('RON: First.').script,
        'facts.json': JSON.stringify(reference()), 'pronunciations.json': '[]', 'brief.md': 'Brief', 'review.md': 'Review' })) await writeFile(path.join(dir, file), content);
    const first = await loadLocalDraft('sample', root);
    assert.match(first.script, /First/);
    await writeFile(path.join(dir, 'script.txt'), draft('RON: Revised.').script);
    const second = await loadLocalDraft('sample', root);
    assert.notEqual(second.revision, first.revision);
    assert.match(second.script, /Revised/);
    assert.deepEqual(await listLocalDrafts(root), ['sample']);
    assert.ok((await checkDraft(second, root)).diagnostics.some(d => /Missing asset/.test(d.message)));
    await assert.rejects(readDraftFile('sample', '../../secret', root), /Unsupported draft file/);
    const outside = path.join(root, 'outside');
    await mkdir(outside);
    await writeFile(path.join(outside, 'script.txt'), 'private');
    await symlink(outside, draftDirectory('escape', root), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(readDraftFile('escape', 'script.txt', root), /escapes/);
});
