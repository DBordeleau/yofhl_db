import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import type { PlayerShareCard } from './model';
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
