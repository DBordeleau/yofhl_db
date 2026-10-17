import assert from 'node:assert/strict';
import test from 'node:test';
import { draftRegretEligible, type DraftDevelopmentFacts } from './development';

const pick = { year: 2025, playerId: 'p1', draftedOn: '2024-09-21', positions: 'C,LW' };
const history = (birthDate: string, priorNhlGames: number | null): DraftDevelopmentFacts =>
    ({ draftedOn: pick.draftedOn, birthDate, nhlId: 1, priorNhlGames });

test('the age floor uses the exact draft date and applies regardless of experience or position', () => {
    for (const positions of ['C,LW', 'D', 'G']) {
        assert.equal(draftRegretEligible({ ...pick, positions }, history('2001-09-22', 500)), false, 'Still 22 the day before birthday');
        assert.equal(draftRegretEligible({ ...pick, positions }, history('2001-09-21', 500)), true, 'Turns 23 on draft day');
        assert.equal(draftRegretEligible({ ...pick, positions }, history('2006-06-13', null)), false);
    }
});

test('older development rules use career regular-season experience with strict game cutoffs', () => {
    for (const birthDate of ['2001-05-26', '2000-07-16']) {
        assert.equal(draftRegretEligible(pick, history(birthDate, 81)), false);
        assert.equal(draftRegretEligible(pick, history(birthDate, 82)), true);
        assert.equal(draftRegretEligible({ ...pick, positions: 'D' }, history(birthDate, 81)), false);
    }
    assert.equal(draftRegretEligible(pick, history('1999-07-16', 0)), true, 'Skater age 25 is outside the extension');
    for (const birthDate of ['2001-05-26', '2000-07-16', '1999-07-16']) {
        assert.equal(draftRegretEligible({ ...pick, positions: 'G' }, history(birthDate, 49)), false);
        assert.equal(draftRegretEligible({ ...pick, positions: 'G' }, history(birthDate, 50)), true);
    }
    assert.equal(draftRegretEligible({ ...pick, positions: 'G' }, history('1998-07-16', 0)), true);
});

test('unknown or stale facts cannot label a pick a regret', () => {
    assert.equal(draftRegretEligible(pick, null), false);
    assert.equal(draftRegretEligible({ ...pick, playerId: null }, history('1990-01-01', 500)), false);
    assert.equal(draftRegretEligible({ ...pick, draftedOn: '2024-09-22' }, history('1990-01-01', 500)), false);
    assert.equal(draftRegretEligible(pick, history('invalid', 500)), false);
    assert.equal(draftRegretEligible(pick, history('2001-05-26', null)), false);
    assert.equal(draftRegretEligible(pick, history('1990-01-01', null)), true, 'Veterans only need a verified age');
});

test('audited examples protect young NHL regulars and reassess the player each draft', () => {
    const actual = (year: number, birthDate: string, games: number) => {
        const draftedOn = year === 2025 ? '2024-09-21' : '2025-10-04';
        return draftRegretEligible({ ...pick, year, draftedOn }, { ...history(birthDate, games), draftedOn });
    };
    assert.equal(actual(2025, '2002-04-08', 147), false, 'Drysdale at 22, despite 147 previous games');
    assert.equal(actual(2025, '2001-05-26', 39), false, 'Kolyachonok at 23 with 39 games');
    assert.equal(actual(2025, '2000-07-16', 79), false, 'Berggren at 24 with 79 games');
    assert.equal(actual(2025, '2001-09-19', 104), true, 'Quinn had turned 23');
    assert.equal(actual(2026, '2002-10-18', 198), false, 'Johnson was still 22 on draft day');
    assert.equal(actual(2026, '2002-04-08', 217), true, 'Drysdale is reassessed at 23 the next year');
    assert.equal(actual(2026, '2001-09-23', 185), true, 'Rossi at 24');
    assert.equal(actual(2026, '2002-08-19', 260), true, 'Byfield at 23');
});
