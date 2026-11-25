// Keeper enrichment against the in-memory NHL, in a disposable league running Next's real cache: what an owner
// choosing keepers sees for each player (age, previous NHL season, previous fantasy season) and that NHL problems
// never stop the roster loading.
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createMemoryNhl, memoryNhlState, nhlPlayer, nhlSeason, type MemoryNhlState } from '../nhl/memory-nhl';
import type { Nhl } from '../nhl/model';
import { disposableLeague } from '../testing/disposable-league';
import type { KeeperPlayer } from './model';

/** 11 p.m. on October 4 in Toronto, already October 5 in UTC */
const NOW = new Date('2026-10-05T03:00:00.000Z');

const rostered = (player: Partial<KeeperPlayer> & Pick<KeeperPlayer, 'id' | 'name'>): KeeperPlayer =>
    ({ position: 'C', lineupPosition: 'C', nhlTeam: 'OTT', status: 'ACTIVE', ...player });

/** a league whose 2025–26 fantasy season gave `p1` 100 points (2 a game) and `p2` 80.5 (1.75 a game) */
async function keeperLeague(t: TestContext, state: MemoryNhlState, nhl: Nhl = createMemoryNhl(state)) {
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: `
        insert into league.seasons values (2026, '2025–26', 'complete');
        insert into league.players values ('p1', 'Tim Stutzle'), ('p2', 'Jake Allen');
        insert into league.player_seasons (player_id, season_year, positions, nhl_team, fpts, fpg)
            values ('p1', 2026, array['C', 'LW'], 'OTT', 100, 2), ('p2', 2026, array['G'], 'NJD', 80.5, 1.75);` });
    const { keeperEnrichment } = await import('./nhl');
    return { league, enrich: keeperEnrichment(nhl, () => NOW) };
}

test('a matched skater and goalie show their age in Toronto and their previous NHL and fantasy seasons', async t => {
    const state = memoryNhlState({
        players: {
            8482116: nhlPlayer({ nhlId: 8482116, name: 'Tim Stützle', birthDate: '2002-10-05', team: 'OTT', position: 'C',
                seasons: { 2025: nhlSeason({ games: 82, goals: 24 }), 2026: nhlSeason({ games: 78, goals: 30, assists: 50, points: 80 }) } }),
            8474596: nhlPlayer({ nhlId: 8474596, name: 'Jake Allen', birthDate: '1990-08-07', team: 'NJD', position: 'G',
                seasons: { 2026: nhlSeason({ games: 30, wins: 14, goalsAgainstAverage: 2.71, savePercentage: 0.902 }) } }),
        },
    });
    const { enrich } = await keeperLeague(t, state);
    const roster = [
        rostered({ id: 'p1', name: 'Tim Stutzle', position: 'C,LW' }),
        rostered({ id: 'p2', name: 'Jake Allen', position: 'G', lineupPosition: 'G', nhlTeam: 'NJD' }),
    ];

    const [skater, goalie] = await enrich(roster);

    assert.deepEqual(skater, { ...roster[0], details: {
        nhlId: 8482116, birthDate: '2002-10-05', age: 23, previousSeason: 2026,
        stats: { games: 78, goals: 30, assists: 50, points: 80, wins: null, gaa: null, savePct: null },
        fantasyPoints: 100, fantasyPerGame: 2, checkedAt: NOW.toISOString(),
    } });
    assert.deepEqual(goalie.details, {
        nhlId: 8474596, birthDate: '1990-08-07', age: 36, previousSeason: 2026,
        stats: { games: 30, goals: null, assists: null, points: null, wins: 14, gaa: 2.71, savePct: 0.902 },
        fantasyPoints: 80.5, fantasyPerGame: 1.75, checkedAt: NOW.toISOString(),
    });
    assert.deepEqual(state.identified, [
        { name: 'Tim Stutzle', playerId: 'p1', positions: ['C', 'LW'], nhlTeam: 'OTT' },
        { name: 'Jake Allen', playerId: 'p2', positions: ['G'], nhlTeam: 'NJD' },
    ]);
});

test('a stat the NHL did not give shows as missing, not zero, and no NHL line last season shows no NHL games', async t => {
    const state = memoryNhlState({
        players: {
            1: nhlPlayer({ nhlId: 1, name: 'No Games Given', team: 'OTT', seasons: { 2026: nhlSeason({ goals: 3, assists: 4 }) } }),
            2: nhlPlayer({ nhlId: 2, name: 'Played Elsewhere', team: 'OTT', seasons: { 2025: nhlSeason({ games: 10 }) } }),
            3: nhlPlayer({ nhlId: 3, name: 'No History', team: 'OTT', seasons: null }),
        },
    });
    const { enrich } = await keeperLeague(t, state);

    const [missing, elsewhere, unknown] = await enrich([
        rostered({ id: 'x1', name: 'No Games Given' }), rostered({ id: 'x2', name: 'Played Elsewhere' }), rostered({ id: 'x3', name: 'No History' }),
    ]);

    assert.deepEqual(missing.details?.stats, { games: null, goals: 3, assists: 4, points: null, wins: null, gaa: null, savePct: null });
    assert.deepEqual(elsewhere.details?.stats, { games: 0, goals: null, assists: null, points: null, wins: null, gaa: null, savePct: null });
    assert.equal(unknown.details?.stats, null);
    assert.equal(unknown.details?.nhlId, 3, 'still the matched player, with their age');
    assert.equal(unknown.details?.age, 22);
});

const unavailable = (fantasyPoints: number | null = null, fantasyPerGame: number | null = null) => ({
    nhlId: null, birthDate: null, age: null, previousSeason: 2026, stats: null, fantasyPoints, fantasyPerGame, checkedAt: null,
});

test('a player the NHL cannot match, or matches twice, shows as unavailable with their fantasy season', async t => {
    const state = memoryNhlState({
        players: {
            8475158: nhlPlayer({ nhlId: 8475158, name: "Ryan O'Reilly", team: 'NSH', position: 'C' }),
            8481026: nhlPlayer({ nhlId: 8481026, name: "Ryan O'Reilly", team: 'NSH', position: 'R' }),
        },
    });
    const { enrich } = await keeperLeague(t, state);

    const [unmatched, ambiguous] = await enrich([
        rostered({ id: 'p1', name: 'Tim Stutzle' }),
        rostered({ id: 'p3', name: "Ryan O'Reilly", position: 'C,RW', nhlTeam: 'NSH' }),
    ]);

    assert.deepEqual(unmatched.details, unavailable(100, 2));
    assert.deepEqual(ambiguous.details, unavailable());
    assert.deepEqual(state.read, [], 'no NHL record read for a player with no NHL identity');
});

test('a player with a verified identity gets that NHL player, not a same-name one', async t => {
    const state = memoryNhlState({
        players: {
            8475158: nhlPlayer({ nhlId: 8475158, name: "Ryan O'Reilly", team: 'NSH', position: 'C', birthDate: '1991-02-07' }),
            8481026: nhlPlayer({ nhlId: 8481026, name: "Ryan O'Reilly", team: null, position: 'R', birthDate: '2000-03-21' }),
        },
        verified: { '04qz4': 8481026 },
    });
    const { enrich } = await keeperLeague(t, state);

    const [verified] = await enrich([rostered({ id: '04qz4', name: "Ryan O'Reilly", position: 'C', nhlTeam: 'NSH' })]);

    assert.equal(verified.details?.nhlId, 8481026);
    assert.equal(verified.details?.age, 26);
    assert.deepEqual(verified.details?.stats, { games: 0, goals: null, assists: null, points: null, wins: null, gaa: null, savePct: null });
});

test('an NHL failure shows that player as unavailable while the rest of the roster loads', async t => {
    const state = memoryNhlState({
        players: {
            8482116: nhlPlayer({ nhlId: 8482116, name: 'Tim Stützle', team: 'OTT', seasons: { 2026: nhlSeason({ games: 78 }) } }),
            8474596: nhlPlayer({ nhlId: 8474596, name: 'Jake Allen', team: 'NJD', position: 'G' }),
            8480001: nhlPlayer({ nhlId: 8480001, name: 'Read Fails', team: 'OTT' }),
        },
        failing: new Set<string | number>(['p2', 8480001]),
    });
    const { enrich } = await keeperLeague(t, state);
    const roster = [
        rostered({ id: 'p1', name: 'Tim Stutzle' }),
        rostered({ id: 'p2', name: 'Jake Allen', position: 'G', lineupPosition: 'G', nhlTeam: 'NJD' }),
        rostered({ id: 'x1', name: 'Read Fails' }),
    ];

    const enriched = await enrich(roster);

    assert.deepEqual(enriched.map(player => player.id), ['p1', 'p2', 'x1']);
    assert.equal(enriched[0].details?.stats?.games, 78);
    assert.deepEqual(enriched[1].details, unavailable(80.5, 1.75), 'identify failed');
    assert.deepEqual(enriched[2].details, unavailable(), 'reading the NHL player failed');
});

test('NHL answers are kept for a day, failures are asked again, and players are looked up six at a time', async t => {
    const state = memoryNhlState({
        players: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [8480000 + i, nhlPlayer({ nhlId: 8480000 + i, name: `Player ${i}`, team: 'OTT' })])),
        failing: new Set(['Player 7']),
    });
    const memory = createMemoryNhl(state);
    let inFlight = 0;
    let mostInFlight = 0;
    const counted: Nhl = {
        ...memory,
        identify: async player => {
            mostInFlight = Math.max(mostInFlight, ++inFlight);
            try { return await memory.identify(player); } finally { inFlight--; }
        },
    };
    const { league, enrich } = await keeperLeague(t, state, counted);
    const roster = Array.from({ length: 8 }, (_, i) => rostered({ id: `r${i}`, name: `Player ${i}` }));

    const first = await enrich(roster);
    assert.equal(mostInFlight, 6);
    assert.equal(first[7].details?.nhlId, null);
    state.failing.clear();
    const asked = state.identified.length;
    const read = state.read.length;

    const second = await enrich(roster);

    assert.deepEqual(second.slice(0, 7), first.slice(0, 7), 'the same answers, from the cache');
    assert.deepEqual(state.identified.slice(asked).map(player => player.name), ['Player 7'], 'only the failed lookup is asked again');
    assert.deepEqual(state.read.slice(read), [8480007]);
    assert.equal(second[7].details?.nhlId, 8480007);
    const nhlEntries = [...league.cacheEntries()].filter(([key]) => key.includes('keeper-nhl'));
    assert.equal(nhlEntries.length, 16);
    assert.ok(nhlEntries.every(([, entry]) => entry.revalidate === 86400), 'kept for a day');
});
