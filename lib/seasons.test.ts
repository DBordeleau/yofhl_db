import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublished, neighbours, seasonArchive, seasonLabel } from './seasons';

const season = (year: number, team: string | null, playoffStatus: 'complete' | 'cancelled' = 'complete') => ({ year, team, playoffStatus });
const rows = [season(2019, 'Hub City'), season(2020, null, 'cancelled'), season(2021, 'Paddyville'), season(2026, 'Sudbury'), season(2027, null)];

test('published seasons are champions and the cancelled season, newest first', () => {
    const archive = seasonArchive(rows);
    assert.deepEqual(archive.published.map(s => s.year), [2026, 2021, 2020, 2019]);
    assert.deepEqual(archive.seasons.map(s => s.year), [2019, 2020, 2021, 2026, 2027]);
});

test('latest is the newest published season and current the newest unpublished one', () => {
    const archive = seasonArchive(rows);
    assert.equal(archive.latest?.year, 2026);
    assert.equal(archive.current?.year, 2027);
});

test('there is no current season once every season is published', () => {
    const archive = seasonArchive(rows.slice(0, 4));
    assert.equal(archive.latest?.year, 2026);
    assert.equal(archive.current, null);
});

test('an empty archive has no latest or current season', () => {
    assert.deepEqual(seasonArchive([]), { seasons: [], published: [], latest: null, current: null });
});

test('neighbours skip unpublished seasons and keep the cancelled one', () => {
    const archive = seasonArchive(rows);
    assert.deepEqual(neighbours(archive, 2026), { newer: null, older: 2021 });
    assert.deepEqual(neighbours(archive, 2019), { newer: 2020, older: null });
    assert.deepEqual(neighbours(archive, 2020), { newer: 2021, older: 2019 });
    assert.deepEqual(neighbours(archive, 2021), { newer: 2026, older: 2020 });
});

test('only published years are published', () => {
    const archive = seasonArchive(rows);
    assert.equal(isPublished(archive, 2020), true);
    assert.equal(isPublished(archive, 2026), true);
    assert.equal(isPublished(archive, 2027), false, 'an incomplete import');
    assert.equal(isPublished(archive, 1999), false, 'an unknown year');
});

test('season labels name both years with an en dash', () => {
    assert.equal(seasonLabel(2027), '2026–27');
    assert.equal(seasonLabel(2020), '2019–20');
});
