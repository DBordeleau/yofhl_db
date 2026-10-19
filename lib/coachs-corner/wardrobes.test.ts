import assert from 'node:assert/strict';
import test from 'node:test';
import { frameSignature } from '../../components/coachs-corner/use-show';
import { compileAudioCues } from './audio-cues';
import { allArt, artFor, CAST, gestureAfter, resolveGesture } from './cast';
import { parseScript } from './script';
import { compile, frameAt } from './timeline';

const head = '---\ntitle: Wardrobe artwork check\n---\n';
const variants = ['halloween', 'alternate-1', 'alternate-2', 'alternate-3'];

test('ordinary dialogue and default aliases keep the original normal suit', () => {
    for (const alias of ['rest', 'default', 'normal', 'idle', 'talk', 'don-default']) {
        const gesture = resolveGesture('don', alias);
        assert.equal(gesture, 'rest');
        assert.equal(artFor('don', gesture!, false), 'don-default');
        assert.equal(artFor('don', gesture!, true), 'don-talk');
    }
    for (const variant of variants) {
        const script = parseScript(head + `[don: ${variant}-rest]\nDON (${variant}-point): A change of suit.\nDON: Back to normal.\nDON (yell): Same suit!`);
        assert.deepEqual(script.diagnostics, []);
        const tl = compile(script);
        assert.equal(frameAt(tl, tl.lines[0].t0).hosts.don.gesture, `${variant}-point`);
        assert.equal(frameAt(tl, tl.lines[1].t0).hosts.don.gesture, 'rest');
        assert.equal(frameAt(tl, tl.lines[2].t0).hosts.don.gesture, 'angry');
    }
    assert.equal(artFor('don', 'angry', true), 'don-angry-talk');
});

for (const variant of variants) {
    test(`${variant} covers every Don pose without changing standard or Ron gesture resolution`, () => {
        const standard = Object.keys(CAST.don.gestures).filter(id => !variants.some(prefix => id.startsWith(`${prefix}-`)));
        assert.equal(standard.length, 12);
        for (const gesture of standard) {
            const alternate = `${variant}-${gesture}`;
            assert.equal(resolveGesture('don', alternate), alternate);
            assert.equal(resolveGesture('don', gesture), gesture);
            assert.equal(resolveGesture('ron', alternate), null);
            for (const open of [false, true]) {
                assert.equal(artFor('don', alternate, open), artFor('don', gesture, open).replace('don-', `don-${variant}-`));
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
        assert.ok(tl.art.filter(id => id.startsWith('don-')).every(id => id.startsWith(`don-${variant}-`)));
        assert.ok(tl.art.includes(`don-${variant}-thumbs-up-talk`), 'talking pairs preload both faces');
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
