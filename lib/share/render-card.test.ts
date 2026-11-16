import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { renderShareCard } from './render-card';
import type { EpisodeShareCard, PlayerShareCard } from './model';

const player: PlayerShareCard = {
    kind: 'player', href: '/player/04alw', title: 'Cale Makar', summary: 'Player career card',
    name: 'Cale Makar', rank: 16, positions: ['D'], team: null,
    totalFPts: 3298.75, fpg: 6.91, seasons: 7, cups: 2,
    seasonPoints: [{ year: 2026, value: 506.5, champion: false }], trophies: [],
};
const remembrance: EpisodeShareCard = {
    kind: 'episode', href: '/coachs-corner/2027-week-3-recap', title: "Coach's Corner Week 3: Recap", summary: 'Episode card',
    episode: 'Recap', week: 3, label: 'Week 3', aired: '2026-11-09T12:00:00Z', runtimeMs: 60000,
    quote: { who: 'ron', text: 'We will remember them.' }, wardrobe: 'remembrance-2026', lapel: 'poppy',
};

// Exercise the public renderer with browser API doubles. Pixel output is checked in the browser.
function browser(t: TestContext, load: (font: string) => Promise<unknown[]>, { art = 'unavailable' }: { art?: 'loaded' | 'unavailable' } = {}) {
    const png = new Blob(['encoded canvas'], { type: 'image/png' });
    const gradient = { addColorStop() {} };
    const ctx = {
        font: '', fillText: t.mock.fn((text: string) => text), strokeText() {}, measureText: (text: string) => ({ width: text.length * 10 }),
        createLinearGradient: () => gradient, createRadialGradient: () => gradient,
        fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, arc() {}, closePath() {}, fill() {},
        save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, ellipse() {}, stroke() {}, drawImage: t.mock.fn(),
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: t.mock.fn((done: BlobCallback) => done(png)) };
    class UnavailableImage {
        onerror: (() => void) | null = null;
        set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    const requested: string[] = [];
    class LoadedImage {
        onload: (() => void) | null = null;
        width = 640; height = 640;
        set src(value: string) { requested.push(value); queueMicrotask(() => this.onload?.()); }
    }
    const globals = {
        document: { body: {}, fonts: { load }, createElement: () => canvas },
        window: { location: { origin: 'https://www.yofhl.com' } },
        getComputedStyle: () => ({ fontFamily: 'Archivo, sans-serif' }),
        Image: art === 'loaded' ? LoadedImage : UnavailableImage,
        Path2D: class { constructor(readonly d: string) {} },
    };
    for (const [name, value] of Object.entries(globals)) {
        const previous = Object.getOwnPropertyDescriptor(globalThis, name);
        Object.defineProperty(globalThis, name, { configurable: true, value });
        t.after(() => {
            if (previous) Object.defineProperty(globalThis, name, previous);
            else Reflect.deleteProperty(globalThis, name);
        });
    }
    return { png, canvas, ctx, requested };
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

test('episode PNG renders Don in the card wardrobe with the lapel poppy, with or without host art', async t => {
    await t.test('art unavailable', async t => {
        const { png, ctx } = browser(t, async () => []);
        assert.equal(await renderShareCard(remembrance), png);
        assert.equal(ctx.drawImage.mock.callCount(), 0);
    });
    await t.test('art loaded', async t => {
        const { png, requested } = browser(t, async () => [], { art: 'loaded' });
        assert.equal(await renderShareCard(remembrance), png);
        const hosts = requested.filter(src => src.includes('/don-') || src.includes('/ron-'));
        assert.equal(hosts.length, 2);
        assert.ok(hosts.some(src => src.includes('/don-remembrance-stare')), hosts.join(', '));
    });
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
