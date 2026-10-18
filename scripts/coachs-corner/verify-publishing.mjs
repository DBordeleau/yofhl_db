// Production-mode integration test. All SQL goes to an in-memory local Postgres
// bridge, and only a disposable copy is built. No .env files or deployments.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { AVIF_OPTIONS, generateAssets } from './assets.mjs';

const root = process.cwd();
// Pick a free port so an existing browser review cannot receive these test writes.
const portReservation = createServer();
portReservation.listen(Number(process.env.COACHS_TEST_PORT || 0), '127.0.0.1');
await once(portReservation, 'listening');
const port = portReservation.address().port;
await new Promise(resolve => portReservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const scratchParent = path.join(root, '.cache');
await mkdir(scratchParent, { recursive: true });
const scratch = await mkdtemp(path.join(scratchParent, 'coachs-corner-verify-'));
const pg = new PGlite();
let next;
let sqlQueries = 0;
let failQueries = false;
const log = createWriteStream(path.join(scratch, 'verification.log'));
const bridge = createServer(async (req, res) => {
    try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const payload = JSON.parse(Buffer.concat(chunks).toString());
        const execute = async ({ query, params = [] }) => {
            sqlQueries++;
            if (failQueries) throw new Error('simulated temporary database outage');
            return pg.query(query, params, { rowMode: 'array', parsers });
        };
        const result = payload.queries
            ? { results: await Promise.all(payload.queries.map(execute)) }
            : await execute(payload);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
    } catch (error) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: error.message, code: error.code || 'XX000' }));
    }
});
let parsers;
const env = { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    DATABASE_URL: 'postgresql://test:test@localhost/test', DATABASE_URL_V2: 'postgresql://test:test@localhost/test',
    ADMIN_USERNAME: 'local-review', ADMIN_PASSWORD: 'local-review-only', ADMIN_SESSION_SECRET: 'local-review-only' };
const launch = (args) => {
    const child = spawn(process.execPath, args, { cwd: scratch, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    return child;
};
const screenplay = title => `---\ntitle: ${title}\nseason: 2027\nweek: 2\n---\nDON: Welcome to the show.\n\nRON: Good evening.`;
const results = [];
async function check(label, fn) { await fn(); results.push(label); console.log(`PASS ${label}`); }
try {
    await migrate(drizzle(pg), { migrationsFolder: path.join(root, 'db/migrations'), migrationsSchema: 'league' });
    // Neon expects raw text results and applies its own parsers. Match that wire
    // format for every PostgreSQL type (including JSON, arrays and timestamps).
    parsers = Object.fromEntries((await pg.query('select oid from pg_type')).rows.map(({ oid }) => [oid, value => value]));
    bridge.listen(0, '127.0.0.1');
    await once(bridge, 'listening');
    await generateAssets(root);
    for (const dir of ['app', 'components', 'db', 'league', 'lib', 'scripts']) await cp(path.join(root, dir), path.join(scratch, dir), { recursive: true });
    for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.ts', 'postcss.config.mjs', 'tailwind.config.ts', '.eslintrc.json']) {
        await cp(path.join(root, file), path.join(scratch, file));
    }
    for (const dir of ['node_modules', 'public']) await symlink(path.join(root, dir), path.join(scratch, dir), process.platform === 'win32' ? 'junction' : 'dir');
    const driver = path.join(scratch, 'lib/data/db.ts');
    await writeFile(driver, (await readFile(driver, 'utf8')).replace("import { neon }", "import { neon, neonConfig }")
        .replace('let db:', `neonConfig.fetchEndpoint = () => 'http://127.0.0.1:${bridge.address().port}/sql';\n\nlet db:`));
    if (process.argv.includes('--art-review')) {
        // Browser fixtures exist ONLY in this disposable build. They never become
        // application routes or change the real asset manifest.
        const mediaPath = path.join(scratch, 'lib/coachs-corner/media.json');
        const media = JSON.parse(await readFile(mediaPath, 'utf8'));
        for (const suffix of ['', '-640']) {
            media[`/coachs-corner/robots-v2/qa-broken${suffix}.webp`] = media[`/coachs-corner/robots-v2/don-default${suffix}.webp`];
            media[`/coachs-corner/robots-v2/qa-broken${suffix}.avif`] = '/deliberately-missing-qa-image.avif';
        }
        await writeFile(mediaPath, JSON.stringify(media));
        const reviewDir = path.join(scratch, 'app/art-review');
        await mkdir(reviewDir, { recursive: true });
        await writeFile(path.join(reviewDir, 'page.tsx'), `
'use client';
import { useEffect, useState } from 'react';
import Artwork, { HostArtwork } from '@/components/coachs-corner/artwork';
import { allArt, artFor, type CharacterId } from '@/lib/coachs-corner/cast';
import styles from '@/components/coachs-corner/coachs-corner.module.css';
import { artUrl } from '@/lib/coachs-corner/media';
import manifest from '@/lib/coachs-corner/media.json';
const poses = Object.keys(manifest).filter(s => s.endsWith('.webp') && !s.endsWith('-640.webp') && !s.includes('qa-broken')).map(s => s.split('/').pop()!.replace('.webp', ''));
export default function ArtReview() {
    const [pose, setPose] = useState('don-default');
    const [mode, setMode] = useState('split');
    const [zoom, setZoom] = useState('fit');
    const [light, setLight] = useState(false);
    const [broken, setBroken] = useState(false);
    const [pair, setPair] = useState('don/rest');
    const [talking, setTalking] = useState(false);
    const [animate, setAnimate] = useState(false);
    const [avif, setAvif] = useState(true);
    const [who, gesture] = pair.split('/') as [CharacterId, string];
    useEffect(() => { if (!animate) return; const timer=setInterval(()=>setTalking(t=>!t),180); return ()=>clearInterval(timer); },[animate]);
    return <main id="review" style={{background:light?'#f7f7f7':'#070b18',color:light?'#111':'white',height:'100vh',overflow:'auto',padding:16}}>
        <h1>Local AVIF quality and fallback review</h1>
        <div style={{display:'flex',gap:16,padding:'12px 0',flexWrap:'wrap'}}>
            <label>Pose <select aria-label="Pose" style={{color:'black'}} value={pose} onChange={e=>setPose(e.target.value)}>{poses.map(p=><option key={p}>{p}</option>)}</select></label>
            <label>View <select aria-label="View" style={{color:'black'}} value={mode} onChange={e=>setMode(e.target.value)}><option value="split">Side by side</option><option value="webp">Original WebP</option><option value="avif">AVIF</option><option value="fallback">Fallback component</option><option value="motion">Mouth motion</option></select></label>
            <label>Zoom <select aria-label="Zoom" style={{color:'black'}} value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">Fit</option><option value="native">Native pixels</option><option value="double">200%</option></select></label>
            <button onClick={()=>setLight(!light)}>Toggle background</button>
            <button onClick={()=>document.getElementById('review')!.requestFullscreen()}>Full screen review</button>
            <button onClick={()=>document.exitFullscreen()}>Exit fullscreen</button>
        </div>
        {mode==='motion' ? <>
            <label>Mouth pair <select aria-label="Mouth pair" style={{color:'black'}} value={pair} onChange={e=>setPair(e.target.value)}>{['don/rest','don/point','don/thumbs','don/halloween-rest','don/halloween-point','don/halloween-thumbs','ron/rest'].map(p=><option key={p}>{p}</option>)}</select></label>
            <button onClick={()=>{setAnimate(false);setTalking(!talking);}}>{talking?'Close mouth':'Open mouth'}</button>
            <button onClick={()=>setAnimate(!animate)}>{animate?'Stop mouth animation':'Animate mouths'}</button>
            <button onClick={()=>setAvif(!avif)}>{avif?'Switch to WebP':'Switch to AVIF'}</button>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:16}}>
                <section><h2>Before: whole image swaps</h2><div data-review="before" style={{position:'relative',width:'100%',aspectRatio:'1'}}><div className={styles.body} style={{'--fade':'55ms'} as React.CSSProperties}>
                    {allArt(who).map(id=><Artwork key={id} pose={id} active={id===artFor(who,gesture,talking)} preferAvif={avif} />)}
                </div></div></section>
                <section><h2>After: body stays fixed</h2><div data-review="after" style={{position:'relative',width:'100%',aspectRatio:'1'}}><div className={styles.body} style={{'--fade':'55ms'} as React.CSSProperties}>
                    <HostArtwork who={who} gesture={gesture} open={talking} art={allArt(who)} preferAvif={avif} />
                </div></div></section>
            </div>
        </> : mode==='fallback' ? <><button onClick={()=>setBroken(!broken)}>Toggle broken AVIF</button><div style={{display:'grid',gridTemplateColumns:'1fr 1fr'}}>
            <section><h2>Automatic AVIF / error fallback</h2><Artwork key={String(broken)} pose={broken?'qa-broken':pose} preferAvif /></section>
            <section><h2>Rollback: WebP only</h2><Artwork pose={pose} preferAvif={false} /></section>
        </div></> : <div style={{display:'grid',gridTemplateColumns:mode==='split'?'repeat(2,minmax(0,1fr))':'minmax(0,1fr)',gap:8}}>
            {(['webp','avif'] as const).filter(format=>mode==='split'||mode===format).map(format=><section key={format}>
                <h2>{format==='webp'?'Original WebP':'AVIF quality ${AVIF_OPTIONS.quality}'}</h2>
                <div style={{height:'calc(100vh - 150px)',overflow:'auto'}}><img alt={format+' '+pose} src={artUrl(pose,false,format)} style={{maxWidth:'none',width:zoom==='fit'?'100%':zoom==='native'?1254:2508}} /></div>
            </section>)}
        </div>}
    </main>;
}
`);
    }
    console.log(`Building isolated production copy: ${scratch}`);
    const build = launch([path.join(root, 'node_modules/next/dist/bin/next'), 'build']);
    assert.equal((await once(build, 'exit'))[0], 0, `Build failed; see ${path.join(scratch, 'verification.log')}`);
    next = launch([path.join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)]);
    for (let attempt = 0; attempt < 120; attempt++) {
        assert.equal(next.exitCode, null, 'Production test server exited before it became ready');
        try { if ((await fetch(`${base}/admin`)).ok) break; } catch { /* server starting */ }
        if (attempt === 119) throw new Error('Production server did not become ready');
        await delay(500);
    }
    const manifest = JSON.parse(await readFile(path.join(scratch, '.next/server/server-reference-manifest.json'), 'utf8'));
    const actions = Object.fromEntries(Object.entries(manifest.node).map(([id, action]) => [action.exportedName, id]));
    const expires = String(Date.now() + 3600_000);
    const cookie = `yofhl_admin=${expires}.${createHmac('sha256', env.ADMIN_SESSION_SECRET).update(expires).digest('base64url')}`;
    const action = async (name, args, authenticated = true) => {
        assert.ok(actions[name], `Missing action ${name}`);
        const response = await fetch(`${base}/admin/coachs-corner/new`, { method: 'POST', headers: {
            'next-action': actions[name], 'content-type': 'text/plain;charset=UTF-8', origin: base,
            ...(authenticated ? { cookie } : {}),
        }, body: JSON.stringify(args) });
        const body = await response.text();
        const row = body.split('\n').find(line => line.startsWith('1:'));
        return { response, body, value: row && !row.startsWith('1:E') ? JSON.parse(row.slice(2)) : null };
    };
    const get = async (slug = '') => {
        const response = await fetch(`${base}/coachs-corner${slug ? `/${slug}` : ''}`);
        return { response, text: await response.text() };
    };
    let id;
    await check('all four actions reject unauthenticated requests without database writes', async () => {
        for (const [name, args] of [['saveEpisode', [{ id: null, slug: 'forbidden', script: screenplay('Forbidden'), publish: true }]], ['unpublishEpisode', [1]], ['deleteEpisode', [1]], ['lookupPlayers', [['Player One']]]]) {
            const result = await action(name, args, false);
            assert.ok(result.response.status >= 400 || /\d+:E\{/.test(result.body));
        }
        assert.equal((await pg.query('select count(*)::int as n from league.coachs_corner_episodes')).rows[0].n, 0);
    });
    await check('draft writes leave public routes cached, including a cached missing URL', async () => {
        await get(); await get();
        assert.equal((await get('integration-week')).response.status, 404);
        const created = await action('saveEpisode', [{ id: null, slug: 'integration-week', script: screenplay('Draft title') }]);
        assert.ok(created.value?.id, created.body);
        id = created.value.id;
        const before = sqlQueries;
        assert.equal((await get()).response.headers.get('x-nextjs-cache'), 'HIT');
        assert.equal((await get('integration-week')).response.status, 404);
        assert.equal(sqlQueries, before);
    });
    await check('publish invalidates cached 404 and archive; repeated episode requests use the full route cache', async () => {
        const published = await action('saveEpisode', [{ id, slug: 'integration-week', script: screenplay('Published title'), publish: true }]);
        assert.equal(published.value?.id, id, published.body);
        assert.match((await get()).text, /Published title/);
        assert.equal((await get('integration-week')).response.status, 200);
        const cached = await get('integration-week');
        assert.match(cached.text, /Published title/);
        assert.equal(cached.response.headers.get('x-nextjs-cache'), 'HIT');
        const before = sqlQueries;
        for (let i = 0; i < 10; i++) await get('integration-week');
        assert.equal(sqlQueries, before);
    });
    await check('stale draft and invalid publish are rejected through real server actions', async () => {
        for (const publish of [false, true]) {
            const result = await action('saveEpisode', [{ id, slug: 'integration-week', script: 'unfinished', publish }]);
            assert.ok(result.value?.error, result.body);
        }
        assert.match((await get('integration-week')).text, /Published title/);
    });
    await check('rename clears both URL caches, and updates the latest episode', async () => {
        assert.equal((await get('integration-renamed')).response.status, 404);
        await action('saveEpisode', [{ id, slug: 'integration-renamed', script: screenplay('Renamed title'), publish: true }]);
        assert.equal((await get('integration-week')).response.status, 404);
        assert.match((await get('integration-renamed')).text, /Renamed title/);
        assert.match((await get()).text, /Renamed title/);
    });
    await check('unpublish, republish and delete refresh public pages', async () => {
        await action('unpublishEpisode', [id]);
        assert.equal((await get('integration-renamed')).response.status, 404);
        assert.doesNotMatch((await get()).text, /Renamed title/);
        await action('saveEpisode', [{ id, slug: 'integration-renamed', script: screenplay('Republished title'), publish: true }]);
        assert.match((await get('integration-renamed')).text, /Republished title/);
        await action('deleteEpisode', [id]);
        assert.equal((await get('integration-renamed')).response.status, 404);
        assert.doesNotMatch((await get()).text, /Republished title/);
    });
    await check('a failed cold request recovers without cache invalidation', async () => {
        failQueries = true;
        assert.equal((await get('outage-test')).response.status, 500);
        failQueries = false;
        assert.equal((await get('outage-test')).response.status, 404);
    });
    await check('hashed media is immutable for a year, supports ranges/304; source URLs remain mutable', async () => {
        const media = JSON.parse(await readFile(path.join(root, 'lib/coachs-corner/media.json'), 'utf8'));
        for (const source of ['/coachs-corner/coachs_corner_theme.mp3', '/coachs-corner/robots-v2/don-thumbs-up-640.webp', '/coachs-corner/robots-v2/don-thumbs-up-640.avif', '/coachs-corner/audio/tie-cloth-7.wav']) {
            const response = await fetch(base + media[source]);
            assert.equal(response.status, 200);
            if (source.endsWith('.avif')) assert.match(response.headers.get('content-type'), /image\/avif/);
            assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
            await response.arrayBuffer();
            // Undici otherwise adds Cache-Control: no-cache to conditional
            // requests, which intentionally forces a 200 from the static server.
            assert.equal((await fetch(base + media[source], { cache: 'force-cache', headers: { 'if-none-match': response.headers.get('etag') } })).status, 304);
            const partial = await fetch(base + media[source], { headers: { range: 'bytes=0-99' } });
            assert.equal(partial.status, 206);
            assert.equal((await partial.arrayBuffer()).byteLength, 100);
            assert.doesNotMatch((await fetch(base + source, { method: 'HEAD' })).headers.get('cache-control'), /immutable/);
        }
    });
    await writeFile(path.join(scratch, 'results.json'), JSON.stringify({ checks: results, sqlQueries, base }, null, 2));
    console.log(`All ${results.length} production checks passed. Logs: ${scratch}`);
    if (process.argv.includes('--keep')) {
        console.log(`Local browser review ready at ${base}/admin (local-review / local-review-only). Ctrl+C stops test services.`);
        await Promise.race([once(process, 'SIGINT'), once(process, 'SIGTERM')]);
    }
} finally {
    next?.kill();
    bridge.closeAllConnections();
    await new Promise(resolve => bridge.close(resolve));
    await pg.close();
    log.end();
}
