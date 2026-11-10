import assert from 'node:assert/strict';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
import { disposableLeague, type LeagueOptions } from '@/lib/testing/disposable-league';
import type { Db } from './connect';
import type { DraftFactsLoader } from './draft-development';
import { loadLeagueConfig } from './league-config';
import { importSeasons, readLegacySeeds, type LegacySeeds } from './season-import';

// The season statuses the import returns (and the script prints), and the admin season checklist reading
// the same ones, both run against the invented league in season-import-fixture/.

const FIXTURE = path.join('scripts', 'db', 'lib', 'season-import-fixture');
const fixtureLegacy = () => readLegacySeeds(path.join(FIXTURE, 'legacy-awards.json'), path.join(FIXTURE, 'legacy-championship-rosters.json'));

// Stands in for the NHL lookups, so no test reaches the network.
const draftFacts: DraftFactsLoader = async (pick) => ({ nhlId: 9000 + pick.overall, birthDate: '2004-06-01', draftedOn: pick.draftedOn, priorNhlGames: null });

async function importFixture(t: TestContext, { league = {}, legacy = fixtureLegacy() }: { league?: LeagueOptions; legacy?: LegacySeeds } = {}) {
    const db = drizzle((await disposableLeague(t, league)).client, { schema });
    const result = await importSeasons({
        db: db as unknown as Db,
        config: loadLeagueConfig(path.join(FIXTURE, 'league.yml')),
        dataDir: path.join(FIXTURE, 'data'),
        seasons: [],
        legacy,
        loadDraftFacts: draftFacts,
    });
    if (!result.ok) throw new Error(`The fixture import failed: ${result.errors.join('; ')}`);
    return result;
}

test('a clean import returns each season\'s status', async (t) => {
    const { statuses } = await importFixture(t);

    assert.deepEqual(statuses, [{
        year: 2026,
        label: '2025–26',
        playoffStatus: 'complete',
        teams: 6,
        players: 12,
        games: 4,
        champion: 'Ashgrove Anglers',
        roster: 3,
        awards: 2,
        awardsExpected: 2,
        overrides: 0,
    }]);
});

test('co-winners of one award count once', async (t) => {
    const legacy = fixtureLegacy();
    legacy.awards.push({ season: 2026, award: 'Top Gun Award', playerId: '*0fx02*', player: 'Ben Birch', team: 'Brimley Badgers' });
    const { statuses } = await importFixture(t, { legacy });

    assert.equal(statuses[0].awards, 2);
});

test('the admin season checklist reads the same statuses the import returns', async (t) => {
    const { statuses } = await importFixture(t, { league: { app: true } });
    const { getSeasonStatuses } = await import('@/lib/admin/data');

    assert.deepEqual(await getSeasonStatuses(), statuses);
});
