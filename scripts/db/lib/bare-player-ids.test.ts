import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { disposableLeague } from '../../../lib/testing/disposable-league';

// The migration that stores player IDs bare (docs/adr/0006-player-ids-are-stored-bare.md), run on a league
// migrated through the one before it and seeded with wrapped IDs in every table that references a player.

const league = (t: TestContext, players: string) => disposableLeague(t, { migrateThrough: '0021', seed: `
    INSERT INTO league.seasons (year, label, playoff_status) VALUES (2025, '2024–25', 'complete');
    INSERT INTO league.franchises (id, display_name, first_season) VALUES (1, 'Ashgrove Anglers', 2019);
    INSERT INTO league.team_seasons (id, season_year, franchise_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against)
        VALUES (1, 2025, 1, 'Ashgrove Anglers', 'Ashgrove Anglers', 'ASH', 1, 1, 30, 14, 2, 4600, 4000);
    INSERT INTO league.award_types (id, name, label, description, sort_order) VALUES (1, 'Top Gun Award', 'Top Gun Award', 'Most points', 0);
    INSERT INTO league.transaction_events (id, season_year, kind, occurred_at, occurred_on, source_file, source_time)
        VALUES ('trade', 2025, 'trade', '2025-01-12T04:05:00Z', '2025-01-12', '2024-2025 Trades.csv', 'Sun Jan 11, 2025, 11:05PM');
    ${players}
` });

test('the migration stores every player ID bare, keeps every reference joining and refreshes the views', async (t) => {
    const { client, migrateRest } = await league(t, `
        INSERT INTO league.players (id, name) VALUES ('*0aa01*', 'Ann Able'), ('*0aa02*', 'Bo Bell'), ('0aa03', 'Cy Cole');
        INSERT INTO league.player_seasons (player_id, season_year, team_season_id, nhl_team, positions, fpts, fpg) VALUES
            ('*0aa01*', 2025, 1, 'TOR', '{C}', 300, 3.75), ('*0aa02*', 2025, 1, 'MTL', '{D}', 150, 1.9), ('0aa03', 2025, NULL, 'BOS', '{LW}', 20, 0.5);
        INSERT INTO league.awards (season_year, award_type_id, player_id, team_season_id) VALUES (2025, 1, '*0aa01*', 1);
        INSERT INTO league.championship_rosters (season_year, player_id) VALUES (2025, '*0aa01*'), (2025, '*0aa02*');
        INSERT INTO league.draft_picks (season_year, overall, round, pick, franchise_id, team_name, player_id, player_name, positions, drafted_on, source_time, source_file) VALUES
            (2025, 1, 1, 1, 1, 'Ashgrove Anglers', '*0aa02*', 'Bo Bell', 'D', '2024-09-21', 'Sep 21, 2024 7:30:12', '2024-2025 draft.csv'),
            (2025, 2, 1, 2, 1, 'Ashgrove Anglers', NULL, NULL, '', '2024-09-21', 'Sep 21, 2024 7:31:40', '2024-2025 draft.csv');
        INSERT INTO league.transaction_assets (id, event_id, player_id, label, asset_kind, action, from_franchise_id, to_franchise_id, source_row) VALUES
            ('a1', 'trade', '*0aa01*', 'Ann Able', 'player', 'trade', 1, NULL, 2), ('a2', 'trade', NULL, '2026 Draft Pick, Round 1', 'pick', 'trade', NULL, 1, 3);
    `);
    await migrateRest();

    const rows = async (query: string) => (await client.query<Record<string, unknown>>(query)).rows;
    assert.deepEqual(await rows('select id, name from league.players order by id'), [
        { id: '0aa01', name: 'Ann Able' }, { id: '0aa02', name: 'Bo Bell' }, { id: '0aa03', name: 'Cy Cole' },
    ]);
    // each reference joins the player it pointed at before
    const named = (table: string, order: string) => rows(`select p.name from league.${table} x join league.players p on p.id = x.player_id order by ${order}`);
    assert.deepEqual(await named('player_seasons', 'x.fpts desc'), [{ name: 'Ann Able' }, { name: 'Bo Bell' }, { name: 'Cy Cole' }]);
    assert.deepEqual(await named('awards', 'x.award_type_id'), [{ name: 'Ann Able' }]);
    assert.deepEqual(await named('championship_rosters', 'p.name'), [{ name: 'Ann Able' }, { name: 'Bo Bell' }]);
    assert.deepEqual(await rows('select overall, player_id from league.draft_picks order by overall'), [{ overall: 1, player_id: '0aa02' }, { overall: 2, player_id: null }]);
    assert.deepEqual(await rows('select id, player_id from league.transaction_assets order by id'), [{ id: 'a1', player_id: '0aa01' }, { id: 'a2', player_id: null }]);
    assert.deepEqual(await rows('select player_id, championships, awards from league.player_careers order by player_id'), [
        { player_id: '0aa01', championships: 1, awards: 1 },
        { player_id: '0aa02', championships: 1, awards: 0 },
        { player_id: '0aa03', championships: 0, awards: 0 },
    ]);

    await assert.rejects(client.query("INSERT INTO league.players (id, name) VALUES ('*0aa09*', 'Dee Dunn')"), /players_id_bare/);
    await assert.rejects(client.query("INSERT INTO league.players (id, name) VALUES ('0aa09*', 'Dee Dunn')"), /players_id_bare/);
});

test('the migration stops and changes nothing when two player IDs would be the same once stripped', async (t) => {
    const { client, migrateRest } = await league(t, `
        INSERT INTO league.players (id, name) VALUES ('*0aa01*', 'Ann Able'), ('0aa01', 'Ann Able'), ('*0aa02*', 'Bo Bell');
        INSERT INTO league.player_seasons (player_id, season_year, team_season_id, nhl_team, positions, fpts, fpg) VALUES
            ('*0aa01*', 2025, 1, 'TOR', '{C}', 300, 3.75), ('*0aa02*', 2025, 1, 'MTL', '{D}', 150, 1.9);
        INSERT INTO league.championship_rosters (season_year, player_id) VALUES (2025, '*0aa02*');
    `);
    const snapshot = async () => {
        const all = [];
        for (const table of ['players', 'player_seasons', 'championship_rosters', 'player_careers']) {
            all.push((await client.query(`select * from league.${table}`)).rows.map((row) => JSON.stringify(row)).sort());
        }
        return all;
    };
    const before = await snapshot();

    await assert.rejects(migrateRest(), /\*0aa01\* and 0aa01/);
    assert.deepEqual(await snapshot(), before);
    await client.query("INSERT INTO league.players (id, name) VALUES ('*0aa09*', 'Dee Dunn')");
});
