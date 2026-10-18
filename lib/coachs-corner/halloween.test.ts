import assert from 'node:assert/strict';
import test from 'node:test';
import { frameSignature } from '../../components/coachs-corner/use-show';
import { compileAudioCues } from './audio-cues';
import { allArt, artFor, CAST, gestureAfter, resolveGesture } from './cast';
import { parseScript } from './script';
import { compile, frameAt } from './timeline';

const head = '---\ntitle: Halloween artwork check\n---\n';

test('ordinary dialogue and default aliases keep the original normal suit', () => {
    for (const alias of ['rest', 'default', 'normal', 'idle', 'talk', 'don-default']) {
        const gesture = resolveGesture('don', alias);
        assert.equal(gesture, 'rest');
        assert.equal(artFor('don', gesture!, false), 'don-default');
        assert.equal(artFor('don', gesture!, true), 'don-talk');
    }
    const script = parseScript(head + '[don: halloween-rest]\nDON (halloween-point): Special occasion.\nDON: Back to normal.\nDON (yell): Same suit!');
    assert.deepEqual(script.diagnostics, []);
    const tl = compile(script);
    assert.equal(frameAt(tl, tl.lines[0].t0).hosts.don.gesture, 'halloween-point');
    assert.equal(frameAt(tl, tl.lines[1].t0).hosts.don.gesture, 'rest');
    assert.equal(frameAt(tl, tl.lines[2].t0).hosts.don.gesture, 'angry');
    assert.equal(artFor('don', 'angry', true), 'don-angry-talk');
});

test('Halloween covers every Don pose without changing standard or Ron gesture resolution', () => {
    const standard = Object.keys(CAST.don.gestures).filter(id => !id.startsWith('halloween-'));
    for (const gesture of standard) {
        const seasonal = `halloween-${gesture}`;
        assert.equal(resolveGesture('don', seasonal), seasonal);
        assert.equal(resolveGesture('don', gesture), gesture);
        assert.equal(resolveGesture('ron', seasonal), null);
        for (const open of [false, true]) {
            assert.equal(artFor('don', seasonal, open), artFor('don', gesture, open).replace('don-', 'don-halloween-'));
        }
    }
    assert.equal(allArt('don').filter(id => id.startsWith('don-halloween-')).length, 15);
    assert.equal(resolveGesture('don', 'don-halloween-thumbs-up-talk'), 'halloween-thumbs');
    assert.equal(resolveGesture('don', 'halloween-default'), 'halloween-rest');
    assert.equal(resolveGesture('don', 'halloween-desk-pound-ready'), 'halloween-pound-ready');
    assert.equal(resolveGesture('don', 'halloween-missing'), null);
});

test('seasonal expressions return to seasonal rest and closed poses hold their outfit', () => {
    for (const gesture of ['angry', 'surprised', 'lean']) {
        assert.equal(gestureAfter('don', `halloween-${gesture}`), 'halloween-rest');
        assert.equal(gestureAfter('don', gesture), 'rest');
    }
    assert.equal(gestureAfter('don', 'halloween-point'), 'halloween-point');
    const script = parseScript(head + '[don: halloween-rest]\nDON (halloween-angry, yell): What a suit!\nRON: Yes.\nDON (halloween-thumbs, then halloween-stare): Thanks.');
    assert.deepEqual(script.diagnostics, []);
    const tl = compile(script);
    assert.equal(frameAt(tl, tl.lines[0].t0).hosts.don.gesture, 'halloween-angry');
    assert.equal(frameAt(tl, tl.lines[1].t0).hosts.don.gesture, 'halloween-rest');
    assert.equal(frameAt(tl, tl.lines[2].end).hosts.don.gesture, 'halloween-stare');
    assert.ok(tl.art.filter(id => id.startsWith('don-')).every(id => id.startsWith('don-halloween-')));
    assert.ok(tl.art.includes('don-halloween-thumbs-up-talk'), 'talking pairs preload both faces');
});

test('Halloween lean uses the automatic close-up and respects explicit camera direction', () => {
    const automatic = compile(parseScript(head + 'DON (halloween-lean): Look at me.'));
    assert.equal(frameAt(automatic, automatic.lines[0].t0).shot, 'close don');
    assert.equal(frameAt(automatic, automatic.lines[0].t1).shot, 'wide');
    const explicit = compile(parseScript(head + '[cam: monitor]\nDON (halloween-lean): Look at me.'));
    assert.equal(frameAt(explicit, explicit.lines[0].t0).shot, 'monitor');
});

test('Halloween tie Foley and desk contact retain show-time behavior', () => {
    const script = parseScript(head + '[don: halloween-rest]\nRON: Nice suit.\n[don: halloween-tie, 300ms]\n[don: halloween-pound-ready, 220ms]\n[don: halloween-pound, sfx: desk-pound, 480ms]\nDON (halloween-point): Enough.');
    assert.deepEqual(script.diagnostics, []);
    const tl = compile(script);
    const cues = compileAudioCues(tl);
    const ties = cues.filter(cue => cue.id === 'tie');
    assert.equal(ties.length, 1);
    assert.equal(ties[0].t, tl.lines[0].end);
    const contacts = cues.filter(cue => cue.id === 'desk-pound');
    assert.equal(contacts.length, 1);
    const contact = contacts[0].t;
    assert.equal(frameAt(tl, contact - 1).hosts.don.gesture, 'halloween-pound-ready');
    assert.equal(frameAt(tl, contact).hosts.don.gesture, 'halloween-pound');
    assert.equal(frameAt(tl, contact - 100).hosts.don.gestureMs, 120, 'seeking restores anticipation');
    const signatureAt = (ms: number) => frameSignature(frameAt(tl, contact + ms));
    assert.notEqual(signatureAt(0), signatureAt(80), 'silent contact animates during playback');
    assert.notEqual(signatureAt(144), signatureAt(160), 'the impact clears at its final update');
    assert.equal(signatureAt(160), signatureAt(170), 'settled holds stop updating');
    const openingTie = compile(parseScript(head + '[don: halloween-tie]\nDON (halloween-rest): Hello.'));
    assert.equal(compileAudioCues(openingTie).filter(cue => cue.id === 'tie').length, 0);
});
