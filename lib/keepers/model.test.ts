import test from 'node:test';
import assert from 'node:assert/strict';
import { CALDER_SEASON, KEEPER_DEADLINE, keeperPosition, keepersOpen, refreshedSelection, remainingKeeperAllowance, rosterFingerprint, submissionStatus, validateKeepers, type KeeperPlayer, type KeeperSubmission } from './model';

const players = (position: string, count: number): KeeperPlayer[] => Array.from({ length: count }, (_, i) => ({
    id: `${position}${i}`, name: `${position} Player ${i}`, position, lineupPosition: position, nhlTeam: 'NHL', status: 'RESERVE',
}));
const roster = [...players('C', 6), ...players('D', 4), ...players('G', 3), { ...players('LW', 1)[0], status: 'MINORS' }];
const regular = ['C0', 'C1', 'C2', 'C3', 'D0', 'D1', 'G0', 'G1'];
const selection = { keptIds: regular, rookieId: null, rookieDeclared: false };

test('position limits, bench and IR, and automatic minor keepers', () => {
    const valid = validateKeepers(roster, selection);
    assert.equal(valid.valid, true); assert.deepEqual(valid.counts, { F: 4, D: 2, G: 2 });
    assert.equal(valid.regularCount, 8);
    assert.equal(valid.minorCount, 1); assert.ok(valid.keptIds.includes('LW0'));
    for (const position of ['C', 'D', 'G']) {
        const keptIds = roster.filter(p => p.position === position).map(p => p.id);
        assert.equal(validateKeepers(roster, { ...selection, keptIds: keptIds.slice(1) }).valid, true, `${position} maximum`);
        assert.equal(validateKeepers(roster, { ...selection, keptIds }).valid, false, `${position} over limit, even below 8 total`);
    }
    const ir = roster.map(p => ({ ...p, status: p.status === 'MINORS' ? 'MINORS' : 'INJURED_RESERVE' }));
    assert.deepEqual(validateKeepers(ir, selection).counts, valid.counts);
    assert.equal(validateKeepers(roster, { ...selection, keptIds: [] }).valid, true, 'limits are maxima, not minimums');
});

test('one declared free rookie can exceed any one position limit', () => {
    for (const rookieId of ['C5', 'D3', 'G2']) {
        const base = rookieId === 'G2' ? ['C0', 'C1', 'C2', 'C3', 'C4', 'D0', 'G0', 'G1'] : ['C0', 'C1', 'C2', 'C3', 'C4', 'D0', 'D1', 'D2'];
        const input = { keptIds: [...base, rookieId], rookieId, rookieDeclared: true, rookieSeason: CALDER_SEASON };
        const result = validateKeepers(roster, input);
        assert.equal(result.valid, true);
        assert.equal(result.regularCount, 8);
        assert.equal(result.keptIds.length, 10, '8 regular + free rookie + automatic minor');
        assert.equal(validateKeepers(roster, { ...input, rookieDeclared: false }).valid, false);
        assert.equal(validateKeepers(roster, { ...input, keptIds: base }).valid, false, 'rookie must be kept');
        assert.equal(validateKeepers(roster, input, { [rookieId]: { status: 'rejected', note: 'Ineligible', reviewedAt: new Date().toISOString(), calderSeason: CALDER_SEASON } }).valid, false);
    }
    assert.equal(validateKeepers(roster, { ...selection, rookieId: 'LW0', rookieDeclared: true }).valid, false, 'minors are already free');
});

test('eight regular keepers includes goalies and excludes only minors and the free rookie', () => {
    const skaters = ['C0', 'C1', 'C2', 'C3', 'C4', 'D0', 'D1', 'D2'];
    assert.equal(validateKeepers(roster, { ...selection, keptIds: skaters }).valid, true);
    const nine = validateKeepers(roster, { ...selection, keptIds: [...skaters, 'G0'] });
    assert.equal(nine.regularCount, 9); assert.equal(nine.valid, false);
    assert.deepEqual(nine.counts, { F: 5, D: 3, G: 1 }, 'within every position limit');
    assert.match(nine.errors.join(' '), /8 regular players total, including goalies/);
    assert.equal(validateKeepers(roster, { ...selection, keptIds: [...skaters.slice(0, -1), 'G0'] }).valid, true, 'a goalie replaces a skater');
    const ten = validateKeepers(roster, { ...selection, keptIds: [...skaters, 'G0', 'G1'] });
    assert.equal(ten.regularCount, 10); assert.equal(ten.valid, false);
    const extraMinor = { ...players('RW', 1)[0], status: 'MINORS' };
    const exempt = validateKeepers([...roster, extraMinor], { keptIds: [...regular, 'C4'], rookieId: 'C4', rookieDeclared: true, rookieSeason: CALDER_SEASON });
    assert.equal(exempt.valid, true); assert.equal(exempt.regularCount, 8); assert.equal(exempt.keptIds.length, 11);
    const movedOut = [...roster, { ...extraMinor, status: 'RESERVE' }];
    const refreshed = refreshedSelection(movedOut, { keptIds: exempt.keptIds, rookieId: 'C4', rookieDeclared: true, rookieSeason: CALDER_SEASON });
    assert.equal(validateKeepers(movedOut, refreshed).valid, false, 'moving a minor to the bench uses a regular slot');
});

test('Calder declarations and reviews must explicitly refer to 2025–2026', () => {
    const input = { keptIds: regular, rookieId: regular[0], rookieDeclared: true };
    assert.equal(validateKeepers(roster, input).valid, false, 'legacy declaration cannot silently change seasons');
    assert.equal(validateKeepers(roster, { ...input, rookieSeason: 2027 }).valid, false);
    const current = { ...input, rookieSeason: CALDER_SEASON };
    assert.equal(validateKeepers(roster, current).valid, true);
    assert.equal(validateKeepers(roster, current, { [regular[0]]: { status: 'rejected', note: 'Old rule', reviewedAt: '2026-10-04', calderSeason: 2027 } }).valid, true, 'a different award season needs a fresh review');
});

test('unused keeper warnings share the total across position options and keep the rookie exemption separate', () => {
    const options = (ids: string[], rookieId: string | null = null) => remainingKeeperAllowance(validateKeepers(roster, {
        keptIds: ids, rookieId, rookieDeclared: Boolean(rookieId), rookieSeason: rookieId ? CALDER_SEASON : null,
    }), rookieId);
    assert.deepEqual(options(['C0', 'C1', 'C2', 'C3', 'C4', 'D0']), { regular: 2, positions: { F: 0, D: 2, G: 2 }, rookie: true });
    assert.deepEqual(options(['C0', 'C1', 'C2', 'C3', 'C4', 'D0', 'D1']), { regular: 1, positions: { F: 0, D: 1, G: 1 }, rookie: true });
    assert.deepEqual(options(regular), { regular: 0, positions: { F: 0, D: 0, G: 0 }, rookie: true }, 'unused position maxima are not extra slots at 8 regular keeps');
    assert.deepEqual(options([...regular, 'C4'], 'C4'), { regular: 0, positions: { F: 0, D: 0, G: 0 }, rookie: false }, 'full allowance needs no warning');
    assert.deepEqual(options(['C0'], 'C0'), { regular: 8, positions: { F: 5, D: 3, G: 2 }, rookie: false }, 'a free rookie and automatic minors do not use regular slots');
    assert.deepEqual(options([]), { regular: 8, positions: { F: 5, D: 3, G: 2 }, rookie: true });
});

test('refresh preserves choices, frees new minors, removes departed players and clears an automatic rookie', () => {
    const original = { keptIds: ['C0', 'C1', 'departed', 'LW0'], rookieId: 'C0', rookieDeclared: true, rookieSeason: CALDER_SEASON };
    const moved = roster.map(player => ({ ...player, status: player.id === 'C0' ? 'MINORS' : player.id === 'LW0' ? 'RESERVE' : player.status }));
    const next = refreshedSelection(moved, original);
    assert.deepEqual(new Set(next.keptIds), new Set(['C0', 'C1', 'LW0']));
    assert.equal(next.rookieId, null); assert.equal(next.rookieDeclared, false);
    const result = validateKeepers(moved, next);
    assert.equal(result.valid, true); assert.equal(result.minorCount, 1); assert.equal(result.counts.F, 2);
    const unchanged = refreshedSelection(roster, { ...original, rookieId: 'C1' });
    assert.equal(unchanged.rookieId, 'C1'); assert.equal(unchanged.rookieDeclared, true);
});

test('invalid IDs, duplicate IDs and unrecognized positions cannot pass validation', () => {
    assert.equal(validateKeepers(roster, { ...selection, keptIds: [...regular, 'foreign-player'] }).valid, false);
    assert.equal(validateKeepers(roster, { ...selection, keptIds: [...regular, regular[0]] }).valid, false);
    assert.equal(validateKeepers([], selection).valid, false);
    assert.equal(validateKeepers([roster[0], roster[0]], { ...selection, keptIds: ['C0'] }).valid, false);
    assert.equal(validateKeepers(players('?', 1), { ...selection, keptIds: ['?0'] }).valid, false);
    assert.equal(keeperPosition({ ...roster[0], position: 'C,LW,RW' }), 'F');
});

test('roster changes invalidate a saved list; cosmetic changes and IR do not', () => {
    const submission: KeeperSubmission = { ...selection, keptIds: validateKeepers(roster, selection).keptIds, franchiseId: 1, seasonYear: 2027, roster, version: 1, rookieReviews: {}, submittedAt: new Date().toISOString(), submittedBy: 'owner' };
    assert.equal(submissionStatus(null), 'missing');
    assert.equal(submissionStatus(submission, roster), 'submitted');
    assert.equal(submissionStatus(submission, roster.slice(1)), 'roster_changed');
    assert.equal(submissionStatus(submission, roster.map(p => ({ ...p, status: 'ACTIVE' }))), 'roster_changed');
    assert.equal(rosterFingerprint(roster), rosterFingerprint([...roster].reverse().map(p => ({ ...p, name: 'New name', nhlTeam: 'NYR', status: p.status === 'MINORS' ? 'MINORS' : 'INJURED_RESERVE' }))));
    assert.equal(submissionStatus({ ...submission, keptIds: [...regular, 'C5'] }), 'invalid');
    assert.equal(submissionStatus({ ...submission, keptIds: [...regular, 'C4', 'D2'] }), 'invalid', 'previously accepted 5F/3D/2G lists require correction');
});

test('deadline closes at exactly 7 p.m. Eastern on Friday October 9, 2026', () => {
    const cutoff = Date.parse(KEEPER_DEADLINE);
    assert.equal(keepersOpen(cutoff - 1), true); assert.equal(keepersOpen(cutoff), false); assert.equal(keepersOpen(cutoff + 1), false);
    assert.equal(new Date(cutoff).toLocaleString('en-US', { timeZone: 'America/Toronto', weekday: 'long', hour: 'numeric', minute: '2-digit' }), 'Friday 7:00 PM');
});
