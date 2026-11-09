import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { SQL } from 'drizzle-orm';
import { captureArchivedStats } from './archived-stats';
import { parseFactPacket, referencePacket, unknownPlayer } from './facts';
import { episodeFrom } from '../episode';
import { noNhl } from '../player-snapshot';
import { loadLeagueConfig } from '../../../scripts/db/lib/league-config';
import pilotTeams from '../pilot-teams.json';

test('graphic stats freeze the episode stats season through the player snapshot, preserve live evidence, and never guess identities or years', async t => {
    const client = new PGlite();
    t.after(() => client.close());
    const db = drizzle(client);
    await client.exec(`
        create schema league;
        create table league.players (id text primary key, name text not null);
        create table league.player_seasons (player_id text, season_year integer, nhl_team text,
            positions text[], fpts numeric(8,2), fpg numeric(6,2), primary key (player_id, season_year));
        insert into league.players values ('*003vz*', 'Tom Wilson'), ('nylander', 'William Nylander'),
            ('hischier', 'Nico Hischier'), ('zero', 'Zero Player'), ('future', 'Future Player'),
            ('older', 'Older Player'), ('*048x9*', 'Elias Pettersson'), ('*0ab12*', 'Elias Pettersson');
        insert into league.player_seasons values
            ('*003vz*', 2025, 'WSH', '{RW}', 100, 1), ('*003vz*', 2026, 'WSH', '{RW}', 372, 5.17),
            ('*003vz*', 2027, 'WSH', '{RW}', 999, 9), ('nylander', 2026, 'TOR', '{RW}', 378.25, 5.82),
            ('hischier', 2026, 'NJD', '{C}', 382.25, 4.66), ('zero', 2026, 'TOR', '{C}', 0, 0),
            ('future', 2027, 'TOR', '{C}', 50, 1), ('older', 2025, 'TOR', '{C}', 75, 1),
            ('*048x9*', 2026, 'VAN', '{C}', 309.75, 4.2), ('*0ab12*', 2026, 'VAN', '{D}', 134, 1.9);
    `);
    const packet = referencePacket(loadLeagueConfig(), 2027, pilotTeams);
    const birthSource = { url: 'https://example.test/birthplace', fetchedAt: '2026-10-15T12:00:00Z' };
    packet.players = [{ ...unknownPlayer('Tom Wilson'), nhlId: 123, birthCountry: 'CAN', birthCity: 'Toronto',
        bornInNorthAmerica: true, source: birthSource, headshot: 'https://example.test/wilson.png', nhlTeam: 'WSH' }];
    packet.sources.push(birthSource);
    packet.matchups = [{ away: { teamId: 'a', score: 20, gamesPlayed: 3 }, home: { teamId: 'b', score: 25, gamesPlayed: 4 } }].map(m => ({ ...m, categories: [] }));
    const before = structuredClone(packet);
    const episode = episodeFrom(`---\ntitle: T\nseason: 2027\n---\n>> player "Tom Wilson"\n\nRON: Last year. [>> gap "Tom Wilson" "William Nylander" "Nico Hischier"]
>> gap "Elias Pettersson" #048x9 "Elias Pettersson" #0ab12`);
    const query = async (sql: SQL) => (await db.execute(sql)).rows;
    const now = () => new Date('2026-10-17T22:00:00Z');
    const refs = [...episode.playerRefs, ...['tom wilson', 'Zero Player', 'Future Player', 'Older Player', 'Elias Pettersson', "Nobody's Player"].map(name => ({ name }))];
    const captured = await captureArchivedStats(packet, refs, { season: episode.statsSeason!, query, portraits: noNhl, now });
    assert.deepEqual(packet, before, 'capture does not mutate the input snapshot');
    const { players, sources, limitations, playerSnapshot, ...league } = captured;
    const { players: oldPlayers, sources: oldSources, limitations: oldLimits, ...oldLeague } = before;
    assert.deepEqual(league, oldLeague, 'capture preserves all league observations and timestamps');
    assert.equal(players.length, 10, 'deduplicates case-insensitively, includes inline gap players, and keeps both pinned namesakes');
    const wilson = players.find(p => p.name === 'Tom Wilson')!;
    assert.deepEqual([wilson.id, wilson.season, wilson.fpts, wilson.fpg, wilson.games], ['003vz', 2026, 372, 5.17, null]);
    assert.equal(wilson.birthCity, 'Toronto');
    assert.deepEqual(wilson.source, birthSource);
    assert.equal(wilson.headshot, 'https://fantraximg.com/si/headshots/NHL/hs003vz_96_7.png', 'the card headshot follows the snapshot rule, not the birthplace lookup');
    assert.equal(players.find(p => p.name === 'William Nylander')!.fpts! - wilson.fpts!, 6.25);
    assert.equal(players.find(p => p.name === 'Zero Player')!.fpts, 0);
    assert.deepEqual(players.filter(p => p.name === 'Elias Pettersson').map(p => [p.id, p.fpts]), [['048x9', 309.75], ['0ab12', 134], [null, null]], 'the bare name is never given either one');
    for (const name of ['Future Player', 'Older Player', "Nobody's Player"]) {
        assert.equal(players.find(p => p.name === name)!.fpts, null);
        assert.ok(limitations.some(note => note.includes(`No 2025–26 record for ${name}`)), name);
    }
    assert.match(limitations.join('\n'), /“Elias Pettersson” is 2 players in 2025–26/);
    assert.deepEqual(playerSnapshot?.diagnostics.map(d => [d.kind, d.ref.name]), [
        ['no-record', 'Future Player'], ['no-record', 'Older Player'], ['ambiguous', 'Elias Pettersson'], ['no-record', "Nobody's Player"],
    ]);
    assert.equal(playerSnapshot?.season, 2026);
    assert.deepEqual(wilson.statsSource, { url: 'yofhl-db:league.player_seasons?season_year=2026', fetchedAt: now().toISOString(), season: 2026, playerId: '003vz' });
    assert.deepEqual(sources, [birthSource, { url: wilson.statsSource.url, fetchedAt: now().toISOString() }]);
    assert.deepEqual(parseFactPacket(JSON.parse(JSON.stringify(captured))), captured);
    const historical = await captureArchivedStats(captured, [{ name: 'Tom Wilson' }], { query, season: 2025, portraits: noNhl });
    assert.equal(historical.players[0].fpts, 100);
    assert.equal(historical.players[0].season, 2025);
    await assert.rejects(captureArchivedStats(packet, [{ name: 'Tom Wilson' }], { query, season: 2027, portraits: noNhl }), /before the episode/);
});

test('database failure rejects without altering saved evidence, and graphics-free drafts need no DB access', async () => {
    const packet = referencePacket(loadLeagueConfig(), 2027, pilotTeams);
    const before = structuredClone(packet);
    const query = async () => { throw new Error('database unavailable'); };
    assert.equal(await captureArchivedStats(packet, [], { query, season: 2026, portraits: noNhl }), packet);
    await assert.rejects(captureArchivedStats(packet, [{ name: 'Tom Wilson' }], { query, season: 2026, portraits: noNhl }), /database unavailable/);
    assert.deepEqual(packet, before);
});
