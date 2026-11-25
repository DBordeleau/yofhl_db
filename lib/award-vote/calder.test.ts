import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nhlPlayer, nhlSeason } from '@/lib/nhl/memory-nhl';
import { calderEligible } from './calder';

// The 2026–27 season (season year 2027): ages count on September 15, 2026, and every NHL season before 2026–27 is earlier.
const BORN_YOUNG = '2004-03-01';
const cases: [string, { birthDate: string; seasons: [number, number][] }, boolean][] = [
    ['a player with no NHL games', { birthDate: BORN_YOUNG, seasons: [] }, true],
    ['25 games in an earlier season', { birthDate: BORN_YOUNG, seasons: [[2026, 25]] }, true],
    ['26 games in an earlier season', { birthDate: BORN_YOUNG, seasons: [[2026, 26]] }, false],
    ['26 games in a season long before', { birthDate: BORN_YOUNG, seasons: [[2022, 26], [2026, 0]] }, false],
    ['six games in each of two earlier seasons', { birthDate: BORN_YOUNG, seasons: [[2024, 6], [2026, 6]] }, false],
    ['six games in one earlier season and five in another', { birthDate: BORN_YOUNG, seasons: [[2024, 6], [2025, 5]] }, true],
    ['five games in each of three earlier seasons', { birthDate: BORN_YOUNG, seasons: [[2023, 5], [2024, 5], [2025, 5]] }, true],
    ['any number of games in the season itself', { birthDate: BORN_YOUNG, seasons: [[2026, 10], [2027, 82]] }, true],
    ['a 26th birthday on September 15', { birthDate: '2000-09-15', seasons: [] }, false],
    ['a 26th birthday the day after September 15', { birthDate: '2000-09-16', seasons: [] }, true],
    ['a 26th birthday before September 15', { birthDate: '2000-09-14', seasons: [] }, false],
];

const seasonsOf = (seasons: [number, number][]) => Object.fromEntries(seasons.map(([year, games]) => [year, nhlSeason({ games })]));

for (const [name, { birthDate, seasons }, eligible] of cases) {
    test(`the Calder rule for the 2026–27 season: ${name} is ${eligible ? '' : 'not '}eligible`, () => {
        assert.equal(calderEligible(nhlPlayer({ birthDate, seasons: seasonsOf(seasons) }), 2027), eligible);
    });
}

test('the Calder rule cannot judge a player with no birth date, no season history or a season of missing games', () => {
    assert.equal(calderEligible(nhlPlayer({ birthDate: null }), 2027), null);
    assert.equal(calderEligible(nhlPlayer({ seasons: null }), 2027), null);
    assert.equal(calderEligible(nhlPlayer({ seasons: { ...seasonsOf([[2025, 3]]), 2026: nhlSeason() } }), 2027), null);
});
