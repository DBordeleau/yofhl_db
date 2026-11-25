import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { renderSitePreview } from './site-preview';

// The image behind every YOFHL link that has none of its own. It reads the bundled Archivo cuts, so a missing or
// unreadable font file fails here rather than at build time.

test('the site previews as a landscape PNG', async () => {
    const response = await renderSitePreview();
    assert.equal(response.headers.get('content-type'), 'image/png');
    const { format, width, height } = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.deepEqual({ format, width, height }, { format: 'png', width: 1200, height: 630 });
});

// The card is a sheet of ice, and it is the only preview that is light. A radial glow that fades to transparent black
// greys everything under it: invisible on the navy cards, and enough to turn this one slate.
test('the ice stays white under the lighting', async () => {
    const png = Buffer.from(await (await renderSitePreview()).arrayBuffer());
    // bare ice, clear of the lines, the faceoff spots, the slab and the rule along the bottom
    const patch = await sharp(png).extract({ left: 30, top: 230, width: 90, height: 100 }).png().toBuffer();
    const [red, green, blue] = (await sharp(patch).stats()).channels;

    for (const [channel, { mean }] of [['red', red], ['green', green], ['blue', blue]] as const) {
        assert.ok(mean > 232, `the ice reads grey: its ${channel} averages ${mean.toFixed(1)} of 255`);
    }
    assert.ok(blue.mean > red.mean, 'ice is cool, so its blue should sit above its red');
});
