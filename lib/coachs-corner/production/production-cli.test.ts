import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { draftDirectory } from './local-drafts';
import { referencePacket } from './facts';
import type { StudioTeam } from '../teams';
import type { LeagueConfig } from '../../../scripts/db/lib/league-config';

const cli = path.resolve('scripts/coachs-corner/production.ts');
const tsx = pathToFileURL(createRequire(path.resolve('package.json')).resolve('tsx')).href;
const config: LeagueConfig = { franchises: [
    { id: 1, eras: [{ from: 2027, name: 'Home Team', abbreviations: ['HOME'] }] },
    { id: 2, eras: [{ from: 2027, name: 'Away Team', abbreviations: ['AWAY'] }] },
], awards: [], seasons: { 2027: { fantrax: { league: 'liveleague', teams: { h: 1, a: 2 } } } }, scoreOverrides: [] };
// league.yml's identity; the database's current identity has Home renamed by its owner
const yamlTeams: StudioTeam[] = [
    { id: 1, name: 'Home Team', abbreviation: 'HOME', owner: null, ownerFirst: null, logo: null, primary: '#26365F', secondary: '#C8102E' },
    { id: 2, name: 'Away Team', abbreviation: 'AWAY', owner: null, ownerFirst: null, logo: null, primary: '#26365F', secondary: '#C8102E' },
];
const periods = [
    { number: 1, startDate: '2026-10-12T13:00:00-04:00', endDate: '2026-10-19T18:59:59-04:00' },
    { number: 2, startDate: '2026-10-19T19:00:00-04:00', endDate: '2026-10-26T18:59:59-04:00' },
];

// The CLI reads the studio team list through the site's Neon driver. Its requests reach this in-memory
// Postgres through a local bridge, the same way the publishing verification does.
const pg = new PGlite();
let bridge: Server;
let parsers: Record<number, (value: string) => string>;
before(async () => {
    await migrate(drizzle(pg), { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
    await pg.exec(`insert into league.seasons values (2026, '2025–26', 'complete');
        insert into league.owners (id, name) values (1, 'Hank Holder'), (2, 'Alice Away');
        insert into league.franchises (id, display_name, first_season) values (1, 'Home Team', 2026), (2, 'Away Team', 2026);
        insert into league.team_seasons (id, season_year, franchise_id, owner_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against)
        values (1, 2026, 1, 1, 'Home Team', 'Home Team', 'HOME', 1, 1, 1, 0, 0, 24, 20), (2, 2026, 2, 2, 'Away Team', 'Away Team', 'AWAY', 1, 2, 0, 1, 0, 20, 24);
        insert into league.team_management (franchise_id, name, logo_url) values (1, 'Home Renamed', '/team-logos/1/new.webp');`);
    // Neon expects raw text results and applies its own parsers
    parsers = Object.fromEntries((await pg.query<{ oid: number }>('select oid from pg_type')).rows.map(({ oid }) => [oid, (value: string) => value]));
    bridge = createServer(async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        try {
            const { query, params = [] } = JSON.parse(Buffer.concat(chunks).toString());
            res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(await pg.query(query, params, { rowMode: 'array', parsers })));
        } catch (error) {
            res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ message: (error as Error).message, code: 'XX000' }));
        }
    });
    bridge.listen(0, '127.0.0.1');
    await once(bridge, 'listening');
});
after(async () => {
    bridge.close();
    await pg.close();
});
const studioNames = (facts: { teams: StudioTeam[] }) => facts.teams.map(team => [team.id, team.name, team.abbreviation, team.owner, team.logo]);
const databaseTeams = [[1, 'Home Renamed', 'HOME', 'Hank Holder', '/team-logos/1/new.webp'], [2, 'Away Team', 'AWAY', 'Alice Away', null]];

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
    const facts = { ...referencePacket(config, 2027, yamlTeams), kind: 'live', period: periods[0], phase: 'active' };
    const files = { 'facts.json': JSON.stringify(facts), 'script.txt': '---\ntitle: Test\nseason: 2027\nweek: 1\n---\n\nRON: Original script.',
        'pronunciations.json': '[]', 'brief.md': 'Original brief', 'review.md': 'Original review' };
    for (const [name, contents] of Object.entries(files)) await writeFile(path.join(dir, name), contents);
    const data = {
        getLeagueInfo: { seasonYear: 2026, teamInfo: { h: { name: 'Home Team' }, a: { name: 'Away Team' } },
            scoringPeriods: periods, matchups: periods.map(p => ({ period: p.number, matchupList: [{ away: { id: 'a' }, home: { id: 'h' } }] })) },
        getStandings: [{ teamId: 'h', rank: 1, points: '1-0', totalPointsFor: 24 }, { teamId: 'a', rank: 2, points: '0-1', totalPointsFor: 20 }],
        getTeamRosters: { period: 14, rosters: { h: { rosterItems: [] }, a: { rosterItems: [] } } }, getPlayerIds: { p1: { name: 'Player, Test', position: 'C' } },
        getMatchupScores: { matchups: [{ away: { teamId: 'a', score: 20, gamesPlayed: 3 }, home: { teamId: 'h', score: 24, gamesPlayed: 4 } }] },
    };
    const run = async (args: string[], now = '2026-10-26T14:00:00-04:00') => {
        const preload = `const RealDate = Date;
            globalThis.Date = class extends RealDate {
                constructor(...args) { super(...(args.length ? args : [${Date.parse(now)}])); }
                static now() { return ${Date.parse(now)}; }
            };
            const data = ${JSON.stringify(data)};
            const realFetch = globalThis.fetch;
            globalThis.fetch = async (input, init) => {
                const url = new URL(String(input));
                if (url.href === 'https://localhost/sql') return realFetch('http://127.0.0.1:${(bridge.address() as { port: number }).port}/sql', { method: 'POST', headers: init.headers, body: init.body });
                const endpoint = url.pathname.split('/').at(-1);
                const result = data[endpoint];
                if (!result) throw new Error('Unexpected source request: ' + url.href);
                return Response.json(endpoint === 'getMatchupScores' ? { ...result, period: Number(url.searchParams.get('period')) } : result);
            };`;
        const child = spawn(process.execPath, ['--import', tsx, '--import', `data:text/javascript,${encodeURIComponent(preload)}`, cli, ...args], {
            cwd: root, env: { ...process.env, YOFHL_LEAGUE_CONFIG: path.join(root, 'league.json'), DATABASE_URL_V2: 'postgresql://test:test@localhost/test', TSX_TSCONFIG_PATH: path.resolve('tsconfig.json') },
        });
        let stdout = '', stderr = '';
        child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
        child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
        const timer = setTimeout(() => child.kill(), 15_000);
        const [status] = await once(child, 'close') as [number | null];
        clearTimeout(timer);
        return { status, stdout, stderr };
    };
    return { root, dir, files, run };
}

test('live prepare creates a recap draft for the previous week before the Monday API rollover', async t => {
    const { root, run } = await workspace(t);
    const editorial = path.join(root, 'assets/coachs-corner/editorial');
    await mkdir(editorial, { recursive: true });
    await writeFile(path.join(editorial, 'continuity.json'), '{"pronunciations":[]}');
    const result = await run(['prepare', '--slug', 'recap-draft', '--recap']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const dir = draftDirectory('recap-draft', root);
    const facts = JSON.parse(await readFile(path.join(dir, 'facts.json'), 'utf8'));
    assert.equal(facts.period.number, 2);
    assert.equal(facts.phase, 'active');
    assert.match(await readFile(path.join(dir, 'script.txt'), 'utf8'), /week: 2/);
    assert.match(result.stdout, /Recap covers 2026-10-19 through 2026-10-25/);
    assert.deepEqual(studioNames(facts), databaseTeams, "the database's current identity, not league.yml's");
    assert.deepEqual(facts.teams.map((team: { fantraxId: string; rank: number }) => [team.fantraxId, team.rank]), [['h', 1], ['a', 2]]);
});

test('facts --refresh, stats and --pilot write the database team list; --from keeps the reused packet\'s', async t => {
    const { root, dir, run } = await workspace(t);
    const editorial = path.join(root, 'assets/coachs-corner/editorial');
    await mkdir(editorial, { recursive: true });
    await writeFile(path.join(editorial, 'continuity.json'), '{"pronunciations":[]}');
    const facts = async (slug = 'sample') => JSON.parse(await readFile(path.join(draftDirectory(slug, root), 'facts.json'), 'utf8'));
    assert.deepEqual(studioNames(await facts()), yamlTeams.map(team => [team.id, team.name, team.abbreviation, team.owner, team.logo]));

    const refreshed = await run(['facts', '--slug', 'sample', '--refresh']);
    assert.equal(refreshed.status, 0, refreshed.stdout + refreshed.stderr);
    assert.deepEqual(studioNames(await facts()), databaseTeams);

    // the owner renames again before handoff; stats picks it up and keeps the live observations
    await pg.exec(`update league.team_management set name = 'Home Again' where franchise_id = 1`);
    t.after(() => pg.exec(`update league.team_management set name = 'Home Renamed' where franchise_id = 1`));
    const before = await facts();
    const stats = await run(['stats', '--slug', 'sample']);
    assert.equal(stats.status, 0, stats.stdout + stats.stderr);
    const after = await facts();
    assert.equal(after.teams[0].name, 'Home Again');
    assert.deepEqual({ ...after, teams: before.teams, limitations: before.limitations }, before, 'only the team list changes');
    assert.deepEqual(after.teams.map((team: { fantraxId: string }) => team.fantraxId), ['h', 'a']);

    const pilot = await run(['prepare', '--slug', 'pilot-draft', '--pilot']);
    assert.equal(pilot.status, 0, pilot.stdout + pilot.stderr);
    assert.deepEqual(studioNames(await facts('pilot-draft')).map(row => row[1]), ['Home Again', 'Away Team']);

    const reused = await run(['prepare', '--slug', 'reused', '--from', path.join(dir, 'facts.json')]);
    assert.equal(reused.status, 0, reused.stdout + reused.stderr);
    await pg.exec(`update league.team_management set name = 'Home Third' where franchise_id = 1`);
    assert.deepEqual((await facts('reused')).teams, after.teams, 'the reused snapshot keeps all of its teams');
});

test('a franchise Fantrax maps that the database no longer lists fails the capture and leaves facts.json alone', async t => {
    const { dir, files, run } = await workspace(t);
    await pg.exec('update league.franchises set folded_after_season = 2026 where id = 1');
    t.after(() => pg.exec('update league.franchises set folded_after_season = null where id = 1'));
    const result = await run(['facts', '--slug', 'sample', '--refresh']);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Fantrax team "Home Team" \(h\) is franchise 1, which isn't an active franchise in the database's current teams/);
    assert.deepEqual((await readdir(dir)).sort(), Object.keys(files).sort());
    for (const [name, contents] of Object.entries(files)) assert.equal(await readFile(path.join(dir, name), 'utf8'), contents);
});

test('CLI rejects recap conflicts, including stale empty explicit flags, before touching an existing draft', async t => {
    const { dir, files, run } = await workspace(t);
    for (const args of [['prepare', '--period', '1'], ['prepare', '--period='], ['prepare', '--pilot'],
        ['prepare', '--from='], ['stats'], ['check'], ['facts']]) {
        const result = await run([...args, '--slug', 'sample', '--recap']);
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
    const result = await run(['prepare', '--slug', 'monday-air', '--recap', '--air-date', '2026-10-19'], '2026-10-18T23:00:00-04:00');
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
    const result = await run(['facts', '--slug', 'sample', '--refresh', '--recap'], '2026-10-18T14:00:00-04:00');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Cannot identify one weekly scoring period.*Use --period/);
    assert.deepEqual((await readdir(dir)).sort(), Object.keys(files).sort());
    for (const [name, contents] of Object.entries(files)) assert.equal(await readFile(path.join(dir, name), 'utf8'), contents);
});

test('ordinary refresh keeps its period, while recap refresh reselects the previous week and backs up the snapshot', async t => {
    const { dir, files, run } = await workspace(t);
    const ordinary = await run(['facts', '--slug', 'sample', '--refresh']);
    assert.equal(ordinary.status, 0, ordinary.stdout + ordinary.stderr);
    const previous = await readFile(path.join(dir, 'facts.json'), 'utf8');
    assert.equal(JSON.parse(previous).period.number, 1);
    const recap = await run(['facts', '--slug', 'sample', '--refresh', '--recap'], '2026-10-26T14:01:00-04:00');
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
