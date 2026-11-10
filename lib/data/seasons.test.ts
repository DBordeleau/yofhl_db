import assert from 'node:assert/strict';
import test from 'node:test';
import { disposableLeague } from '../testing/disposable-league';

// The season archive every page lists seasons from (GLOSSARY.md, "Seasons"), read through the real migrations.
test('the season archive lists champion and cancelled seasons, and leaves an incomplete import as the current season', async t => {
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: `
        insert into league.seasons values (2020, '2019–20', 'cancelled'), (2026, '2025–26', 'complete'), (2027, '2026–27', 'complete');
        insert into league.franchises (id, display_name, first_season) values (1, 'One', 2020), (2, 'Two', 2020);
        insert into league.team_seasons (id, season_year, franchise_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against)
        values (1, 2026, 1, 'Team One', 'Team One', 'T1', 1, 1, 10, 5, 0, 1000, 500), (2, 2026, 2, 'Team Two', 'Team Two', 'T2', 1, 2, 5, 10, 0, 900, 600);
        insert into league.matchups (season_year, stage, round, bracket, slot, away_team_season_id, home_team_season_id, away_score, home_score, winner_team_season_id)
        values (2026, 'playoff', 1, 'championship', 1, 1, 2, 100, 90, 1);
    ` });
    const { getBannerSeasons, getSeasonArchive } = await import('./league');

    const archive = await getSeasonArchive();
    assert.deepEqual(archive.published.map(season => [season.year, season.team]), [[2026, 'Team One'], [2020, null]]);
    assert.equal(archive.latest?.year, 2026);
    assert.equal(archive.current?.year, 2027, 'the 2027 import has no champion yet');
    assert.deepEqual(archive.seasons.map(season => season.year), [2020, 2026, 2027]);

    const before = league.queries();
    await getBannerSeasons();
    await getSeasonArchive();
    assert.equal(league.queries(), before, 'the archive shares the banner seasons cache entry');
});
