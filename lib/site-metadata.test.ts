import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PREVIEW_IMAGE, pageMetadata, SITE_DESCRIPTION } from './site-metadata';

// What a scraper reads off a page that goes through the helper.

test('a page carries its title, description, canonical address, Open Graph text and a large-image card', () => {
    const metadata = pageMetadata({ path: '/teams/stats', name: 'Franchises', description: 'Every YOFHL franchise.' });
    assert.equal(metadata.title, 'Franchises · YOFHL');
    assert.equal(metadata.description, 'Every YOFHL franchise.');
    assert.deepEqual(metadata.alternates, { canonical: '/teams/stats' });
    assert.equal(metadata.openGraph?.siteName, 'YOFHL');
    assert.equal(metadata.openGraph?.title, 'Franchises');
    assert.equal(metadata.openGraph?.description, 'Every YOFHL franchise.');
    assert.equal((metadata.openGraph as { type?: string }).type, 'website');
    assert.deepEqual(metadata.twitter, { card: 'summary_large_image', title: 'Franchises', description: 'Every YOFHL franchise.' });
});

test("a page's own Open Graph still carries the default preview image", () => {
    // Next replaces the layout's openGraph with the page's rather than merging them, so the helper attaches the image itself
    const metadata = pageMetadata({ path: '/search', name: 'Search', description: SITE_DESCRIPTION });
    assert.deepEqual(metadata.openGraph?.images, [DEFAULT_PREVIEW_IMAGE]);
    assert.equal(DEFAULT_PREVIEW_IMAGE.width, 1200);
    assert.equal(DEFAULT_PREVIEW_IMAGE.height, 630);
});

test('a page with a preview image of its own is left to it', () => {
    const metadata = pageMetadata({ path: "/coachs-corner/2027-week-6-recap", name: "Week 6: Recap · Coach's Corner",
        description: 'Don and Ron break down the week in the YOFHL.', type: 'article', image: 'own' });
    assert.equal(metadata.openGraph?.images, undefined);
    assert.equal((metadata.openGraph as { type?: string }).type, 'article');
});

test('a page that asks not to be indexed keeps that', () => {
    const metadata = pageMetadata({ path: '/search', name: 'Search', description: 'Search every YOFHL player, team and season.',
        robots: { index: false, follow: true } });
    assert.deepEqual(metadata.robots, { index: false, follow: true });
    assert.equal(pageMetadata({ path: '/', name: 'League home', description: SITE_DESCRIPTION }).robots, undefined);
});

test('a page that says nothing of its own falls back to what the site is', () => {
    const metadata = pageMetadata({ path: '/player/abc123', name: 'Connor McDavid' });
    assert.equal(metadata.description, SITE_DESCRIPTION);
    assert.equal(metadata.openGraph?.description, SITE_DESCRIPTION);
    assert.equal(SITE_DESCRIPTION,
        "Every YOFHL season, team, player, record and award, from the first draft to this week's matchups.");
});
