// Browser regression checks against a running local app. No writes to league data.
// COACHS_BASE_URL defaults to http://localhost:3000; install Playwright or set
// PLAYWRIGHT_MODULE to its package directory. PLAYWRIGHT_EXECUTABLE is optional.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.COACHS_BASE_URL || 'http://localhost:3000';
const output = '.cache/coachs-mobile';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE });
const errors = [];
const failures = [];
const cls = name => `[class*="_${name}_"]`;
async function check(name, run) {
    if (process.env.COACHS_CHECK && !name.includes(process.env.COACHS_CHECK)) return;
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
}
async function open(width, height, fallback) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 1000, isMobile: width < 500 });
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(fallback => {
        localStorage.setItem('coachs-corner:sound', 'off');
        if (fallback === 'missing') HTMLElement.prototype.requestFullscreen = undefined;
        if (fallback === 'denied') HTMLElement.prototype.requestFullscreen = () => Promise.reject(new Error('Test fullscreen denial'));
    }, fallback);
    await page.goto(`${base}/coachs-corner/opening-week`);
    await page.getByRole('button', { name: 'Next line', exact: true }).click();
    return page;
}
async function seek(page, seconds) {
    const slider = page.getByRole('slider', { name: 'Seek' });
    await slider.scrollIntoViewIfNeeded();
    const box = await slider.boundingBox();
    const duration = Number(await slider.getAttribute('aria-valuemax'));
    await slider.click({ position: { x: Math.min(box.width - 1, box.width * seconds / duration), y: box.height / 2 } });
    await page.waitForTimeout(300);
}
async function controls(page, touch = true) {
    const problems = await page.locator(cls('rail')).evaluate((rail, touch) => {
        const bounds = rail.getBoundingClientRect();
        return [...rail.querySelectorAll('button, [role="slider"]')].flatMap(el => {
            const r = el.getBoundingClientRect();
            const label = el.getAttribute('aria-label');
            return [
                ...(r.left < bounds.left - 1 || r.right > bounds.right + 1 ? [`${label} outside rail`] : []),
                ...(touch && (r.width < 44 || r.height < 44) ? [`${label} too small: ${r.width} × ${r.height}`] : []),
            ];
        });
    }, touch);
    assert.deepEqual(problems, []);
}
async function captions(page) {
    const problems = await page.locator(`${cls('plate')}[data-active]`).evaluateAll(plates => plates.flatMap(plate => {
        const text = plate.querySelector('p');
        const window = text.parentElement.getBoundingClientRect();
        const last = [...text.querySelectorAll('[data-on]')].at(-1)?.getBoundingClientRect();
        const tag = plate.querySelector('span').getBoundingClientRect();
        const frame = plate.closest('[class*="_frame_"]').getBoundingClientRect();
        return [
            ...(!last || last.bottom > window.bottom + 2 || last.top < window.top - 2 ? ['current word clipped'] : []),
            ...(tag.top < frame.top - 1 || window.bottom > frame.bottom + 1 ? ['caption outside picture'] : []),
        ];
    }));
    assert.deepEqual(problems, []);
}
async function fitsFullscreen(page) {
    await page.waitForTimeout(400);
    await controls(page);
    const bounds = await page.locator(cls('presentation')).boundingBox();
    const viewport = page.viewportSize();
    assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, JSON.stringify(bounds));
    await captions(page);
}
try {
    for (const [width, height] of [[320,740], [360,780], [390,844], [412,915], [768,1024], [1440,900]]) {
        await check(`layout and captions at ${width} × ${height}`, async () => {
            const page = await open(width, height);
            try {
                await controls(page, width < 1000);
                for (const time of [34, 71, 149, 179, 261]) { await seek(page, time); await captions(page); }
                await seek(page, 34);
                await page.screenshot({ path: `${output}/layout-${width}.png`, fullPage: true });
            } finally { await page.close(); }
        });
    }
    await check('paused captions reflow on rotation and native fullscreen', async () => {
        const page = await open(360, 780);
        try {
            await seek(page, 34);
            for (const [width, height] of [[780,360], [360,780]]) {
                await page.setViewportSize({width,height});
                await page.waitForTimeout(400);
                await captions(page);
            }
            await page.getByRole('button', {name:'Full screen',exact:true}).click();
            for (const [width, height] of [[360,780], [780,360], [568,320], [320,568]]) {
                await page.setViewportSize({width,height});
                await fitsFullscreen(page);
                await page.screenshot({path:`${output}/fullscreen-${width}.png`});
            }
            await page.getByRole('button',{name:'Exit full screen',exact:true}).click();
            await page.locator('[data-fullscreen]').waitFor({state:'detached'});
            assert.equal(await page.locator('[data-fullscreen]').count(), 0);
        } finally { await page.close(); }
    });
    for (const fallback of ['missing','denied']) {
        await check(`fullscreen fallback when native API is ${fallback}`, async () => {
            const page = await open(360,780,fallback);
            try {
                await seek(page,34);
                await page.getByRole('button',{name:'Full screen',exact:true}).click();
                assert.equal(await page.locator('[data-expanded]').count(),1);
                await fitsFullscreen(page);
                await page.setViewportSize({width:780,height:360});
                await fitsFullscreen(page);
                await page.getByRole('button',{name:'Share this episode',exact:true}).click();
                await page.getByRole('dialog',{name:'Share this episode',exact:true}).waitFor();
                await page.getByRole('button',{name:'Close share this episode',exact:true}).click();
                await page.keyboard.press('Escape');
                assert.equal(await page.locator('[data-expanded]').count(),0);
                assert.equal(await page.evaluate(()=>document.documentElement.style.overflow),'');
                assert.equal(await page.locator('[inert]').count(),0);
                await page.getByRole('button',{name:'Next line',exact:true}).click();
            } finally { await page.close(); }
        });
    }
    await check('touch seek, vertical scrolling, cancellation, and playback controls', async () => {
        const page = await open(360,780);
        try {
            await seek(page,34);
            const slider = page.getByRole('slider',{name:'Seek'});
            await slider.scrollIntoViewIfNeeded();
            const box = await slider.boundingBox();
            const session = await page.context().newCDPSession(page);
            const touch = (type,x,y) => Promise.race([
                session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y}]}),
                new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error(`Touch dispatch timed out: ${type}`)),5000);timer.unref();}),
            ]);
            const y = box.y + box.height/2;
            await touch('touchStart',box.x+box.width*.15,y);
            for(const ratio of [.25,.4,.6]) await touch('touchMove',box.x+box.width*ratio,y);
            await touch('touchEnd');
            assert.ok(Number(await slider.getAttribute('aria-valuenow'))>140,'horizontal drag must seek');
            await seek(page,34);
            await slider.scrollIntoViewIfNeeded();
            const currentBox = await slider.boundingBox();
            const x = currentBox.x + currentBox.width*.6, startY = currentBox.y+22;
            const before = await slider.getAttribute('aria-valuenow');
            const scrollBefore = await page.evaluate(()=>scrollY);
            await touch('touchStart',x,startY);
            for (const dy of [15,35,70,120]) await touch('touchMove',x,startY-dy);
            await touch('touchEnd');
            await page.waitForTimeout(250);
            assert.equal(await slider.getAttribute('aria-valuenow'),before,'vertical swipe must not seek');
            assert.ok(await page.evaluate(()=>scrollY)>scrollBefore,'vertical swipe must scroll');
            await slider.scrollIntoViewIfNeeded();
            const cancelBox = await slider.boundingBox();
            await touch('touchStart',cancelBox.x+30,cancelBox.y+22);
            await touch('touchCancel');
            await seek(page,70);
            await page.getByRole('button',{name:'Play',exact:true}).click();
            await page.waitForTimeout(1200);
            await page.getByRole('button',{name:'Pause',exact:true}).click();
            assert.ok(Number(await slider.getAttribute('aria-valuenow'))>=71);
            await page.getByRole('button',{name:'Speed 1×',exact:true}).click();
            await page.getByRole('button',{name:'Speed 1.25×',exact:true}).waitFor();
            await page.getByRole('button',{name:'Turn sound on',exact:true}).click();
            await page.getByRole('button',{name:'Mute',exact:true}).click();
            await slider.focus();
            await page.keyboard.press('End');
            await page.getByRole('button',{name:'Replay',exact:true}).waitFor();
            await page.getByRole('button',{name:'Replay',exact:true}).click();
            assert.ok(Number(await slider.getAttribute('aria-valuenow'))<2);
        } finally { await page.close(); }
    });
    await check('no browser runtime errors',async()=>assert.deepEqual(errors,[]));
} finally { await browser.close(); }
if(failures.length) process.exitCode=1;
