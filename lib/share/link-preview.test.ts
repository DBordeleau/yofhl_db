import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import type { PlayerShareCard, SeasonShareCard, TeamShareCard } from './model';
import { renderLinkPreview } from './link-preview';
import { fallbackColours, suggestedPalettes } from '../team-branding';

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

test("a player's link preview is a landscape PNG in their team's colours", async () => {
    assert.deepEqual(await picture(await renderLinkPreview(mcdavid, suggestedPalettes[3])),
        { format: 'png', width: 1200, height: 630 });
});

test('a player with no honours and no team still previews', async () => {
    const journeyman = { ...mcdavid, name: 'Pat Journeyman', rank: null, team: null, cups: 0, trophies: [], seasonPoints: [], positions: [] };
    assert.deepEqual(await picture(await renderLinkPreview(journeyman, fallbackColours)),
        { format: 'png', width: 1200, height: 630 });
});

test("a player's team logo that can't be read falls back to its abbreviation", async () => {
    const lostLogo = { ...mcdavid, team: { ...mcdavid.team!, logo: '/logos/no-such-logo.png' } };
    assert.deepEqual(await picture(await renderLinkPreview(lostLogo, suggestedPalettes[3])),
        { format: 'png', width: 1200, height: 630 });
});

test("a player's preview is revalidated rather than cached as immutable", async () => {
    // the og:image URL stays the same as the player's stats change, so caches between here and the unfurler must check back
    const cacheControl = (await renderLinkPreview(mcdavid, suggestedPalettes[3])).headers.get('cache-control') ?? '';
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
    assert.deepEqual(await picture(await renderLinkPreview(dangleBerries, suggestedPalettes[3])),
        { format: 'png', width: 1200, height: 630 });
});

test('a team whose logo is a WebP previews', async () => {
    // Satori can't decode WebP, which is what owner uploads and one checked-in logo are
    const honkers = { ...dangleBerries, team: { id: 14, name: 'Hooterville Honkers', abbreviation: 'HH', logo: '/logos/hooterville_honkers.webp' },
        owner: null, defunct: true, cups: 0, finals: 0 };
    assert.deepEqual(await picture(await renderLinkPreview(honkers, fallbackColours)),
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
    assert.deepEqual(await picture(await renderLinkPreview(season2026, suggestedPalettes[3])),
        { format: 'png', width: 1200, height: 630 });
});

test('a season whose playoffs were cancelled previews with no champion', async () => {
    const season2020 = { ...season2026, year: 2020, cancelled: true, team: null, owner: null, scorers: [] };
    assert.deepEqual(await picture(await renderLinkPreview(season2020, fallbackColours)),
        { format: 'png', width: 1200, height: 630 });
});

test('a season with no top scorers on record still previews', async () => {
    assert.deepEqual(await picture(await renderLinkPreview({ ...season2026, scorers: [] }, suggestedPalettes[3])),
        { format: 'png', width: 1200, height: 630 });
});
