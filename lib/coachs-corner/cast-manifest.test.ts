import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../../assets/coachs-corner/robots-v2/manifest.json';
import media from './media.json';
import { allArt, CAST, CHARACTERS, WARDROBES } from './cast';

// ADR 0002: the art manifest is a catalog runtime code never reads, so cast and the manifest
// must be kept in agreement by this test instead.

test('cast’s wardrobes match the manifest’s, host by host', () => {
    const catalog = Object.entries(manifest.wardrobes).map(([id, w]) => ({ id, host: w.character, prefix: w.gesturePrefix }));
    for (const host of CHARACTERS) {
        const listed = catalog.filter(w => w.host === host);
        // The manifest names a wardrobe only where a host has more than one; Ron is drawn in normal alone.
        const expected = listed.length ? listed : [{ id: 'normal', host, prefix: '' }];
        assert.deepEqual(WARDROBES.filter(w => w.host === host).map(w => ({ id: w.id, host: w.host, prefix: w.prefix })), expected);
    }
});

test('each host’s wardrobe prefixes are unique and only normal has none', () => {
    for (const host of CHARACTERS) {
        const prefixes = WARDROBES.filter(w => w.host === host).map(w => w.prefix);
        assert.equal(new Set(prefixes).size, prefixes.length, `${host}: a yearly wardrobe needs its own prefix`);
        assert.deepEqual(WARDROBES.filter(w => w.host === host && !w.prefix).map(w => w.id), ['normal']);
    }
});

test('cast’s mouth pairs are the manifest’s mouth pairs', () => {
    const pairs = CHARACTERS.flatMap(who => Object.values(CAST[who].gestures))
        .filter(g => g.closed && g.open && g.closed !== g.open).map(g => `${g.closed} ${g.open}`);
    assert.deepEqual(pairs.sort(), manifest.mouthPairs.map(([closed, open]) => `${closed} ${open}`).sort());
});

test('every pose cast can produce is a catalogued asset that ships', () => {
    const assets = new Map(manifest.assets.map(a => [a.id, a]));
    for (const who of CHARACTERS) for (const pose of allArt(who)) {
        assert.equal(assets.get(pose)?.character, who, `${pose} is missing from the manifest`);
        for (const size of ['', '-640']) assert.ok(`/coachs-corner/robots-v2/${pose}${size}.avif` in media, `${pose}${size} is missing from media.json`);
    }
});

test('every pose in a wardrobe is catalogued under that wardrobe', () => {
    const assets = new Map(manifest.assets.map(a => [a.id, a as { wardrobe?: string }]));
    for (const wardrobe of WARDROBES.filter(w => w.prefix)) {
        const poses = allArt(wardrobe.host).filter(pose => assets.get(pose)?.wardrobe === wardrobe.id);
        assert.equal(poses.length, manifest.wardrobes[wardrobe.id as keyof typeof manifest.wardrobes].poseCount, wardrobe.id);
    }
});
