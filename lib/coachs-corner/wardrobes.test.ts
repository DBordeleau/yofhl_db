import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HostArtwork } from '../../components/coachs-corner/artwork';
import { compileAudioCues } from './audio-cues';
import { actionsOf, allArt, artFor, CAST, CHARACTERS, gestureAfter, resolveGesture, wardrobesOf, type CharacterId } from './cast';
import { parseScript } from './script';
import { compile, frameAt, frameSignature } from './timeline';

const head = '---\ntitle: Wardrobe artwork check\n---\n';
// every wardrobe besides normal, as its gesture prefix without the trailing dash
const variants = wardrobesOf('don').filter(w => w.prefix).map(w => w.prefix.slice(0, -1));

test('Don’s wardrobes include this season’s suits', () => {
    assert.deepEqual(variants, ['halloween', 'alternate-1', 'alternate-2', 'alternate-3', 'remembrance']);
});

test('ordinary dialogue and default aliases keep the original normal suit', () => {
    for (const alias of ['rest', 'default', 'normal', 'idle', 'talk', 'don-default']) {
        const gesture = resolveGesture('don', alias);
        assert.equal(gesture, 'rest');
        assert.equal(artFor('don', gesture!, { mouth: 'closed' }), 'don-default');
        assert.equal(artFor('don', gesture!, { mouth: 'open' }), 'don-talk');
    }
    for (const variant of variants) {
        const script = parseScript(head + `[don: ${variant}-rest]\nDON (${variant}-point): A change of suit.\nDON: Back to normal.\nDON (yell): Same suit!`);
        assert.deepEqual(script.diagnostics, []);
        const tl = compile(script);
        assert.equal(frameAt(tl, tl.lines[0].t0).hosts.don.gesture, `${variant}-point`);
        assert.equal(frameAt(tl, tl.lines[1].t0).hosts.don.gesture, 'rest');
        assert.equal(frameAt(tl, tl.lines[2].t0).hosts.don.gesture, 'angry');
    }
    assert.equal(artFor('don', 'angry', { mouth: 'open' }), 'don-angry-talk');
});

for (const variant of variants) {
    test(`${variant} covers every Don pose without changing standard or Ron gesture resolution`, () => {
        const standard = Object.keys(CAST.don.gestures).filter(id => !variants.some(prefix => id.startsWith(`${prefix}-`)));
        assert.equal(standard.length, actionsOf('don').length);
        for (const gesture of standard) {
            const alternate = `${variant}-${gesture}`;
            assert.equal(resolveGesture('don', alternate), alternate);
            assert.equal(resolveGesture('don', gesture), gesture);
            assert.equal(resolveGesture('ron', alternate), null);
            for (const mouth of ['closed', 'open'] as const) {
                assert.equal(artFor('don', alternate, { mouth }), artFor('don', gesture, { mouth }).replace('don-', `don-${variant}-`));
            }
        }
        assert.equal(allArt('don').filter(id => id.startsWith(`don-${variant}-`)).length, 15);
        assert.equal(resolveGesture('don', `don-${variant}-thumbs-up-talk`), `${variant}-thumbs`);
        assert.equal(resolveGesture('don', `${variant}-default`), `${variant}-rest`);
        assert.equal(resolveGesture('don', `${variant}-desk-pound-ready`), `${variant}-pound-ready`);
        assert.equal(resolveGesture('don', `${variant}-missing`), null);
    });

    test(`${variant} expressions return to matching rest and closed poses hold their outfit`, () => {
        for (const gesture of ['angry', 'surprised', 'lean']) {
            assert.equal(gestureAfter('don', `${variant}-${gesture}`), `${variant}-rest`);
            assert.equal(gestureAfter('don', gesture), 'rest');
        }
        assert.equal(gestureAfter('don', `${variant}-point`), `${variant}-point`);
        const script = parseScript(head + `[don: ${variant}-rest]\nDON (${variant}-angry, yell): What a suit!\nRON: Yes.\nDON (${variant}-thumbs, then ${variant}-stare): Thanks.`);
        assert.deepEqual(script.diagnostics, []);
        const tl = compile(script);
        assert.equal(frameAt(tl, tl.lines[0].t0).hosts.don.gesture, `${variant}-angry`);
        assert.equal(frameAt(tl, tl.lines[1].t0).hosts.don.gesture, `${variant}-rest`);
        assert.equal(frameAt(tl, tl.lines[2].end).hosts.don.gesture, `${variant}-stare`);
        assert.ok(tl.art.don.every(id => id.startsWith(`don-${variant}-`)));
        assert.ok(tl.art.don.includes(`don-${variant}-thumbs-up-talk`), 'talking pairs preload both faces');
        assert.deepEqual(tl.art.ron, ['ron-default', 'ron-talk']);
    });

    test(`${variant} lean uses the automatic close-up and respects explicit camera direction`, () => {
        const automatic = compile(parseScript(head + `DON (${variant}-lean): Look at me.`));
        assert.equal(frameAt(automatic, automatic.lines[0].t0).shot, 'close don');
        assert.equal(frameAt(automatic, automatic.lines[0].t1).shot, 'wide');
        const explicit = compile(parseScript(head + `[cam: monitor]\nDON (${variant}-lean): Look at me.`));
        assert.equal(frameAt(explicit, explicit.lines[0].t0).shot, 'monitor');
    });

    test(`${variant} tie Foley and desk contact retain show-time behavior`, () => {
        const script = parseScript(head + `[don: ${variant}-rest]\nRON: Nice suit.\n[don: ${variant}-tie, 300ms]\n[don: ${variant}-pound-ready, 220ms]\n[don: ${variant}-pound, sfx: desk-pound, 480ms]\nDON (${variant}-point): Enough.`);
        assert.deepEqual(script.diagnostics, []);
        const tl = compile(script);
        const cues = compileAudioCues(tl);
        const ties = cues.filter(cue => cue.id === 'tie');
        assert.equal(ties.length, 1);
        assert.equal(ties[0].t, tl.lines[0].end);
        const contacts = cues.filter(cue => cue.id === 'desk-pound');
        assert.equal(contacts.length, 1);
        const contact = contacts[0].t;
        assert.equal(frameAt(tl, contact - 1).hosts.don.gesture, `${variant}-pound-ready`);
        assert.equal(frameAt(tl, contact).hosts.don.gesture, `${variant}-pound`);
        assert.equal(frameAt(tl, contact - 100).hosts.don.gestureMs, 120, 'seeking restores anticipation');
        const signatureAt = (ms: number) => frameSignature(frameAt(tl, contact + ms));
        assert.notEqual(signatureAt(0), signatureAt(80), 'silent contact animates during playback');
        assert.notEqual(signatureAt(144), signatureAt(160), 'the impact clears at its final update');
        assert.equal(signatureAt(160), signatureAt(170), 'settled holds stop updating');
        const openingTie = compile(parseScript(head + `[don: ${variant}-tie]\nDON (${variant}-rest): Hello.`));
        assert.equal(compileAudioCues(openingTie).filter(cue => cue.id === 'tie').length, 0);
    });
}

const poppy = (who: CharacterId, gesture: string) => renderToStaticMarkup(createElement(HostArtwork, { who, gesture, open: false, art: allArt(who), lapel: 'poppy' }))
    .match(/<svg[^>]*data-lapel[^>]*>\s*<g style="([^"]*)"/)![1];

test('the poppy sits on each pose’s lapel and hides behind Don’s mic hand', () => {
    assert.equal(poppy('don', 'rest'), 'transform:translate(840px, 665px) scale(0.85);opacity:1');
    assert.equal(poppy('don', 'point'), 'transform:translate(777px, 665px) scale(0.85);opacity:1');
    assert.equal(poppy('don', 'lean'), 'transform:translate(853px, 646px) scale(1);opacity:1');
    assert.match(poppy('don', 'mic'), /opacity:0/);
    assert.equal(poppy('ron', 'rest'), 'transform:translate(821px, 708px) scale(0.85);opacity:1');
    assert.equal(poppy('ron', 'down'), poppy('ron', 'rest'));
});

test('every wardrobe places the poppy exactly where the normal wardrobe does', () => {
    for (const who of CHARACTERS) for (const wardrobe of wardrobesOf(who)) for (const action of actionsOf(who)) {
        assert.equal(poppy(who, wardrobe.prefix + action), poppy(who, action), `${who}/${wardrobe.id}/${action}`);
    }
});
