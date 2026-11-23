import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { disposableLeague } from '../../../lib/testing/disposable-league';

// The migration that stores each award under its catalogue ID and drops the award table
// (docs/adr/0009-awards-are-catalogue-ids.md), run on a league migrated through the one before it and seeded with
// awards keyed by the award table's names.

const league = (t: TestContext, awards: string) => disposableLeague(t, { migrateThrough: '0032', seed: `
    INSERT INTO league.seasons (year, label, playoff_status) VALUES (2024, '2023–24', 'complete'), (2025, '2024–25', 'complete');
    INSERT INTO league.franchises (id, display_name, first_season) VALUES (1, 'Ashgrove Anglers', 2019), (2, 'Brookfield Bears', 2019);
    INSERT INTO league.team_seasons (id, season_year, franchise_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against) VALUES
        (1, 2024, 1, 'Ashgrove Anglers', 'Ashgrove Anglers', 'ASH', 1, 1, 30, 14, 2, 4600, 4000),
        (2, 2025, 1, 'Ashgrove Anglers', 'Ashgrove Anglers', 'ASH', 1, 1, 28, 16, 2, 4500, 4100),
        (3, 2025, 2, 'Brookfield Bears', 'Brookfield Bears', 'BRK', 1, 2, 20, 24, 2, 4200, 4300);
    INSERT INTO league.players (id, name) VALUES ('0aa01', 'Ann Able'), ('0aa02', 'Bo Bell'), ('0aa03', 'Cy Cole');
    INSERT INTO league.player_seasons (player_id, season_year, team_season_id, nhl_team, positions, fpts, fpg) VALUES
        ('0aa01', 2024, 1, 'TOR', '{C}', 300, 3.75), ('0aa02', 2024, NULL, 'MTL', '{D}', 150, 1.9), ('0aa03', 2024, 1, 'BOS', '{G}', 120, 2.1),
        ('0aa01', 2025, 2, 'TOR', '{C}', 310, 3.8), ('0aa02', 2025, 3, 'MTL', '{D}', 160, 2.0), ('0aa03', 2025, 3, 'BOS', '{G}', 130, 2.2);
    INSERT INTO league.award_types (id, name, label, description, sort_order) VALUES
        (11, 'Wayne Gretzky Award', 'Wayne Gretzky Award', 'Most points', 0),
        (12, 'Le Magnifique', 'Le Magnifique', 'Most points by a forward', 1),
        (13, 'Bobby Orr Award', 'Bobby Orr Award', 'Most points by a defenceman', 2),
        (14, 'Hasek Trophy', 'Hasek Award', 'Best goalie', 3),
        (15, 'Danny Briere Award', 'Danny Briere Trophy', 'Playoff MVP', 4),
        (16, 'Teemu Trophy', 'Teemu Selanne Trophy', 'Top rookie', 5);
    ${awards}
` });

test('the migration stores every award under its catalogue ID, drops the award table and keeps award counts', async (t) => {
    const { client, migrateRest } = await league(t, `
        INSERT INTO league.awards (season_year, award_type_id, player_id, team_season_id) VALUES
            (2024, 11, '0aa01', 1), (2024, 12, '0aa01', 1), (2024, 13, '0aa02', NULL), (2024, 14, '0aa03', 1),
            (2025, 15, '0aa01', 2), (2025, 16, '0aa03', 3), (2025, 11, '0aa01', 2), (2025, 11, '0aa02', 3);
    `);
    await migrateRest('0033');

    const rows = async (query: string) => (await client.query<Record<string, unknown>>(query)).rows;
    assert.deepEqual(
        (await rows('select season_year, award, player_id, team_season_id from league.awards order by season_year, award, player_id'))
            .map(r => [r.season_year, r.award, r.player_id, r.team_season_id]),
        [
            [2024, 'bobby-orr', '0aa02', null],
            [2024, 'hasek', '0aa03', 1],
            [2024, 'le-magnifique', '0aa01', 1],
            [2024, 'wayne-gretzky', '0aa01', 1],
            [2025, 'danny-briere', '0aa01', 2],
            [2025, 'teemu-selanne', '0aa03', 3],
            [2025, 'wayne-gretzky', '0aa01', 2],
            [2025, 'wayne-gretzky', '0aa02', 3],
        ],
    );
    assert.deepEqual(await rows("select to_regclass('league.award_types') as award_types"), [{ award_types: null }]);
    assert.deepEqual(await rows('select player_id, awards from league.player_careers order by player_id'), [
        { player_id: '0aa01', awards: 4 },
        { player_id: '0aa02', awards: 2 },
        { player_id: '0aa03', awards: 2 },
    ]);

    // the key is (season, award, player): a player wins an award once a season, and two players can share it
    await assert.rejects(client.query("INSERT INTO league.awards (season_year, award, player_id) VALUES (2024, 'hasek', '0aa03')"), /duplicate key/);
    await client.query("INSERT INTO league.awards (season_year, award, player_id) VALUES (2024, 'hasek', '0aa01')");
});

test('the migration stops and changes nothing when a stored award has no catalogue match', async (t) => {
    const { client, migrateRest } = await league(t, `
        INSERT INTO league.award_types (id, name, label, description, sort_order) VALUES (17, 'Hart Trophy', 'Hart Trophy', 'MVP', 6);
        INSERT INTO league.awards (season_year, award_type_id, player_id, team_season_id) VALUES (2024, 11, '0aa01', 1), (2025, 17, '0aa02', 3);
    `);
    const snapshot = async () => {
        const all = [];
        for (const table of ['award_types', 'awards', 'player_careers']) {
            all.push((await client.query(`select * from league.${table}`)).rows.map((row) => JSON.stringify(row)).sort());
        }
        return all;
    };
    const before = await snapshot();

    await assert.rejects(migrateRest('0033'), /Hart Trophy/);
    assert.deepEqual(await snapshot(), before);
});
