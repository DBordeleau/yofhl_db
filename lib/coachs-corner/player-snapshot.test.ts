import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { SQL } from 'drizzle-orm';
import { disposableLeague } from '../testing/disposable-league';
import { episodeFrom } from './episode';
import { createMemoryNhl, memoryNhlState, nhlPlayer, type MemoryNhlState } from '../nhl/memory-nhl';
import type { Nhl } from '../nhl/model';
import { noNhl, playerSnapshot, snapshotMessage, type SnapshotRow } from './player-snapshot';

// Fantrax portraits on file for these ids (lib/records/player-portraits.json)
const FANTRAX = {
    wilson: 'https://fantraximg.com/si/headshots/NHL/hs003vz_96_7.png',
    nylander: 'https://fantraximg.com/si/headshots/NHL/hs003w3_96_1.png',
    hischier: 'https://fantraximg.com/si/headshots/NHL/hs003w5_96_1.png',
};

const script = (cues: string, front = '') => `---\ntitle: Test\nseason: 2027\n${front}---\n${cues}\nDON: Welcome to the show.`;

async function archive(t: TestContext) {
    const many = Array.from({ length: 25 }, (_, i) => i);
    const { db } = await disposableLeague(t, { seed: `
        insert into league.seasons values (2025, '2024–25', 'complete'), (2026, '2025–26', 'complete'), (2027, '2026–27', 'in-progress');
        insert into league.players values ('003vz', 'Tom Wilson'), ('003w3', 'William Nylander'), ('003w5', 'Nico Hischier'),
            ('048x9', 'Elias Pettersson'), ('0ab12', 'Elias Pettersson'), ('future', 'Future Player'), ('older', 'Older Player'),
            ('broken', 'Broken Line'), ${many.map(i => `('depth${i}', 'Depth ${i}')`).join(', ')};
        insert into league.player_seasons (player_id, season_year, nhl_team, positions, fpts, fpg) values
            ('003vz', 2025, 'WSH', '{RW}', 100, 1.5), ('003vz', 2026, 'WSH', '{RW}', 372, 5.17), ('003vz', 2027, 'WSH', '{RW}', 999, 9),
            ('003w3', 2026, 'TOR', '{RW}', 378.25, 5.82), ('003w5', 2026, 'NJD', '{C}', 382.25, 4.66),
            ('048x9', 2026, 'VAN', '{C}', 309.75, 4.2), ('0ab12', 2026, 'VAN', '{D}', 134, 1.9),
            ('future', 2027, 'TOR', '{C}', 50, 1), ('older', 2025, 'TOR', '{C}', 75, 1),
            ('broken', 2026, 'TOR', '{C}', 'NaN', 1),
            ${many.map(i => `('depth${i}', 2026, 'TOR', '{C}', ${i}, 1)`).join(', ')};
    ` });
    return async (query: SQL) => (await db.execute(query)).rows;
}

// The NHL says there are two Tom Wilsons (one in Washington), two William Nylanders in Toronto and no Nico Hischier.
function nhl(): Nhl & { state: MemoryNhlState } {
    const mug = (nhlId: number) => `https://assets.nhle.com/mugs/${nhlId}.png`;
    const held = [
        nhlPlayer({ nhlId: 8476880, name: 'Tom Wilson', team: 'WSH', position: 'R', headshot: mug(8476880) }),
        nhlPlayer({ nhlId: 8400001, name: 'Tom Wilson', team: 'BOS', position: 'R', headshot: mug(8400001) }),
        nhlPlayer({ nhlId: 8477939, name: 'William Nylander', team: 'TOR', position: 'R', headshot: mug(8477939) }),
        nhlPlayer({ nhlId: 8400002, name: 'William Nylander', team: 'TOR', position: 'R', headshot: mug(8400002) }),
        nhlPlayer({ nhlId: 8400003, name: 'Prospect Player', team: null, position: 'C', headshot: mug(8400003) }),
    ];
    const state = memoryNhlState({ players: Object.fromEntries(held.map(p => [p.nhlId, p])) });
    return { state, ...createMemoryNhl(state) };
}

const row = (players: SnapshotRow[], name: string, id?: string) => players.find(p => p.name === name && (!id || p.id === id))!;

test('the stats season is the season before the episode, or the earlier one the script names', async t => {
    const query = await archive(t);
    const portraits = nhl();
    const current = episodeFrom(script('>> player "Tom Wilson"'));
    const { players } = await playerSnapshot(current.statsSeason, current.playerRefs, { query, nhl: portraits });
    assert.deepEqual(players, [{ id: '003vz', name: 'Tom Wilson', headshot: 'https://assets.nhle.com/mugs/8476880.png',
        nhlTeam: 'WSH', positions: ['RW'], season: 2026, fpts: 372, fpg: 5.17, games: null }]);
    const retro = episodeFrom(script('>> player "Tom Wilson"', 'stats: 2025\n'));
    assert.deepEqual((await playerSnapshot(retro.statsSeason, retro.playerRefs, { query, nhl: portraits })).players.map(p => [p.season, p.fpts]), [[2025, 100]]);
});

test('a player with a record only in another season has no record, never a substitute', async t => {
    const query = await archive(t);
    const refs = [{ name: 'Future Player' }, { name: 'Older Player' }, { name: 'Nobody' }];
    const { players, diagnostics } = await playerSnapshot(2026, refs, { query, nhl: nhl() });
    assert.deepEqual(players.map(p => [p.name, p.season, p.fpts, p.fpg, p.games]),
        [['Future Player', null, null, null, null], ['Older Player', null, null, null, null], ['Nobody', null, null, null, null]]);
    assert.deepEqual(diagnostics, refs.map(ref => ({ kind: 'no-record', ref })));
});

test('a bare namesake is ambiguous and lists the candidates; the id picks each one', async t => {
    const query = await archive(t);
    const portraits = nhl();
    const bare = await playerSnapshot(2026, [{ name: 'Elias Pettersson' }], { query, nhl: portraits });
    assert.deepEqual(bare.diagnostics, [{ kind: 'ambiguous', ref: { name: 'Elias Pettersson' }, candidates: [
        { id: '048x9', nhlTeam: 'VAN', fpts: 309.75 }, { id: '0ab12', nhlTeam: 'VAN', fpts: 134 },
    ] }]);
    assert.deepEqual(bare.players.map(p => [p.id, p.fpts, p.headshot]), [[null, null, null]], 'no stats or face is guessed');
    assert.deepEqual(portraits.state.identified, [], 'no NHL lookup for an unknown identity');
    assert.match(snapshotMessage(bare.diagnostics[0], 2026).message, /#048x9 \(VAN, 309\.75 FPts\).*#0ab12 \(VAN, 134 FPts\)/);
    assert.equal(snapshotMessage(bare.diagnostics[0], 2026).severity, 'error');

    const pinned = episodeFrom(script('>> gap "Elias Pettersson" #048x9 "Elias Pettersson" #0ab12'));
    const { players, diagnostics } = await playerSnapshot(pinned.statsSeason, pinned.playerRefs, { query, nhl: portraits });
    assert.deepEqual(diagnostics, []);
    assert.deepEqual(players.map(p => [p.id, p.name, p.fpts, p.positions]), [['048x9', 'Elias Pettersson', 309.75, ['C']], ['0ab12', 'Elias Pettersson', 134, ['D']]]);
});

test('an id must belong to the named player', async t => {
    const query = await archive(t);
    const { players, diagnostics } = await playerSnapshot(2026, [{ name: 'Tom Wilson', id: '048x9' }], { query, nhl: nhl() });
    assert.deepEqual(diagnostics, [{ kind: 'no-record', ref: { name: 'Tom Wilson', id: '048x9' } }]);
    assert.equal(players[0].fpts, null);
    assert.equal(snapshotMessage(diagnostics[0], 2026).severity, 'warning');
});

test('incomplete FPts are reported, and games played is never derived', async t => {
    const query = await archive(t);
    const { players, diagnostics } = await playerSnapshot(2026, [{ name: 'Broken Line' }, { name: 'William Nylander' }], { query, nhl: nhl() });
    assert.deepEqual(diagnostics, [{ kind: 'incomplete-fpts', ref: { name: 'Broken Line' } }]);
    assert.deepEqual(players.map(p => [p.season, p.fpts, p.fpg, p.games]), [[2026, null, 1, null], [2026, 378.25, 5.82, null]]);
    assert.match(snapshotMessage(diagnostics[0], 2026).message, /Broken Line.*2025–26/);
});

test('a headshot is the one NHL match left after narrowing by team, otherwise the Fantrax portrait', async t => {
    const query = await archive(t);
    const refs = [{ name: 'Tom Wilson' }, { name: 'William Nylander' }, { name: 'Nico Hischier' }, { name: 'Prospect Player' }];
    const { players } = await playerSnapshot(2026, refs, { query, nhl: nhl() });
    assert.deepEqual(players.map(p => p.headshot), [
        'https://assets.nhle.com/mugs/8476880.png', // two Tom Wilsons, one in Washington
        FANTRAX.nylander, // both Nylanders are Leafs: never the first match
        FANTRAX.hischier, // no NHL match
        'https://assets.nhle.com/mugs/8400003.png', // no record, but only one NHL player has the name
    ]);
    assert.equal((await playerSnapshot(2026, [{ name: 'Tom Wilson' }], { query, nhl: noNhl })).players[0].headshot, FANTRAX.wilson);
});

test('every cited player is kept, however many', async t => {
    const query = await archive(t);
    const refs = Array.from({ length: 25 }, (_, i) => ({ name: `Depth ${i}` }));
    const { players, diagnostics } = await playerSnapshot(2026, refs, { query, nhl: nhl() });
    assert.equal(players.length, 25);
    assert.deepEqual(players.map(p => p.fpts), refs.map((_, i) => i));
    assert.deepEqual(diagnostics, []);
    assert.equal(row(players, 'Depth 24').id, 'depth24');
});

test('without a season there are no stats to look up', async () => {
    const { players, diagnostics } = await playerSnapshot(null, [{ name: 'Tom Wilson' }], {
        query: async () => { throw new Error('no query without a season'); }, nhl: nhl(),
    });
    assert.deepEqual([players[0].fpts, diagnostics[0].kind], [null, 'no-record']);
    assert.match(snapshotMessage(diagnostics[0], null).message, /Tom Wilson.*season:/);
});

test('apostrophe player names resolve archive stats and NHL headshots across all cue types', async t => {
    const { db } = await disposableLeague(t, { seed: `
        insert into league.seasons values (2026, '2025–26', 'complete'), (2027, '2026–27', 'in-progress');
        insert into league.players values ('00ore', 'Ryan O''Reilly'), ('003vz', 'Tom Wilson');
        insert into league.player_seasons (player_id, season_year, nhl_team, positions, fpts, fpg) values
            ('00ore', 2026, 'NSH', '{C}', 245.5, 3.25),
            ('003vz', 2026, 'WSH', '{RW}', 372, 5.17);
    ` });
    const query = async (q: SQL) => (await db.execute(q)).rows;
    const state = memoryNhlState({ players: {
        8475158: nhlPlayer({ nhlId: 8475158, name: "Ryan O'Reilly", team: 'NSH', position: 'C', headshot: 'https://assets.nhle.com/mugs/8475158.png' }),
        8476880: nhlPlayer({ nhlId: 8476880, name: 'Tom Wilson', team: 'WSH', position: 'R', headshot: 'https://assets.nhle.com/mugs/8476880.png' }),
    } });
    const portraits = createMemoryNhl(state);
    const curly = "Ryan O\u2019Reilly";
    const ep = episodeFrom(script(
        `>> player "${curly}" JAGR "JAGR's center"\n>> gap "Ryan O'Reilly" "Tom Wilson"\n>> stat "245.5" "FPts" with "${curly}"\n>> numbers JAGR 1 goal with "${curly}"`,
    ));
    assert.deepEqual(ep.diagnostics, []);
    const { players, diagnostics } = await playerSnapshot(ep.statsSeason, ep.playerRefs, { query, nhl: portraits });
    assert.deepEqual(diagnostics, []);
    assert.deepEqual(players.map(p => [p.id, p.name, p.fpts, p.headshot]), [
        ['00ore', "Ryan O'Reilly", 245.5, 'https://assets.nhle.com/mugs/8475158.png'],
        ['003vz', 'Tom Wilson', 372, 'https://assets.nhle.com/mugs/8476880.png'],
    ]);
    assert.ok(state.identified.some(asked => asked.name === "Ryan O'Reilly"));
});

test('a verified identity tells same-name players apart, and the archive passes the Player ID, positions and team', async t => {
    const query = await archive(t);
    const portraits = nhl();
    // both Nylanders are Leafs, but the league has verified which one Fantrax's 003w3 is
    portraits.state.verified['003w3'] = 8400002;
    const { players } = await playerSnapshot(2026, [{ name: 'William Nylander' }], { query, nhl: portraits });
    assert.equal(players[0].headshot, 'https://assets.nhle.com/mugs/8400002.png');
    assert.deepEqual(portraits.state.identified, [{ name: 'William Nylander', playerId: '003w3', positions: ['RW'], nhlTeam: 'TOR' }]);
});

test('same-name players on one NHL team are told apart by position', async t => {
    const query = await archive(t);
    const state = memoryNhlState({ players: {
        8480012: nhlPlayer({ nhlId: 8480012, name: 'Elias Pettersson', team: 'VAN', position: 'C', headshot: 'https://assets.nhle.com/mugs/8480012.png' }),
        8483678: nhlPlayer({ nhlId: 8483678, name: 'Elias Pettersson', team: 'VAN', position: 'D', headshot: 'https://assets.nhle.com/mugs/8483678.png' }),
    } });
    const { players } = await playerSnapshot(2026, [{ name: 'Elias Pettersson', id: '048x9' }, { name: 'Elias Pettersson', id: '0ab12' }],
        { query, nhl: createMemoryNhl(state) });
    assert.deepEqual(players.map(p => [p.id, p.headshot]), [
        ['048x9', 'https://assets.nhle.com/mugs/8480012.png'], ['0ab12', 'https://assets.nhle.com/mugs/8483678.png'],
    ]);
});

test('an NHL outage leaves the Fantrax portrait and never fails the snapshot', async t => {
    const query = await archive(t);
    const down = nhl();
    down.state.down = true;
    const { players } = await playerSnapshot(2026, [{ name: 'Tom Wilson' }, { name: 'Nobody' }], { query, nhl: down });
    assert.deepEqual(players.map(p => [p.fpts, p.headshot]), [[372, FANTRAX.wilson], [null, null]]);
    const profileDown = nhl();
    profileDown.state.failing.add(8476880);
    assert.equal((await playerSnapshot(2026, [{ name: 'Tom Wilson' }], { query, nhl: profileDown })).players[0].headshot, FANTRAX.wilson);
});

test('the no-NHL adapter for public pages finds no identity', async () => {
    assert.equal(await noNhl.identify({ name: 'Tom Wilson', playerId: '003vz' }), null);
});
