import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { captureArchivedStats, type ArchivedPlayerStats } from './archived-stats';
import { parseFactPacket, referencePacket, unknownPlayer } from './facts';
import { parseScript, playerRefs } from '../script';
import { loadLeagueConfig } from '../../../scripts/db/lib/league-config';

test('graphic stats freeze the episode prior season, preserve live evidence, and never guess missing identities or years', async t => {
    const client = new PGlite();
    t.after(() => client.close());
    const db = drizzle(client);
    await client.exec(`
        create schema league;
        create table league.players (id text primary key, name text not null);
        create table league.player_seasons (player_id text, season_year integer, nhl_team text,
            positions text[], fpts numeric(8,2), fpg numeric(6,2), primary key (player_id, season_year));
        insert into league.players values ('wilson', 'Tom Wilson'), ('nylander', 'William Nylander'),
            ('hischier', 'Nico Hischier'), ('zero', 'Zero Player'), ('future', 'Future Player'),
            ('older', 'Older Player'), ('one', 'Same Name'), ('two', 'Same Name');
        insert into league.player_seasons values
            ('wilson', 2025, 'WSH', '{RW}', 100, 1), ('wilson', 2026, 'WSH', '{RW}', 372, 5.17),
            ('wilson', 2027, 'WSH', '{RW}', 999, 9), ('nylander', 2026, 'TOR', '{RW}', 378.25, 5.82),
            ('hischier', 2026, 'NJD', '{C}', 382.25, 4.66), ('zero', 2026, 'TOR', '{C}', 0, 0),
            ('future', 2027, 'TOR', '{C}', 50, 1), ('older', 2025, 'TOR', '{C}', 75, 1),
            ('one', 2026, 'TOR', '{C}', 50, 1), ('two', 2026, 'TOR', '{C}', 60, 1);
    `);
    const packet = referencePacket(loadLeagueConfig(), 2027);
    const birthSource = { url: 'https://example.test/birthplace', fetchedAt: '2026-10-15T12:00:00Z' };
    packet.players = [{ ...unknownPlayer('Tom Wilson'), nhlId: 123, birthCountry: 'CAN', birthCity: 'Toronto',
        bornInNorthAmerica: true, source: birthSource, headshot: 'https://example.test/wilson.png' }];
    packet.sources.push(birthSource);
    packet.matchups = [{ away: { teamId: 'a', score: 20, gamesPlayed: 3 }, home: { teamId: 'b', score: 25, gamesPlayed: 4 }, categories: [] }];
    const before = structuredClone(packet);
    const parsed = parseScript('>> player "Tom Wilson"\n\nRON: Last year. [>> gap "Tom Wilson" "William Nylander" "Nico Hischier"]');
    const query = async (sql: Parameters<typeof db.execute>[0]) => (await db.execute(sql)).rows as unknown as ArchivedPlayerStats[];
    const now = () => new Date('2026-10-17T22:00:00Z');
    const captured = await captureArchivedStats(packet, [...playerRefs(parsed), 'tom wilson', 'Zero Player', 'Future Player', 'Older Player', 'Same Name', "Nobody's Player"], { query, now });
    assert.deepEqual(packet, before, 'capture does not mutate the input snapshot');
    const { players, sources, limitations, ...league } = captured;
    const { players: oldPlayers, sources: oldSources, limitations: oldLimits, ...oldLeague } = before;
    assert.deepEqual(league, oldLeague, 'capture preserves all league observations and timestamps');
    assert.equal(players.length, 8, 'deduplicates case-insensitively and includes inline gap players');
    const wilson = players.find(p => p.name === 'Tom Wilson')!;
    assert.deepEqual([wilson.season, wilson.fpts, wilson.fpg, wilson.games], [2026, 372, 5.17, null]);
    assert.equal(wilson.birthCity, 'Toronto');
    assert.deepEqual(wilson.source, birthSource);
    assert.equal(wilson.headshot, 'https://example.test/wilson.png');
    assert.equal(players.find(p => p.name === 'William Nylander')!.fpts! - wilson.fpts!, 6.25);
    assert.equal(players.find(p => p.name === 'Nico Hischier')!.fpts! - wilson.fpts!, 10.25);
    assert.equal(players.find(p => p.name === 'Zero Player')!.fpts, 0);
    for (const name of ['Future Player', 'Older Player', 'Same Name', "Nobody's Player"]) {
        assert.equal(players.find(p => p.name === name)!.fpts, null);
        assert.ok(limitations.some(note => note.startsWith(`Archived YOFHL stats for ${name}:`)));
    }
    assert.match(limitations.join('\n'), /ambiguous player identity/);
    assert.deepEqual(wilson.statsSource, { url: 'yofhl-db:league.player_seasons?season_year=2026', fetchedAt: now().toISOString(), season: 2026, playerId: 'wilson' });
    assert.deepEqual(sources, [birthSource, { url: wilson.statsSource.url, fetchedAt: now().toISOString() }]);
    assert.deepEqual(parseFactPacket(JSON.parse(JSON.stringify(captured))), captured);
    const historical = await captureArchivedStats(captured, ['Tom Wilson'], { query, season: 2025 });
    assert.equal(historical.players[0].fpts, 100);
    assert.equal(historical.players[0].season, 2025);
    await assert.rejects(captureArchivedStats(packet, ['Tom Wilson'], { query, season: 2027 }), /before the episode/);
});

test('database failure rejects without altering saved evidence, and graphics-free drafts need no DB access', async () => {
    const packet = referencePacket(loadLeagueConfig(), 2027);
    const before = structuredClone(packet);
    const query = async () => { throw new Error('database unavailable'); };
    assert.equal(await captureArchivedStats(packet, [], { query }), packet);
    await assert.rejects(captureArchivedStats(packet, ['Tom Wilson'], { query }), /database unavailable/);
    assert.deepEqual(packet, before);
});
