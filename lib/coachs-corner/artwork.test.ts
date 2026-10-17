import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HostArtwork } from '../../components/coachs-corner/artwork';
import { allArt, artFor, CAST, CHARACTERS } from './cast';
import { artUrl } from './media';

test('mouth animation keeps the same body visible and confines changes to the face', () => {
    for (const who of CHARACTERS) for (const [gesture, poses] of Object.entries(CAST[who].gestures)) {
        if (!poses.closed || !poses.open || poses.closed === poses.open) continue;
        const images = (open: boolean) => renderToStaticMarkup(createElement(HostArtwork, {
            who, gesture, open, art: allArt(who),
        })).match(/<img\b[^>]*>/g)!;
        const find = (rows: string[], pose: string) => rows.find(img => img.includes(`src="${artUrl(pose, true)}"`))!;
        const closed = images(false), speaking = images(true);
        assert.equal(find(speaking, poses.closed), find(closed, poses.closed), `${who}/${gesture}: mouth flaps must not hide or alter the body`);
        assert.match(find(speaking, poses.closed), /data-on="true"/);
        assert.match(find(speaking, poses.open), /data-on="true"/);
        assert.match(find(speaking, poses.open), /clip-path:/, 'the talking illustration must be clipped to its mouth');
        const clip = find(speaking, poses.open).match(/ellipse\((\d+)% (\d+)% at (\d+)% (\d+)%\)/)!;
        assert.ok(clip, 'use an explicit face boundary');
        const [, rx, ry, x, y] = clip.map(Number);
        assert.ok(y + ry <= 52 && y - ry >= 30 && x - rx >= 30 && x + rx <= 70,
            'the mouth overlay must stay inside the face, clear of clothes, hands and hair');
        assert.match(find(speaking, poses.open), /data-mouth="true"/);
        assert.doesNotMatch(find(closed, poses.open), /data-on="true"/);
    }
});

test('single-pose expressions still show the complete original gesture', () => {
    for (const who of CHARACTERS) for (const [gesture, poses] of Object.entries(CAST[who].gestures)) {
        if (poses.closed && poses.open && poses.closed !== poses.open) continue;
        for (const open of [false, true]) {
            const html = renderToStaticMarkup(createElement(HostArtwork, { who, gesture, open, art: allArt(who) }));
            const active = html.match(/<img\b[^>]*data-on="true"[^>]*>/g)!;
            assert.equal(active.length, 1);
            assert.ok(active[0].includes(`src="${artUrl(artFor(who, gesture, open), true)}"`));
            assert.doesNotMatch(active[0], /clip-path:|data-mouth/);
        }
    }
});
