import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { draftDirectory } from './local-drafts';
import { referencePacket } from './facts';
import type { LeagueConfig } from '../../../scripts/db/lib/league-config';

const cli = path.resolve('scripts/coachs-corner/production.ts');
const tsx = pathToFileURL(createRequire(path.resolve('package.json')).resolve('tsx')).href;
const config: LeagueConfig = { franchises: [
    { id: 1, eras: [{ from: 2027, name: 'Home Team', abbreviations: ['HOME'] }] },
    { id: 2, eras: [{ from: 2027, name: 'Away Team', abbreviations: ['AWAY'] }] },
], awards: [], seasons: {}, scoreOverrides: [] };
const periods = [
    { number: 1, startDate: '2026-10-12T13:00:00-04:00', endDate: '2026-10-19T18:59:59-04:00' },
    { number: 2, startDate: '2026-10-19T19:00:00-04:00', endDate: '2026-10-26T18:59:59-04:00' },
];

async function workspace(t: { after: (fn: () => Promise<void>) => void }) {
    const prefix = path.join(os.tmpdir(), 'coachs-recap-cli-');
    const root = await mkdtemp(prefix);
    t.after(async () => {
        assert.ok(path.resolve(root).startsWith(path.resolve(prefix)));
        await rm(root, { recursive: true, force: true });
    });
    await writeFile(path.join(root, 'league.json'), JSON.stringify(config));
    const dir = draftDirectory('sample', root);
    await mkdir(dir, { recursive: true });
    const facts = { ...referencePacket(config, 2027), kind: 'live', period: periods[0], phase: 'active' };
    const files = { 'facts.json': JSON.stringify(facts), 'script.txt': '---\ntitle: Test\nseason: 2027\nweek: 1\n---\n\nRON: Original script.',
        'pronunciations.json': '[]', 'brief.md': 'Original brief', 'review.md': 'Original review' };
    for (const [name, contents] of Object.entries(files)) await writeFile(path.join(dir, name), contents);
    const data = {
        getLeagueInfo: { seasonYear: 2026, teamInfo: { h: { name: 'Home Team' }, a: { name: 'Away Team' } },
            scoringPeriods: periods, matchups: periods.map(p => ({ period: p.number, matchupList: [{ away: { id: 'a' }, home: { id: 'h' } }] })) },
        getStandings: [{ teamId: 'h', rank: 1, points: '1-0', totalPointsFor: 24 }, { teamId: 'a', rank: 2, points: '0-1', totalPointsFor: 20 }],
        getTeamRosters: { period: 14, rosters: { h: { rosterItems: [] }, a: { rosterItems: [] } } }, getPlayerIds: {},
        getMatchupScores: { matchups: [{ away: { teamId: 'a', score: 20, gamesPlayed: 3 }, home: { teamId: 'h', score: 24, gamesPlayed: 4 } }] },
    };
    const run = (args: string[], now = '2026-10-26T14:00:00-04:00') => {
        const preload = `const RealDate = Date;
            globalThis.Date = class extends RealDate {
                constructor(...args) { super(...(args.length ? args : [${Date.parse(now)}])); }
                static now() { return ${Date.parse(now)}; }
            };
            const data = ${JSON.stringify(data)};
            globalThis.fetch = async input => {
                const url = new URL(String(input));
                const endpoint = url.pathname.split('/').at(-1);
                const result = data[endpoint];
                if (!result) throw new Error('Unexpected source request: ' + url.href);
                return Response.json(endpoint === 'getMatchupScores' ? { ...result, period: Number(url.searchParams.get('period')) } : result);
            };`;
        return spawnSync(process.execPath, ['--import', tsx, '--import', `data:text/javascript,${encodeURIComponent(preload)}`, cli, ...args], {
            cwd: root, encoding: 'utf8', timeout: 15_000, env: { ...process.env, YOFHL_LEAGUE_CONFIG: path.join(root, 'league.json') },
        });
    };
    return { root, dir, files, run };
}

test('live prepare creates a recap draft for the previous week before the Monday API rollover', async t => {
    const { root, run } = await workspace(t);
    const editorial = path.join(root, 'assets/coachs-corner/editorial');
    await mkdir(editorial, { recursive: true });
    await writeFile(path.join(editorial, 'continuity.json'), '{"pronunciations":[]}');
    const result = run(['prepare', '--slug', 'recap-draft', '--recap']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const dir = draftDirectory('recap-draft', root);
    const facts = JSON.parse(await readFile(path.join(dir, 'facts.json'), 'utf8'));
    assert.equal(facts.period.number, 2);
    assert.equal(facts.phase, 'active');
    assert.match(await readFile(path.join(dir, 'script.txt'), 'utf8'), /week: 2/);
    assert.match(result.stdout, /Recap covers 2026-10-19 through 2026-10-25/);
});

test('CLI rejects recap conflicts, including stale empty explicit flags, before touching an existing draft', async t => {
    const { dir, files, run } = await workspace(t);
    for (const args of [['prepare', '--period', '1'], ['prepare', '--period='], ['prepare', '--pilot'],
        ['prepare', '--from='], ['stats'], ['check'], ['facts']]) {
        const result = run([...args, '--slug', 'sample', '--recap']);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, /--recap|facts --refresh/);
    }
    assert.deepEqual((await readdir(dir)).sort(), Object.keys(files).sort());
    for (const [name, contents] of Object.entries(files)) assert.equal(await readFile(path.join(dir, name), 'utf8'), contents);
});

test('Sunday CLI prepare uses the supplied Monday air date while keeping the true snapshot time', async t => {
    const { root, run } = await workspace(t);
    const editorial = path.join(root, 'assets/coachs-corner/editorial');
    await mkdir(editorial, { recursive: true });
    await writeFile(path.join(editorial, 'continuity.json'), '{"pronunciations":[]}');
    const result = run(['prepare', '--slug', 'monday-air', '--recap', '--air-date', '2026-10-19'], '2026-10-18T23:00:00-04:00');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const dir = draftDirectory('monday-air', root);
    const facts = JSON.parse(await readFile(path.join(dir, 'facts.json'), 'utf8'));
    assert.equal(facts.period.number, 1);
    assert.equal(facts.capturedAt, '2026-10-19T03:00:00.000Z');
    assert.equal(facts.phase, 'active');
    assert.match(await readFile(path.join(dir, 'script.txt'), 'utf8'), /date: 2026-10-19/);
});

test('failed recap refresh leaves the previous snapshot and script intact without a backup or partial file', async t => {
    const { dir, files, run } = await workspace(t);
    const result = run(['facts', '--slug', 'sample', '--refresh', '--recap'], '2026-10-18T14:00:00-04:00');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Cannot identify one weekly scoring period.*Use --period/);
    assert.deepEqual((await readdir(dir)).sort(), Object.keys(files).sort());
    for (const [name, contents] of Object.entries(files)) assert.equal(await readFile(path.join(dir, name), 'utf8'), contents);
});

test('ordinary refresh keeps its period, while recap refresh reselects the previous week and backs up the snapshot', async t => {
    const { dir, files, run } = await workspace(t);
    const ordinary = run(['facts', '--slug', 'sample', '--refresh']);
    assert.equal(ordinary.status, 0, ordinary.stdout + ordinary.stderr);
    const previous = await readFile(path.join(dir, 'facts.json'), 'utf8');
    assert.equal(JSON.parse(previous).period.number, 1);
    const recap = run(['facts', '--slug', 'sample', '--refresh', '--recap'], '2026-10-26T14:01:00-04:00');
    assert.equal(recap.status, 0, recap.stdout + recap.stderr);
    assert.match(recap.stdout, /Recap covers 2026-10-19 through 2026-10-25/);
    const refreshed = JSON.parse(await readFile(path.join(dir, 'facts.json'), 'utf8'));
    assert.equal(refreshed.period.number, 2);
    assert.equal(refreshed.phase, 'active');
    const backups = (await readdir(dir)).filter(name => /^facts-\d+\.json$/.test(name));
    assert.equal(backups.length, 2);
    assert.ok((await Promise.all(backups.map(name => readFile(path.join(dir, name), 'utf8')))).includes(previous));
    assert.equal(await readFile(path.join(dir, 'script.txt'), 'utf8'), files['script.txt']);
});
