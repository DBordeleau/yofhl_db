import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import type { EpisodeShareCard } from './model';
import { renderEpisodePreview } from './episode-preview';

const week6: EpisodeShareCard = {
    kind: 'episode', href: '/coachs-corner/2027-week-6-recap', title: "Coach's Corner Week 6: Recap", summary: 'Episode card',
    episode: 'Recap', week: 6, label: 'Week 6', aired: '2026-11-12T12:00:00Z', runtimeMs: 240000,
    quote: { who: 'don', text: 'THAT IS A DISGRACE AND I WILL NOT STAND FOR IT' }, wardrobe: 'normal', lapel: null,
};

/** what an unfurler gets: the response's bytes, read as an image */
async function picture(card: EpisodeShareCard) {
    const response = await renderEpisodePreview(card);
    assert.equal(response.headers.get('content-type'), 'image/png');
    const { format, width, height } = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    return { format, width, height };
}

test('an episode with a pull quote previews as a landscape PNG', async () => {
    assert.deepEqual(await picture(week6), { format: 'png', width: 1200, height: 630 });
});

test('an episode with no pull quote or label still previews', async () => {
    const special = { ...week6, episode: 'The All-Star Special Spectacular', week: null, label: null, quote: null };
    assert.deepEqual(await picture(special), { format: 'png', width: 1200, height: 630 });
});

test('a Remembrance episode previews with Don in its wardrobe and both hosts wearing the poppy', async () => {
    const remembrance = { ...week6, quote: { who: 'ron' as const, text: 'We will remember them.' }, wardrobe: 'remembrance-2026', lapel: 'poppy' as const };
    assert.deepEqual(await picture(remembrance), { format: 'png', width: 1200, height: 630 });
});

test("a republished episode's preview is revalidated rather than cached as immutable", async () => {
    // the og:image URL stays the same across republishes, so caches between here and the unfurler must check back
    const cacheControl = (await renderEpisodePreview(week6)).headers.get('cache-control') ?? '';
    assert.doesNotMatch(cacheControl, /immutable/);
    assert.match(cacheControl, /max-age=0/);
});
