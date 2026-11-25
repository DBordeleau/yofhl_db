import assert from 'node:assert/strict';
import test from 'node:test';
import { episodeFrom } from './episode';
import { episodeMetadata } from './episode-metadata';

const head = '---\ntitle: Recap\nseason: 2027\nweek: 6\ndate: 2026-11-12\n---\n';
const stored = { slug: '2027-week-6-recap', title: 'Recap', week: 6 };

test('a link carries the label and title as its headline and the pull quote as its description', () => {
    const script = `${head}DON: Good evening.\n\nDON: !!THAT IS A DISGRACE AND I WILL NOT STAND FOR IT!!\n\nRON: Okay, Don.`;
    const metadata = episodeMetadata(stored, episodeFrom(script, { slug: stored.slug }));
    assert.equal(metadata.title, "Week 6: Recap · Coach's Corner · YOFHL");
    assert.deepEqual(metadata.alternates, { canonical: '/coachs-corner/2027-week-6-recap' });
    assert.equal(metadata.description, 'THAT IS A DISGRACE AND I WILL NOT STAND FOR IT');
    // no images: the episode's own opengraph-image route draws its hosts, and Next fills that in for it
    assert.deepEqual(metadata.openGraph, { type: 'article', siteName: 'YOFHL',
        title: "Week 6: Recap · Coach's Corner", description: 'THAT IS A DISGRACE AND I WILL NOT STAND FOR IT' });
    assert.deepEqual(metadata.twitter, { card: 'summary_large_image',
        title: "Week 6: Recap · Coach's Corner", description: 'THAT IS A DISGRACE AND I WILL NOT STAND FOR IT' });
});

test('an episode with no pull quote still describes the show', () => {
    const metadata = episodeMetadata(stored, episodeFrom(`${head}DON: Hi.\n\nRON: Hey.`, { slug: stored.slug }));
    assert.equal(metadata.description, 'Don and Ron break down the week in the YOFHL.');
    assert.equal(metadata.openGraph?.description, 'Don and Ron break down the week in the YOFHL.');
    assert.equal(metadata.twitter?.description, 'Don and Ron break down the week in the YOFHL.');
});

test('an episode with no label is headlined by its title alone', () => {
    const special = { slug: 'all-star-special', title: 'All-Star Special', week: null };
    const metadata = episodeMetadata(special, episodeFrom('---\ntitle: All-Star Special\n---\nDON: Hi.', { slug: special.slug }));
    assert.equal(metadata.title, "All-Star Special · Coach's Corner · YOFHL");
    assert.equal(metadata.openGraph?.title, "All-Star Special · Coach's Corner");
});
