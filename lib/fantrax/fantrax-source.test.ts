import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestFantraxTeamsQuery } from './fantrax-source';
import { disposableLeague } from '../testing/disposable-league';

test('the live season reads the Fantrax league and teams of the latest season in league.fantrax_teams', async t => {
    const { db } = await disposableLeague(t, { seed: `
        insert into league.franchises (id, display_name, first_season) values (1, 'One', 2026), (2, 'Two', 2026);
        insert into league.fantrax_teams values
            (2026, 'league26', 'old1', 1), (2026, 'league26', 'old2', 2),
            (2027, 'league27', 'new1', 1), (2027, 'league27', 'new2', 2);
    ` });
    assert.deepEqual((await db.execute(latestFantraxTeamsQuery)).rows, [
        { seasonYear: 2027, fantraxLeagueId: 'league27', fantraxTeamId: 'new1', franchiseId: 1 },
        { seasonYear: 2027, fantraxLeagueId: 'league27', fantraxTeamId: 'new2', franchiseId: 2 },
    ]);
});
