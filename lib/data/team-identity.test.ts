import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { disposableLeague } from '../testing/disposable-league';

// Every page that shows a team reads its current identity or its season identity (GLOSSARY.md).
// These tests read through the loaders pages call, against the real migrations.

// Franchise 1 is the real Hub City → Paddyville franchise; its owner has since renamed it.
// Franchise 2 has no owner edits and an imported display name that its latest season replaced.
const SEED = `
    insert into league.seasons values (2020, '2019–20', 'cancelled'), (2026, '2025–26', 'complete');
    insert into league.owners (id, name) values (1, 'Sean Crocker'), (2, 'Pat Henriksson'), (3, 'Daniel Sauve'), (4, 'Cameron Bowie');
    insert into league.franchises (id, display_name, logo_url, first_season, folded_after_season) values
        (1, 'Paddyville Lucifers', '/pvlslogo.png', 2020, null),
        (2, 'Purrsey Devils (imported)', '/logos/new_purrsey_devils.jpg', 2020, null),
        (3, 'Expansion Club', null, 2027, null),
        (4, 'Retro Phenoms', '/logos/retro_phenoms_logo.jpg', 2026, 2026);
    insert into league.team_seasons (id, season_year, franchise_id, owner_id, name, fantrax_name, abbreviation, logo_url, division, division_rank, wins, losses, ties, fpts_for, fpts_against) values
        (1, 2020, 1, 1, 'Hub City Hyman Hounds', 'Hub City Hyman Hounds', 'HCHH', '/logos/hub_city_hyman_hounds.jpg', 1, 1, 10, 5, 0, 900, 800),
        (2, 2020, 2, 3, 'New Purrsey Devils', 'New Purrsey Devils', 'NPD', null, 1, 2, 5, 10, 0, 800, 900),
        (3, 2026, 1, 2, 'Paddyville Lucifers', 'Paddyville Lucifers', 'PVLS', '/pvlslogo.png', 1, 1, 12, 3, 0, 1000, 800),
        (4, 2026, 2, 3, 'New Purrsey Devils', 'New Purrsey Devils', 'NPD', null, 1, 2, 8, 7, 0, 950, 900),
        (5, 2026, 4, 4, 'Retro Phenoms', 'Retro Phenoms', 'RP', '/logos/retro_phenoms_logo.jpg', 1, 3, 2, 13, 0, 700, 900);
    insert into league.team_management (franchise_id, name, logo_url, owner_uid, owner_email)
        values (1, 'Paddyville Inferno', '/logos/uploads/inferno.webp', 'owner-1', 'owner@example.test');
    -- Fantrax exports spelled names their own way; history shows the season identity instead.
    insert into league.players values ('p1', 'Player One');
    insert into league.draft_picks (season_year, overall, round, pick, franchise_id, team_name, player_id, player_name, positions, drafted_on, source_time, source_file)
        values (2020, 1, 1, 1, 1, 'The Hub City Hyman Hounds', 'p1', 'Player One', 'C', '2019-09-30', '', 'draft.csv'),
               (2026, 1, 1, 1, 2, 'New Purrsey Devils (Fantrax)', null, 'Unknown', 'C', '2025-09-30', '', 'draft.csv');
    insert into league.transaction_events values ('trade', 2020, 'trade', '2020-01-10T12:00:00Z', '2020-01-10', 'trades.csv', '');
    insert into league.transaction_assets values ('trade:1', 'trade', 'p1', 'Player One', 'player', 'trade', 1, 2, 'The Hub City Hyman Hounds', 'Devils', 1);
`;

// Fantrax's live team 6pfjiq07mutybt24 is franchise 1; the saved snapshot keeps Fantrax off the network.
const LEAGUE = 'rf5o9cu2mutybszr';
const snapshot = () => ({
    source: {
        fetchedAt: new Date().toISOString(),
        info: {
            seasonYear: 2027,
            teamInfo: {
                '6pfjiq07mutybt24': { id: '6pfjiq07mutybt24', name: 'Fantrax spelling' },
                '4num7i90mutybt24': { id: '4num7i90mutybt24', name: 'Fantrax spelling 2' },
            },
            scoringPeriods: [{ number: 1, startDate: '2099-10-07T00:00:00.000Z', endDate: '2099-10-13T23:59:59.000Z' }],
            rosterPeriods: [],
            matchups: [],
            playoffs: { numPlayoffTeams: 4, lastRegularSeasonPeriod: 20 },
        },
        rosters: { period: 1, rosters: {} },
        standings: [],
    },
    scores: {},
    leaders: { fetchedAt: new Date().toISOString(), players: [] },
    rosterStats: { fetchedAt: new Date().toISOString(), players: {} },
});

async function setup(t: TestContext) {
    const { client } = await disposableLeague(t, { app: true, nextCache: true, seed: SEED, fetch: async url => {
        if (String(url).includes('getPlayerIds')) return Response.json({ p: { name: 'Player, Test', position: 'C' } });
        throw new Error('Tests must not access the network');
    } });
    // league.yml maps the live season's Fantrax teams to franchises; the importer loads it into league.fantrax_teams.
    await client.query(`insert into league.fantrax_teams (season_year, fantrax_league_id, fantrax_team_id, franchise_id) values
        (2027, $1, '6pfjiq07mutybt24', 1), (2027, $1, '4num7i90mutybt24', 2)`, [LEAGUE]);
    await client.query(`insert into league.fantrax_snapshots (league_id, data) select $1, $2::jsonb`, [LEAGUE, JSON.stringify(snapshot())]);
    return { client };
}

type Identity = { name: string; abbreviation: string; logo: string | null };

// The same franchise as each current-team surface shows it.
async function currentSurfaces(id: number, ownerUid: string | null) {
    const league = await import('./league');
    const { getSearchDirectory } = await import('./search');
    const { getLotteryTeams } = await import('../lottery/data');
    const { getManagedTeam, getOwnedTeam } = await import('../owner/teams');
    const { getLiveSeason } = await import('../fantrax/live-season');
    const { getStudioTeams } = await import('./coachs-corner');
    const card = (await league.getFranchiseCards()).find(card => card.ID === id)!;
    const page = (await league.getFranchise(id))!;
    const lottery = (await getLotteryTeams()).find(team => team.id === id)!;
    const managed = (await getManagedTeam(id))!;
    const search = (await getSearchDirectory()).find(entry => entry.kind === 'teams' && entry.id === String(id))!;
    const season = await getLiveSeason({ now: Date.now() });
    if (season.status !== 'available') assert.fail('the live season is unavailable');
    const live = season.value.teams.find(team => team.franchiseId === id)!;
    const studio = (await getStudioTeams()).find(team => team.id === id)!;
    const surfaces: Record<string, Identity> = {
        'franchise cards': { name: card.Team, abbreviation: card.Abbreviation, logo: card.LogoUrl },
        'team page': { name: page.name, abbreviation: page.abbreviation, logo: page.logo },
        'lottery team list': { name: lottery.name, abbreviation: lottery.abbreviation, logo: lottery.logo },
        'admin team list': { name: managed.name, abbreviation: managed.abbreviation, logo: managed.logo },
        search: { name: search.title, abbreviation: search.abbreviation!, logo: search.logo ?? null },
        'live season snapshot': { name: live.name, abbreviation: live.abbreviation, logo: live.logo },
        "Coach's Corner team list": { name: studio.name, abbreviation: studio.abbreviation, logo: studio.logo },
    };
    if (ownerUid) {
        const owned = (await getOwnedTeam(ownerUid))!;
        surfaces['owner team'] = { name: owned.name, abbreviation: owned.abbreviation, logo: owned.logo };
    }
    return surfaces;
}

test('an owner rename and new logo appear identically on every current-team surface', async t => {
    await setup(t);
    const expected: Identity = { name: 'Paddyville Inferno', abbreviation: 'PVLS', logo: '/logos/uploads/inferno.webp' };
    for (const [surface, identity] of Object.entries(await currentSurfaces(1, 'owner-1'))) assert.deepEqual(identity, expected, surface);
});

test('without owner edits, every current-team surface shows the latest team season', async t => {
    await setup(t);
    // The 2026 season has no logo of its own, so the franchise logo stands in.
    const expected: Identity = { name: 'New Purrsey Devils', abbreviation: 'NPD', logo: '/logos/new_purrsey_devils.jpg' };
    for (const [surface, identity] of Object.entries(await currentSurfaces(2, null))) assert.deepEqual(identity, expected, surface);
});

test("Coach's Corner's team list is every active franchise's current identity, owner and saved colours", async t => {
    const { client } = await setup(t);
    await client.exec(`update league.team_management set branding = '{"primary":"#123abc","secondary":"#d24015","tertiary":"#ffffff","treatment":"stripes"}' where franchise_id = 1`);
    const { loadStudioTeams } = await import('../coachs-corner/studio-teams');
    const fallback = { primary: '#26365F', secondary: '#C8102E' };
    const teams = await loadStudioTeams();
    assert.deepEqual(teams, [
        { id: 1, name: 'Paddyville Inferno', abbreviation: 'PVLS', owner: 'Pat Henriksson', ownerFirst: 'Pat', logo: '/logos/uploads/inferno.webp', primary: '#123ABC', secondary: '#D24015' },
        { id: 2, name: 'New Purrsey Devils', abbreviation: 'NPD', owner: 'Daniel Sauve', ownerFirst: 'Daniel', logo: '/logos/new_purrsey_devils.jpg', ...fallback },
        { id: 3, name: 'Expansion Club', abbreviation: 'Exp', owner: null, ownerFirst: null, logo: null, ...fallback },
    ], 'the defunct franchise is left out; teams without saved colours get the fallback');
    const { getStudioTeams } = await import('./coachs-corner');
    assert.deepEqual(await getStudioTeams(), teams, 'the site reads the same list');
});

test('history shows each season identity while the team page shows the current one', async t => {
    await setup(t);
    const league = await import('./league');
    const standings = (await league.getSeasonDetail(2020)).standings;
    const hubCity = standings.find(row => row.franchiseId === 1)!;
    assert.deepEqual({ name: hubCity.name, abbreviation: hubCity.abbreviation, logo: hubCity.logo },
        { name: 'Hub City Hyman Hounds', abbreviation: 'HCHH', logo: '/logos/hub_city_hyman_hounds.jpg' });
    assert.equal(standings.find(row => row.franchiseId === 2)?.logo, '/logos/new_purrsey_devils.jpg', 'a season without its own logo shows the franchise logo');
    assert.equal((await league.getSeasonDetail(2026)).standings.find(row => row.franchiseId === 1)?.name, 'Paddyville Lucifers', 'an owner rename never rewrites a season');

    const page = (await league.getFranchise(1))!;
    assert.equal(page.name, 'Paddyville Inferno');
    assert.deepEqual([...page.formerNames].sort(), ['Hub City Hyman Hounds', 'Paddyville Lucifers']);
    assert.deepEqual(page.seasons.map(season => [season.year, season.name]), [[2026, 'Paddyville Lucifers'], [2020, 'Hub City Hyman Hounds']]);
});

test('a franchise with no seasons yet shows its own name and a three-letter abbreviation', async t => {
    await setup(t);
    const league = await import('./league');
    const { getLotteryTeams } = await import('../lottery/data');
    const { getManagedTeams } = await import('../owner/teams');
    const expected = { name: 'Expansion Club', abbreviation: 'Exp' };
    const card = (await league.getFranchiseCards()).find(card => card.ID === 3);
    const lottery = (await getLotteryTeams()).find(team => team.id === 3);
    const managed = (await getManagedTeams()).find(team => team.id === 3);
    assert.deepEqual({ name: card?.Team, abbreviation: card?.Abbreviation }, expected, 'franchise cards');
    assert.deepEqual({ name: lottery?.name, abbreviation: lottery?.abbreviation }, expected, 'lottery team list');
    assert.deepEqual({ name: managed?.name, abbreviation: managed?.abbreviation }, expected, 'admin team list');
});

test('a defunct franchise is flagged the same way everywhere', async t => {
    await setup(t);
    const league = await import('./league');
    const { getSearchDirectory } = await import('./search');
    const { getLotteryTeams } = await import('../lottery/data');
    const { getManagedTeams } = await import('../owner/teams');
    assert.deepEqual({
        cards: (await league.getFranchiseCards()).filter(card => card.defunct).map(card => card.ID),
        search: (await getSearchDirectory()).filter(entry => entry.kind === 'teams' && entry.defunct).map(entry => Number(entry.id)),
        admin: (await getManagedTeams()).filter(team => team.defunct).map(team => team.id),
    }, { cards: [4], search: [4], admin: [4] });
    assert.deepEqual((await getLotteryTeams()).map(team => team.id).sort(), [1, 2, 3], 'defunct franchises are not in the draw');
});

test('searching a former name finds the franchise under its current identity', async t => {
    await setup(t);
    const { searchPublicDirectory } = await import('./search');
    const [result] = (await searchPublicDirectory({ q: 'Hub City', type: 'teams', page: 1 })).groups[0].results;
    assert.equal(result.href, '/teams/1');
    assert.equal(result.title, 'Paddyville Inferno');
});

test('a club name splits into place and nickname until its owner renames it', async () => {
    const { clubName } = await import('../team-identity');
    assert.deepEqual(clubName(1, 'Paddyville Lucifers'), { place: 'Paddyville', nickname: 'Lucifers' });
    assert.deepEqual(clubName(3, 'Hooterville Honkers'), { place: 'Hooterville', nickname: 'Honkers' });
    assert.deepEqual(clubName(4, 'Varrock Dark Wizards'), { place: 'Varrock', nickname: 'Dark Wizards' }, 'multiword nicknames stay together');
    assert.deepEqual(clubName(1, 'Paddyville Inferno'), { place: null, nickname: 'Paddyville Inferno' }, 'a renamed club is all nickname');
    assert.deepEqual(clubName(3, 'Paddyville Lucifers'), { place: null, nickname: 'Paddyville Lucifers' }, 'the split belongs to the franchise, not the name');
    assert.deepEqual(clubName(99, 'Expansion Club'), { place: null, nickname: 'Expansion Club' });
});

test('draft and transaction history show each team under its season identity', async t => {
    await setup(t);
    const history = await import('./history');
    const draft = (await history.getSeasonDraft(2020))[0];
    assert.deepEqual({ name: draft.teamName, abbreviation: draft.teamAbbreviation, logo: draft.teamLogo },
        { name: 'Hub City Hyman Hounds', abbreviation: 'HCHH', logo: '/logos/hub_city_hyman_hounds.jpg' }, 'season draft');
    assert.equal((await history.getSeasonDraft(2026))[0].teamLogo, '/logos/new_purrsey_devils.jpg', 'a season without its own logo shows the franchise logo');

    const events = (await history.getHistory({ playerId: 'p1' })).events;
    const trade = events.find(event => event.kind === 'trade')!.assets[0];
    assert.deepEqual([trade.from?.name, trade.to?.name], ['Hub City Hyman Hounds', 'New Purrsey Devils'], 'trade');
    const pick = events.find(event => event.kind === 'draft')!.assets[0];
    assert.deepEqual(pick.to, { id: 1, name: 'Hub City Hyman Hounds', abbreviation: 'HCHH', logo: '/logos/hub_city_hyman_hounds.jpg' }, 'draft feed');
});
