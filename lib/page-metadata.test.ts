import assert from 'node:assert/strict';
import type { Metadata } from 'next';
import test from 'node:test';
import { awardMetadata, franchiseMetadata, FRANCHISES_DESCRIPTION, headToHeadMetadata, leaderboardMetadata,
    matchupRecordMetadata, playerComparisonMetadata, playerMetadata, RECORD_BOOK_DESCRIPTION, seasonBallotsMetadata,
    seasonMetadata } from './page-metadata';
import { JOHNNY_GAUDREAU_ID } from './data/league';
import { DEFAULT_PREVIEW_IMAGE } from './site-metadata';

/**
 * Next drops a page's opengraph-image file whenever its metadata has an images key, even one set to undefined, so a
 * page with a link preview of its own must have none.
 */
function assertOwnLinkPreview(metadata: Metadata) {
    assert.ok(metadata.openGraph, 'the page has Open Graph metadata');
    assert.ok(!('images' in metadata.openGraph), 'the page names no image of its own');
}

// What each public page tells the group chat, Discord, Slack, X and a search engine. Every description is built from
// lasting facts — seasons, Jagr Cups, champions, owners — because a chat app can hold a preview for months.

test("a season's link names the season and who won its Jagr Cup", () => {
    const metadata = seasonMetadata({ year: 2026, team: 'Dangle Berries', owner: 'Dillon', playoffStatus: 'complete' });
    assert.equal(metadata.title, '2025–26 Season · YOFHL');
    assert.deepEqual(metadata.alternates, { canonical: '/season/2026' });
    assert.equal(metadata.description,
        'The 2025–26 YOFHL season: Dangle Berries (Dillon) won the Jagr Cup. Final standings, playoff bracket, leaders and draft class.');
    assert.equal(metadata.openGraph?.description, metadata.description);
});

test('a season whose playoffs were cancelled names no champion', () => {
    const metadata = seasonMetadata({ year: 2020, team: null, owner: null, playoffStatus: 'cancelled' });
    assert.equal(metadata.description,
        'The 2019–20 YOFHL season, whose playoffs were cancelled. Final standings, leaders and draft class.');
});

test('a season with no owner on record still names its champion', () => {
    const metadata = seasonMetadata({ year: 2019, team: 'Sens Fan', owner: null, playoffStatus: 'complete' });
    assert.equal(metadata.description,
        'The 2018–19 YOFHL season: Sens Fan won the Jagr Cup. Final standings, playoff bracket, leaders and draft class.');
});

test("a season's link leaves the season page to its own link preview", () => {
    assertOwnLinkPreview(seasonMetadata({ year: 2026, team: 'Dangle Berries', owner: 'Dillon', playoffStatus: 'complete' }));
});

/** a franchise's seasons, of which the one being played is still pending */
const seasons = (count: number, pending = 0) => [
    ...Array.from({ length: count }, () => ({ playoffStatus: 'complete' as const })),
    ...Array.from({ length: pending }, () => ({ playoffStatus: 'pending' as const })),
];

test("a franchise's link counts its seasons and its Jagr Cups", () => {
    const metadata = franchiseMetadata(3, { name: 'Dangle Berries', seasons: seasons(8, 1), championships: [2026, 2023], foldedAfterSeason: null });
    assert.equal(metadata.title, 'Dangle Berries · YOFHL');
    assert.deepEqual(metadata.alternates, { canonical: '/teams/3' });
    assert.equal(metadata.description, "Dangle Berries' YOFHL history: 8 seasons and 2 Jagr Cups, with every season, roster and record.");
});

test('a franchise with no Jagr Cup counts its seasons alone', () => {
    const metadata = franchiseMetadata(5, { name: 'Sens Fan', seasons: seasons(1), championships: [], foldedAfterSeason: null });
    assert.equal(metadata.description, "Sens Fan's YOFHL history: 1 season, with every season, roster and record.");
});

test('a defunct franchise says when it folded', () => {
    const metadata = franchiseMetadata(9, { name: 'Dead Wings', seasons: seasons(4), championships: [2018], foldedAfterSeason: 2019 });
    assert.equal(metadata.description, "Dead Wings' YOFHL history: 4 seasons before folding and 1 Jagr Cup, with every season, roster and record.");
});

test('a franchise that is not in the archive falls back to the franchises page', () => {
    const metadata = franchiseMetadata(404, null);
    assert.equal(metadata.title, 'Franchises · YOFHL');
    assert.deepEqual(metadata.alternates, { canonical: '/teams/stats' });
    assert.equal(metadata.description, FRANCHISES_DESCRIPTION);
    assert.equal(FRANCHISES_DESCRIPTION, "Every YOFHL franchise's all-time record, playoff runs and Jagr Cups.");
    assert.deepEqual(metadata.openGraph?.images, [DEFAULT_PREVIEW_IMAGE]);
});

test("a franchise's link leaves the team page to its own link preview", () => {
    assertOwnLinkPreview(franchiseMetadata(3, { name: 'Dangle Berries', seasons: seasons(8), championships: [2026], foldedAfterSeason: null }));
});

test('the all-time leaderboard says it ranks careers', () => {
    const metadata = leaderboardMetadata('all-time', 'all');
    assert.equal(metadata.title, 'All-time leaderboard · YOFHL');
    assert.deepEqual(metadata.alternates, { canonical: '/stats/all-time/all' });
    assert.equal(metadata.description, "The YOFHL's all-time fantasy point leaders: career totals for every player, by position.");
});

test('the single-season leaderboard says it ranks seasons', () => {
    const metadata = leaderboardMetadata('single-season', 'C');
    assert.equal(metadata.title, 'Single-season leaderboard · YOFHL');
    assert.deepEqual(metadata.alternates, { canonical: '/stats/single-season/C' });
    assert.equal(metadata.description, "The YOFHL's best single seasons: every player season ranked by fantasy points, by position.");
});

test('a matchup record names both teams and the week it was played', () => {
    const metadata = matchupRecordMetadata({ id: 412, awayName: 'Dangle Berries', homeName: 'Sens Fan', year: 2026, round: 7 });
    assert.equal(metadata.title, 'Matchup record · YOFHL');
    assert.deepEqual(metadata.alternates, { canonical: '/records/game/412' });
    assert.equal(metadata.description, 'Dangle Berries vs Sens Fan, 2025–26 Week 7: a YOFHL record matchup.');
    // the record book's evidence pages stay out of search results
    assert.deepEqual(metadata.robots, { index: false, follow: false });
});

test("a matchup the record book doesn't hold sends a reader to the record book, still unindexed", () => {
    const metadata = matchupRecordMetadata(null);
    assert.equal(metadata.title, 'Record book · YOFHL');
    assert.deepEqual(metadata.alternates, { canonical: '/records' });
    assert.equal(metadata.description, RECORD_BOOK_DESCRIPTION);
    assert.deepEqual(metadata.robots, { index: false, follow: false });
});

test("a season's award ballots say whose ballots they are", () => {
    const metadata = seasonBallotsMetadata(2026);
    assert.equal(metadata.title, '2025–26 Award Ballots · YOFHL');
    assert.deepEqual(metadata.alternates, { canonical: '/season/2026/ballots' });
    assert.equal(metadata.description, "Every franchise's award ballot for the 2025–26 YOFHL season.");
});

test("a player's link names the player and leaves the player page to its own link preview", () => {
    const metadata = playerMetadata({ id: 'abc123', name: 'Connor McDavid' });
    assert.equal(metadata.title, 'Connor McDavid · YOFHL');
    assert.deepEqual(metadata.alternates, { canonical: '/player/abc123' });
    assertOwnLinkPreview(metadata);
});

test("Johnny Gaudreau's link remembers him", () => {
    const metadata = playerMetadata({ id: JOHNNY_GAUDREAU_ID, name: 'Johnny Gaudreau' });
    assert.equal(metadata.title, 'Remembering Johnny Gaudreau · YOFHL');
    assert.equal(metadata.description, 'In loving memory of Johnny Gaudreau, 1993–2024. Johnny Hockey, forever part of our game.');
    assertOwnLinkPreview(metadata);
});

// Their subjects are chosen in the query, which unfurlers don't send (docs/adr/0011-link-previews-follow-the-page-not-its-query.md).
test('a player comparison, a head-to-head and an award keep the site-wide preview', () => {
    const award = { name: 'Wayne_Gretzky_Award', label: 'Wayne Gretzky Award', description: 'The regular season scoring champion.' };
    for (const metadata of [playerComparisonMetadata(), headToHeadMetadata(), awardMetadata(award)])
        assert.deepEqual(metadata.openGraph?.images, [DEFAULT_PREVIEW_IMAGE]);
});
