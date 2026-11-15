import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calderEligible } from './calder';

// The 2026–27 season (season year 2027): ages count on September 15, 2026, and every NHL season before 2026–27 is earlier.
const BORN_YOUNG = '2004-03-01';
const cases: [string, { birthDate: string; seasons: [number, number][] }, boolean][] = [
    ['a player with no NHL games', { birthDate: BORN_YOUNG, seasons: [] }, true],
    ['25 games in an earlier season', { birthDate: BORN_YOUNG, seasons: [[20252026, 25]] }, true],
    ['26 games in an earlier season', { birthDate: BORN_YOUNG, seasons: [[20252026, 26]] }, false],
    ['26 games in a season long before', { birthDate: BORN_YOUNG, seasons: [[20212022, 26], [20252026, 0]] }, false],
    ['six games in each of two earlier seasons', { birthDate: BORN_YOUNG, seasons: [[20232024, 6], [20252026, 6]] }, false],
    ['six games in one earlier season and five in another', { birthDate: BORN_YOUNG, seasons: [[20232024, 6], [20242025, 5]] }, true],
    ['five games in each of three earlier seasons', { birthDate: BORN_YOUNG, seasons: [[20222023, 5], [20232024, 5], [20242025, 5]] }, true],
    ['any number of games in the season itself', { birthDate: BORN_YOUNG, seasons: [[20252026, 10], [20262027, 82]] }, true],
    ['a 26th birthday on September 15', { birthDate: '2000-09-15', seasons: [] }, false],
    ['a 26th birthday the day after September 15', { birthDate: '2000-09-16', seasons: [] }, true],
    ['a 26th birthday before September 15', { birthDate: '2000-09-14', seasons: [] }, false],
];

for (const [name, { birthDate, seasons }, eligible] of cases) {
    test(`the Calder rule for the 2026–27 season: ${name} is ${eligible ? '' : 'not '}eligible`, () => {
        const record = { nhlId: 8480000, birthDate, seasons: seasons.map(([season, games]) => ({ season, games })) };
        assert.equal(calderEligible(record, 2027), eligible);
    });
}
