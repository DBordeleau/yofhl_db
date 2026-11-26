import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import type { PlayerShareCard, SeasonShareCard, TeamShareCard } from './model';
import { renderLinkPreview } from './link-preview';
import type { TeamColours } from '../team-branding';

/** no owner has set colours, so each team wears its suggested palette, and a season with no champion the fallback */
const branding: Record<number, TeamColours> = {};

const mcdavid: PlayerShareCard = {
    kind: 'player', href: '/player/abc123', title: 'Connor McDavid', summary: 'Player card',
    name: 'Connor McDavid', rank: 1, positions: ['C'],
    team: { id: 3, name: 'Dangle Berries', abbreviation: 'DB', logo: '/hhlogo.png' },
    totalFPts: 4210.5, fpg: 5.12, seasons: 9, cups: 2,
    seasonPoints: [{ year: 2026, value: 512, champion: true }],
    trophies: [{ name: 'Wayne Gretzky Award', image: '/trophies/wayne-gretzky.webp', count: 3 }],
};

/** what an unfurler gets: the response's bytes, read as an image */
async function picture(response: Response) {
    assert.equal(response.headers.get('content-type'), 'image/png');
    const { format, width, height } = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    return { format, width, height };
}

/** the preview's pixels, to tell two previews apart */
const pixels = async (response: Response) => sharp(Buffer.from(await response.arrayBuffer())).raw().toBuffer();

test("a player's link preview is a landscape PNG in their team's colours", async () => {
    assert.deepEqual(await picture(await renderLinkPreview(mcdavid, branding)),
        { format: 'png', width: 1200, height: 630 });
});

test('a player with no honours and no team still previews', async () => {
    const journeyman = { ...mcdavid, name: 'Pat Journeyman', rank: null, team: null, cups: 0, trophies: [], seasonPoints: [], positions: [] };
    assert.deepEqual(await picture(await renderLinkPreview(journeyman, branding)),
        { format: 'png', width: 1200, height: 630 });
});

test("a player's team logo that can't be read falls back to its abbreviation", async () => {
    const lostLogo = { ...mcdavid, team: { ...mcdavid.team!, logo: '/logos/no-such-logo.png' } };
    assert.deepEqual(await picture(await renderLinkPreview(lostLogo, branding)),
        { format: 'png', width: 1200, height: 630 });
});

test("an owner's team colours light the preview in place of the suggested palette", async () => {
    const owned = { 3: { primary: '#00843d', secondary: '#ffb81c', tertiary: '#ffffff', treatment: 'stripes' as const } };
    const [suggested, own] = await Promise.all([renderLinkPreview(mcdavid, branding), renderLinkPreview(mcdavid, owned)]);
    assert.ok(!(await pixels(suggested)).equals(await pixels(own)));
});

test("a player's preview is revalidated rather than cached as immutable", async () => {
    // the og:image URL stays the same as the player's stats change, so caches between here and the unfurler must check back
    const cacheControl = (await renderLinkPreview(mcdavid, branding)).headers.get('cache-control') ?? '';
    assert.doesNotMatch(cacheControl, /immutable/);
    assert.match(cacheControl, /max-age=0/);
});

const dangleBerries: TeamShareCard = {
    kind: 'team', href: '/teams/3', title: 'Dangle Berries', summary: 'Franchise card',
    team: { id: 3, name: 'Dangle Berries', abbreviation: 'DB', logo: '/hhlogo.png' },
    owner: 'Dillon', span: '2017–2026', defunct: false, record: '96–54–6', winRate: 63.5, fptsFor: 48210.4, cups: 2, finals: 3,
    seasons: [{ year: 2026, record: '12–5–0', result: 'cup' }],
};

test("a team's link preview is a landscape PNG in its colours", async () => {
    assert.deepEqual(await picture(await renderLinkPreview(dangleBerries, branding)),
        { format: 'png', width: 1200, height: 630 });
});

test('a team whose logo is a WebP previews', async () => {
    // Satori can't decode WebP, which is what owner uploads and one checked-in logo are
    const honkers = { ...dangleBerries, team: { id: 14, name: 'Hooterville Honkers', abbreviation: 'HH', logo: '/logos/hooterville_honkers.webp' },
        owner: null, defunct: true, cups: 0, finals: 0 };
    assert.deepEqual(await picture(await renderLinkPreview(honkers, branding)),
        { format: 'png', width: 1200, height: 630 });
});

const season2026: SeasonShareCard = {
    kind: 'season', href: '/season/2026', title: '2025–26', summary: '2025–26 Jagr Cup champions: Dangle Berries.',
    year: 2026, cancelled: false, owner: 'Dillon',
    team: { id: 3, name: 'Dangle Berries', abbreviation: 'DB', logo: '/hhlogo.png' },
    scorers: [
        { name: 'Connor McDavid', position: 'C', points: 512.4 },
        { name: 'Cale Makar', position: 'D', points: 401.1 },
        { name: 'Igor Shesterkin', position: 'G', points: 388 },
    ],
};

test("a season's link preview is a landscape PNG in its champion's colours", async () => {
    assert.deepEqual(await picture(await renderLinkPreview(season2026, branding)),
        { format: 'png', width: 1200, height: 630 });
});

test('a season whose playoffs were cancelled previews with no champion', async () => {
    const season2020 = { ...season2026, year: 2020, cancelled: true, team: null, owner: null, scorers: [] };
    assert.deepEqual(await picture(await renderLinkPreview(season2020, branding)),
        { format: 'png', width: 1200, height: 630 });
});

test('a season with no top scorers on record still previews', async () => {
    assert.deepEqual(await picture(await renderLinkPreview({ ...season2026, scorers: [] }, branding)),
        { format: 'png', width: 1200, height: 630 });
});


test("a top scorer's suffix is left off their surname", async () => {
    // "Jr." alone would name nobody, so Tkachuk Jr. is labelled Tkachuk, the same as a Tkachuk with no suffix
    const scorer = (name: string) => ({ ...season2026, scorers: [{ name, position: 'LW', points: 512.4 }, ...season2026.scorers.slice(1)] });
    const [junior, plain] = await Promise.all([renderLinkPreview(scorer('Matthew Tkachuk Jr.'), branding),
        renderLinkPreview(scorer('Matthew Tkachuk'), branding)]);
    assert.ok((await pixels(junior)).equals(await pixels(plain)));
});

/** how many pixels of the slab row along the top, left of the picture, are the gold of a standing's tag */
async function goldInSlabRow(response: Response) {
    const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
        .extract({ left: 0, top: 40, width: 780, height: 60 }).raw().toBuffer({ resolveWithObject: true });
    let gold = 0;
    for (let offset = 0; offset < data.length; offset += info.channels)
        if (Math.hypot(data[offset] - 0xf3, data[offset + 1] - 0xd9, data[offset + 2] - 0x95) < 40) gold++;
    return gold;
}

test("a cancelled season's preview names the season once, with no tag repeating it", async () => {
    const season2020 = { ...season2026, year: 2020, cancelled: true, team: null, owner: null, scorers: [] };
    // a season with a champion tags its label in gold beside the slab, which the cancelled season's name already is
    assert.ok(await goldInSlabRow(await renderLinkPreview(season2026, branding)) > 0);
    assert.equal(await goldInSlabRow(await renderLinkPreview(season2020, branding)), 0);
});
