import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { renderSitePreview } from './site-preview';

// The image behind every YOFHL link that has none of its own. It reads the bundled Archivo cuts and the published
// Jagr Cup art, so a missing or unreadable file fails here rather than at build time.

test('the site previews as a landscape PNG', async () => {
    const response = await renderSitePreview();
    assert.equal(response.headers.get('content-type'), 'image/png');
    const { format, width, height } = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.deepEqual({ format, width, height }, { format: 'png', width: 1200, height: 630 });
});
