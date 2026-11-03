import assert from 'node:assert/strict';
import test from 'node:test';
import { fantraxSeasonName, nhlSeasonId, seasonYearFromFantrax } from './season';

test('Fantrax names a season by the year it starts in; the archive by the year it ends in', () => {
    assert.equal(seasonYearFromFantrax(2026), 2027);
    assert.equal(seasonYearFromFantrax(2018), 2019);
});

test('external season names are built from the season year', () => {
    assert.equal(fantraxSeasonName(2027), '2026-27 Reg Season - YTD');
    assert.equal(fantraxSeasonName(2020), '2019-20 Reg Season - YTD');
    assert.equal(nhlSeasonId(2027), 20262027);
    assert.equal(nhlSeasonId(2020), 20192020);
});
