import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { SQL } from 'drizzle-orm';
import { episodeFrom } from './episode';
import { playerSnapshot, snapshotMessage, type NhlPortraits, type SnapshotRow } from './player-snapshot';

// Fantrax portraits on file for these ids (lib/records/player-portraits.json)
const FANTRAX = {
    wilson: 'https://fantraximg.com/si/headshots/NHL/hs003vz_96_7.png',
    nylander: 'https://fantraximg.com/si/headshots/NHL/hs003w3_96_1.png',
    hischier: 'https://fantraximg.com/si/headshots/NHL/hs003w5_96_1.png',
};

const script = (cues: string, front = '') => `---\ntitle: Test\nseason: 2027\n${front}---\n${cues}\nDON: Welcome to the show.`;

async function archive(t: TestContext) {
    const client = new PGlite();
    t.after(() => client.close());
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
    const many = Array.from({ length: 25 }, (_, i) => i);
    await client.exec(`
        insert into league.seasons values (2025, '2024–25', 'complete'), (2026, '2025–26', 'complete'), (2027, '2026–27', 'in-progress');
        insert into league.players values ('*003vz*', 'Tom Wilson'), ('*003w3*', 'William Nylander'), ('*003w5*', 'Nico Hischier'),
            ('*048x9*', 'Elias Pettersson'), ('*0ab12*', 'Elias Pettersson'), ('future', 'Future Player'), ('older', 'Older Player'),
            ('broken', 'Broken Line'), ${many.map(i => `('depth${i}', 'Depth ${i}')`).join(', ')};
        insert into league.player_seasons (player_id, season_year, nhl_team, positions, fpts, fpg) values
            ('*003vz*', 2025, 'WSH', '{RW}', 100, 1.5), ('*003vz*', 2026, 'WSH', '{RW}', 372, 5.17), ('*003vz*', 2027, 'WSH', '{RW}', 999, 9),
            ('*003w3*', 2026, 'TOR', '{RW}', 378.25, 5.82), ('*003w5*', 2026, 'NJD', '{C}', 382.25, 4.66),
            ('*048x9*', 2026, 'VAN', '{C}', 309.75, 4.2), ('*0ab12*', 2026, 'VAN', '{D}', 134, 1.9),
            ('future', 2027, 'TOR', '{C}', 50, 1), ('older', 2025, 'TOR', '{C}', 75, 1),
            ('broken', 2026, 'TOR', '{C}', 'NaN', 1),
            ${many.map(i => `('depth${i}', 2026, 'TOR', '{C}', ${i}, 1)`).join(', ')};
    `);
    return async (query: SQL) => (await db.execute(query)).rows;
}

// The NHL says there are two Tom Wilsons (one in Washington), two William Nylanders in Toronto and no Nico Hischier.
function nhl(): NhlPortraits & { searched: string[] } {
    const searched: string[] = [];
    const people: Record<string, { playerId: string; name: string; teamAbbrev?: string | null; lastTeamAbbrev?: string | null }[]> = {
        'Tom Wilson': [{ playerId: '8476880', name: 'Tom Wilson', teamAbbrev: 'WSH' }, { playerId: '8400001', name: 'Tom Wilson', teamAbbrev: null, lastTeamAbbrev: 'BOS' }],
        'William Nylander': [{ playerId: '8477939', name: 'William Nylander', teamAbbrev: 'TOR' }, { playerId: '8400002', name: 'William Nylander', lastTeamAbbrev: 'TOR' }],
        'Prospect Player': [{ playerId: '8400003', name: 'Prospect Player' }],
    };
    return {
        searched,
        search: async name => { searched.push(name); return people[name] ?? []; },
        headshot: async id => `https://assets.nhle.com/mugs/${id}.png`,
    };
}

const row = (players: SnapshotRow[], name: string, id?: string) => players.find(p => p.name === name && (!id || p.id === id))!;

test('the stats season is the season before the episode, or the earlier one the script names', async t => {
    const query = await archive(t);
    const portraits = nhl();
    const current = episodeFrom(script('>> player "Tom Wilson"'));
    const { players } = await playerSnapshot(current.statsSeason, current.playerRefs, { query, portraits });
    assert.deepEqual(players, [{ id: '003vz', name: 'Tom Wilson', headshot: 'https://assets.nhle.com/mugs/8476880.png',
        nhlTeam: 'WSH', positions: ['RW'], season: 2026, fpts: 372, fpg: 5.17, games: null }]);
    const retro = episodeFrom(script('>> player "Tom Wilson"', 'stats: 2025\n'));
    assert.deepEqual((await playerSnapshot(retro.statsSeason, retro.playerRefs, { query, portraits })).players.map(p => [p.season, p.fpts]), [[2025, 100]]);
});

test('a player with a record only in another season has no record, never a substitute', async t => {
    const query = await archive(t);
    const refs = [{ name: 'Future Player' }, { name: 'Older Player' }, { name: 'Nobody' }];
    const { players, diagnostics } = await playerSnapshot(2026, refs, { query, portraits: nhl() });
    assert.deepEqual(players.map(p => [p.name, p.season, p.fpts, p.fpg, p.games]),
        [['Future Player', null, null, null, null], ['Older Player', null, null, null, null], ['Nobody', null, null, null, null]]);
    assert.deepEqual(diagnostics, refs.map(ref => ({ kind: 'no-record', ref })));
});

test('a bare namesake is ambiguous and lists the candidates; the id picks each one', async t => {
    const query = await archive(t);
    const portraits = nhl();
    const bare = await playerSnapshot(2026, [{ name: 'Elias Pettersson' }], { query, portraits });
    assert.deepEqual(bare.diagnostics, [{ kind: 'ambiguous', ref: { name: 'Elias Pettersson' }, candidates: [
        { id: '048x9', nhlTeam: 'VAN', fpts: 309.75 }, { id: '0ab12', nhlTeam: 'VAN', fpts: 134 },
    ] }]);
    assert.deepEqual(bare.players.map(p => [p.id, p.fpts, p.headshot]), [[null, null, null]], 'no stats or face is guessed');
    assert.deepEqual(portraits.searched, [], 'no NHL lookup for an unknown identity');
    assert.match(snapshotMessage(bare.diagnostics[0], 2026).message, /#048x9 \(VAN, 309\.75 FPts\).*#0ab12 \(VAN, 134 FPts\)/);
    assert.equal(snapshotMessage(bare.diagnostics[0], 2026).severity, 'error');

    const pinned = episodeFrom(script('>> gap "Elias Pettersson" #048x9 "Elias Pettersson" #0ab12'));
    const { players, diagnostics } = await playerSnapshot(pinned.statsSeason, pinned.playerRefs, { query, portraits });
    assert.deepEqual(diagnostics, []);
    assert.deepEqual(players.map(p => [p.id, p.name, p.fpts, p.positions]), [['048x9', 'Elias Pettersson', 309.75, ['C']], ['0ab12', 'Elias Pettersson', 134, ['D']]]);
});

test('an id must belong to the named player', async t => {
    const query = await archive(t);
    const { players, diagnostics } = await playerSnapshot(2026, [{ name: 'Tom Wilson', id: '048x9' }], { query, portraits: nhl() });
    assert.deepEqual(diagnostics, [{ kind: 'no-record', ref: { name: 'Tom Wilson', id: '048x9' } }]);
    assert.equal(players[0].fpts, null);
    assert.equal(snapshotMessage(diagnostics[0], 2026).severity, 'warning');
});

test('incomplete FPts are reported, and games played is never derived', async t => {
    const query = await archive(t);
    const { players, diagnostics } = await playerSnapshot(2026, [{ name: 'Broken Line' }, { name: 'William Nylander' }], { query, portraits: nhl() });
    assert.deepEqual(diagnostics, [{ kind: 'incomplete-fpts', ref: { name: 'Broken Line' } }]);
    assert.deepEqual(players.map(p => [p.season, p.fpts, p.fpg, p.games]), [[2026, null, 1, null], [2026, 378.25, 5.82, null]]);
    assert.match(snapshotMessage(diagnostics[0], 2026).message, /Broken Line.*2025–26/);
});

test('a headshot is the one NHL match left after narrowing by team, otherwise the Fantrax portrait', async t => {
    const query = await archive(t);
    const refs = [{ name: 'Tom Wilson' }, { name: 'William Nylander' }, { name: 'Nico Hischier' }, { name: 'Prospect Player' }];
    const { players } = await playerSnapshot(2026, refs, { query, portraits: nhl() });
    assert.deepEqual(players.map(p => p.headshot), [
        'https://assets.nhle.com/mugs/8476880.png', // two Tom Wilsons, one in Washington
        FANTRAX.nylander, // both Nylanders are Leafs: never the first match
        FANTRAX.hischier, // no NHL match
        'https://assets.nhle.com/mugs/8400003.png', // no record, but only one NHL player has the name
    ]);
    assert.equal((await playerSnapshot(2026, [{ name: 'Tom Wilson' }], { query, portraits: { search: async () => [], headshot: async () => null } })).players[0].headshot, FANTRAX.wilson);
});

test('every cited player is kept, however many', async t => {
    const query = await archive(t);
    const refs = Array.from({ length: 25 }, (_, i) => ({ name: `Depth ${i}` }));
    const { players, diagnostics } = await playerSnapshot(2026, refs, { query, portraits: nhl() });
    assert.equal(players.length, 25);
    assert.deepEqual(players.map(p => p.fpts), refs.map((_, i) => i));
    assert.deepEqual(diagnostics, []);
    assert.equal(row(players, 'Depth 24').id, 'depth24');
});

test('without a season there are no stats to look up', async () => {
    const { players, diagnostics } = await playerSnapshot(null, [{ name: 'Tom Wilson' }], {
        query: async () => { throw new Error('no query without a season'); }, portraits: nhl(),
    });
    assert.deepEqual([players[0].fpts, diagnostics[0].kind], [null, 'no-record']);
    assert.match(snapshotMessage(diagnostics[0], null).message, /Tom Wilson.*season:/);
});
