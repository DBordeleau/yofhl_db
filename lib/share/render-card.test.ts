import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { renderShareCard } from './render-card';
import type { PlayerShareCard } from './model';

const player: PlayerShareCard = {
    kind: 'player', href: '/player/04alw', title: 'Cale Makar', summary: 'Player career card',
    name: 'Cale Makar', rank: 16, positions: ['D'], team: null,
    totalFPts: 3298.75, fpg: 6.91, seasons: 7, cups: 2,
    seasonPoints: [{ year: 2026, value: 506.5, champion: false }], trophies: [],
};

// Exercise the public renderer with browser API doubles. Pixel output is checked in the browser.
function browser(t: TestContext, load: (font: string) => Promise<unknown[]>) {
    const png = new Blob(['encoded canvas'], { type: 'image/png' });
    const gradient = { addColorStop() {} };
    const ctx = {
        font: '', fillText: t.mock.fn((text: string) => text), strokeText() {}, measureText: (text: string) => ({ width: text.length * 10 }),
        createLinearGradient: () => gradient, createRadialGradient: () => gradient,
        fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, arc() {}, closePath() {}, fill() {},
        save() {}, restore() {}, translate() {}, scale() {},
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: t.mock.fn((done: BlobCallback) => done(png)) };
    class UnavailableImage {
        onerror: (() => void) | null = null;
        set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    const globals = {
        document: { body: {}, fonts: { load }, createElement: () => canvas },
        window: { location: { origin: 'https://www.yofhl.com' } },
        getComputedStyle: () => ({ fontFamily: 'Archivo, sans-serif' }),
        Image: UnavailableImage,
    };
    for (const [name, value] of Object.entries(globals)) {
        const previous = Object.getOwnPropertyDescriptor(globalThis, name);
        Object.defineProperty(globalThis, name, { configurable: true, value });
        t.after(() => {
            if (previous) Object.defineProperty(globalThis, name, previous);
            else Reflect.deleteProperty(globalThis, name);
        });
    }
    return { png, canvas, ctx };
}

test('share PNG still renders when a custom font download fails', async t => {
    const { png, canvas, ctx } = browser(t, async font => {
        if (font.startsWith('italic')) throw new DOMException('Font download failed', 'NetworkError');
        return [];
    });
    assert.equal(await renderShareCard(player), png);
    assert.equal(canvas.toBlob.mock.callCount(), 1);
    assert.ok(ctx.fillText.mock.calls.some(call => call.arguments[0] === 'MAKAR'));
});

test('share PNG renders with loaded fonts and unavailable optional artwork', async t => {
    const load = t.mock.fn(async (font: string) => [font]);
    const { png, canvas } = browser(t, load);
    assert.equal(await renderShareCard(player), png);
    assert.equal(load.mock.callCount(), 4);
    assert.deepEqual([canvas.width, canvas.height], [1080, 1350]);
});

test('share PNG does not wait indefinitely for a stalled font download', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { png } = browser(t, () => new Promise(() => {}));
    const rendering = renderShareCard(player);
    t.mock.timers.tick(2000);
    assert.equal(await rendering, png);
});

test('share PNG preserves the cause when canvas export fails', async t => {
    const { canvas } = browser(t, async () => []);
    const cause = new DOMException('Canvas is not origin-clean', 'SecurityError');
    t.mock.method(canvas, 'toBlob', () => { throw cause; });
    await assert.rejects(renderShareCard(player), (error: Error) => {
        assert.equal(error.cause, cause);
        return true;
    });
});
