import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudioPlayer, StudioTeam } from '../coachs-corner/teams';
import { disposableLeague } from '../testing/disposable-league';
import { LEAGUE_TAG } from './cache-tags';

const screenplay = (title: string, player: boolean | string = false) => `---\ntitle: ${title}\nseason: 2027\nweek: 2\n---\n${player ? `>> ${player === true ? 'player "Player One"' : player}\n` : ''}DON: Welcome to the show.\n\nRON: Good evening.`;

test('publishing and real Next data caching against disposable Postgres', async t => {
    let network = 0;
    const nhl = async (url: string | URL | Request) => {
        network++;
        if (String(url).includes('search.d3.nhle.com')) return Response.json(new URL(String(url)).searchParams.get('q') === 'Player One' ? [{ playerId: '123', name: 'Player One', teamAbbrev: 'TOR' }] : []);
        if (String(url).includes('/123/landing')) return Response.json({ headshot: 'https://assets.nhle.com/test-player.png' });
        throw new Error(`Unexpected network request: ${url}`);
    };
    let nhlFetch: typeof fetch = nhl;
    const league = await disposableLeague(t, { app: true, nextCache: true, fetch: (input, init) => nhlFetch(input, init), seed: `insert into league.seasons values (2026, '2025–26', 'complete');
        insert into league.players values ('p1', 'Player One');
        insert into league.player_seasons (player_id, season_year, positions, nhl_team, fpts, fpg)
        values ('p1', 2026, array['C'], 'TOR', 100, 2);
        -- the studio team list: Carolina's latest team season used the second of its league.yml abbreviations, and two owners are Nick
        insert into league.owners (id, name) values (1, 'Jeremy Smith'), (2, 'Brian Morris'), (3, 'Nick Brown'), (4, 'Nick Green');
        insert into league.franchises (id, display_name, logo_url, first_season) values
            (1, 'Paddyville Lucifers', '/pvlslogo.png', 2020), (3, 'Hooterville Honkers', '/hhlogo.png', 2020),
            (5, 'Jagrtown Ice Fellas', '/jagrlogo.png', 2020), (9, 'Carolina Reapers', '/reaplogo.png', 2020);
        insert into league.team_seasons (id, season_year, franchise_id, owner_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against) values
            (1, 2026, 1, 4, 'Paddyville Lucifers', 'Paddyville Lucifers', 'PVLS', 1, 1, 10, 5, 0, 900, 800),
            (3, 2026, 3, 1, 'Hooterville Honkers', 'Hooterville Honkers', 'HH', 1, 2, 9, 6, 0, 880, 800),
            (5, 2026, 5, 3, 'Jagrtown Ice Fellas', 'Jagrtown Ice Fellas', 'JAGR', 1, 3, 8, 7, 0, 860, 800),
            (9, 2026, 9, 2, 'Carolina Reapers', 'Carolina Reapers', 'Reapers', 1, 4, 7, 8, 0, 840, 800);
        insert into league.team_management (franchise_id, name, logo_url, owner_uid, owner_email)
            values (9, 'Carolina Reapers', '/team-logos/9/old.webp', 'owner-9', 'owner@example.test');` });
    const { client } = league;
    const outage = () => league.failNextQuery('', new Error('simulated database outage'));
    const data = await import('./coachs-corner');
    const { episodeFrom } = await import('../coachs-corner/episode');
    const refsOf = (episode: { script: string }) => episodeFrom(episode.script);
    const { saveEpisodeRecord, deleteEpisodeRecord, unpublishEpisodeRecord, publicationEffects, verifyEpisodeSummaries } = await import('../coachs-corner/publishing');
    const apply = (change: Awaited<ReturnType<typeof saveEpisodeRecord>> | undefined) => {
        assert.ok(change && !('error' in change), JSON.stringify(change));
        const effects = publicationEffects(change);
        for (const tag of effects.tags) league.expire(tag);
        return { ...change, effects };
    };
    const record = () => client.query<{ script: string; players: unknown; slug: string }>('select script, players, slug from league.coachs_corner_episodes where id=$1', [id]);
    let id = 0;

    await t.test('outages and missing migrations reject without poisoning empty or not-found caches', async () => {
        for (const read of [data.getPublishedEpisodes, () => data.getPublishedEpisode('week-two')]) {
            league.expire(LEAGUE_TAG);
            outage();
            await assert.rejects(read, /simulated database outage/);
            assert.equal(league.cacheEntries().size, 0);
            await read();
            assert.equal(league.cacheEntries().size, 1);
        }
        league.expire(LEAGUE_TAG);
        await client.exec('alter table league.coachs_corner_episodes rename to episodes_temporarily_missing');
        await assert.rejects(data.getPublishedEpisodes);
        assert.equal(league.cacheEntries().size, 0);
        await client.exec('alter table league.episodes_temporarily_missing rename to coachs_corner_episodes');
        assert.equal((await data.getPublishedEpisodes()).length, 1, 'successful empty archive falls back to pilot');
    });
    await t.test('invalid publication and reserved URLs never write; invalid drafts can be saved', async () => {
        const before = league.queries();
        assert.ok('error' in await saveEpisodeRecord({ id: null, slug: 'bad', script: 'unfinished', publish: true }));
        assert.ok('error' in await saveEpisodeRecord({ id: null, slug: 'local', script: screenplay('Reserved') }));
        assert.equal(league.queries(), before);
        const draft = apply(await saveEpisodeRecord({ id: null, slug: 'week-two', script: 'unfinished' }));
        id = draft.id;
        assert.deepEqual(draft.effects.tags, []);
        assert.ok(draft.effects.paths.every(path => path.startsWith('/admin/')));
        assert.equal(await data.getPublishedEpisode('week-two'), null);
    });
    await t.test('draft save/delete keeps public caches warm and makes no NHL requests', async () => {
        await data.getPublishedEpisodes();
        await data.getPublishedEpisode(data.pilotEpisode().slug);
        apply(await saveEpisodeRecord({ id, slug: 'week-two', script: screenplay('Draft', true) }));
        const extra = apply(await saveEpisodeRecord({ id: null, slug: 'other-draft', script: '' }));
        const deleted = apply(await deleteEpisodeRecord(extra.id));
        assert.deepEqual(deleted.effects.tags, []);
        const before = league.queries();
        await data.getPublishedEpisodes();
        await data.getPublishedEpisode('week-two');
        await data.getPublishedEpisode(data.pilotEpisode().slug);
        assert.equal(league.queries(), before);
        assert.equal(network, 0);
    });
    await t.test('publishing clears cached 404/archive and freezes statistics and headshot URLs', async () => {
        const published = apply(await saveEpisodeRecord({ id, slug: 'week-two', script: screenplay('Published', true), publish: true }));
        assert.ok(published.effects.tags.includes(data.episodeTag('week-two')));
        assert.equal((await data.getPublishedEpisodes())[0].title, 'Published');
        const episode = await data.getPublishedEpisode('week-two');
        assert.ok(episode);
        assert.deepEqual(episode.players, [{ id: 'p1', name: 'Player One', headshot: 'https://assets.nhle.com/test-player.png',
            nhlTeam: 'TOR', positions: ['C'], season: 2026, fpts: 100, fpg: 2, games: null }], 'no games played is derived from FPts / FP/G');
        assert.equal(network, 2);
        await client.exec('update league.player_seasons set fpts=200');
        const before = league.queries();
        nhlFetch = async () => { throw new Error('Public pages must not fetch NHL data'); };
        for (let i = 0; i < 10; i++) {
            const cached = await data.getPublishedEpisode('week-two');
            assert.equal((await data.getEpisodePlayers(cached!, refsOf(cached!)))[0].fpts, 100);
            await data.getPublishedEpisodes();
        }
        assert.equal(league.queries(), before, 'ten views cause zero database queries');
    });
    await t.test('stale draft saves and invalid updates cannot alter published content', async () => {
        const before = (await record()).rows[0];
        for (const publish of [false, true]) {
            const result = await saveEpisodeRecord({ id, slug: 'hijacked', script: 'invalid', publish });
            assert.ok('error' in result);
            assert.deepEqual((await record()).rows[0], before);
        }
        outage();
        await assert.rejects(() => saveEpisodeRecord({ id, slug: 'week-two', script: screenplay('Failed refresh', true), publish: true }));
        assert.deepEqual((await record()).rows[0], before, 'failed snapshot leaves the live episode untouched');
    });
    await t.test('published update refreshes snapshot and both sides of a renamed URL', async () => {
        await data.getPublishedEpisode('renamed'); // cache 404
        const changed = apply(await saveEpisodeRecord({ id, slug: 'renamed', script: screenplay('Updated', true), publish: true }));
        assert.equal(changed.oldSlug, 'week-two');
        assert.ok(changed.effects.paths.includes('/coachs-corner/week-two'));
        assert.ok(changed.effects.paths.includes('/coachs-corner/renamed'));
        assert.equal(await data.getPublishedEpisode('week-two'), null);
        assert.equal((await data.getPublishedEpisode('renamed'))?.players?.[0].fpts, 200);
        assert.equal((await data.getPublishedEpisodes())[0].title, 'Updated');
        const before = league.queries();
        await data.getPublishedEpisode(data.pilotEpisode().slug);
        assert.equal(league.queries(), before, 'unrelated episode data remains cached');
        assert.ok('error' in await saveEpisodeRecord({ id: null, slug: 'renamed', script: screenplay('Duplicate') }));
    });
    await t.test('unpublish, draft editing, republish and deletion all clear the appropriate public data', async () => {
        apply(await unpublishEpisodeRecord(id));
        assert.equal(await data.getPublishedEpisode('renamed'), null);
        assert.equal((await data.getPublishedEpisodes()).length, 1);
        assert.equal(await unpublishEpisodeRecord(id), undefined);
        const draft = apply(await saveEpisodeRecord({ id, slug: 'renamed', script: 'unfinished again' }));
        assert.deepEqual(draft.effects.tags, []);
        apply(await saveEpisodeRecord({ id, slug: 'renamed', script: screenplay('Republished'), publish: true }));
        assert.equal((await data.getPublishedEpisode('renamed'))?.title, 'Republished');
        apply(await deleteEpisodeRecord(id));
        assert.equal(await data.getPublishedEpisode('renamed'), null);
        assert.equal((await data.getPublishedEpisodes()).length, 1);
        assert.equal(await deleteEpisodeRecord(id), undefined);
    });
    await t.test('the bundled pilot keeps its 2025-26 player snapshot without live stats or NHL lookups', async () => {
        const before = league.queries();
        const players = await data.getEpisodePlayers(data.pilotEpisode(), refsOf(data.pilotEpisode()));
        assert.deepEqual(players.map(p => [p.name, p.season, p.fpts]), [
            ['Tom Wilson', 2026, 372], ['William Nylander', 2026, 378.25], ['Nico Hischier', 2026, 382.25],
        ]);
        assert.equal(league.queries(), before, 'the episode must not drift to the latest database season');
        assert.equal(network, 2, 'the archived portraits need no NHL lookup');
    });
    await t.test('legacy player fallback quotes the episode’s own stats season, caches one stats query and makes no NHL lookups', async () => {
        league.expire(LEAGUE_TAG);
        await client.exec(`insert into league.seasons values (2027, '2026–27', 'complete');
            insert into league.player_seasons (player_id, season_year, positions, nhl_team, fpts, fpg) values ('p1', 2027, array['C'], 'TOR', 999, 9);`);
        const episode = { ...data.pilotEpisode(), script: screenplay('Legacy', true), players: null };
        const before = league.queries();
        const [player] = await data.getEpisodePlayers(episode, refsOf(episode));
        assert.deepEqual([player.season, player.fpts, player.games], [2026, 200, null], 'never the newer 2026–27 line');
        await data.getEpisodePlayers(episode, refsOf(episode));
        assert.equal(league.queries(), before + 1);
        assert.equal(network, 2);
        const retro = { ...episode, script: screenplay('Legacy', true).replace('season: 2027', 'season: 2028\nstats: 2027') };
        assert.equal((await data.getEpisodePlayers(retro, refsOf(retro)))[0].fpts, 999);
    });
    await t.test('publishing refuses a namesake cited by bare name, and the Fantrax id publishes each one', async () => {
        await client.exec(`insert into league.players values ('*048x9*', 'Elias Pettersson'), ('*0ab12*', 'Elias Pettersson');
            insert into league.player_seasons (player_id, season_year, positions, nhl_team, fpts, fpg)
            values ('*048x9*', 2026, array['C'], 'VAN', 309.75, 4.2), ('*0ab12*', 2026, array['D'], 'VAN', 134, 1.9);`);
        const count = async () => (await client.query<{ n: number }>('select count(*)::int as n from league.coachs_corner_episodes')).rows[0].n;
        const before = await count();
        const refused = await saveEpisodeRecord({ id: null, slug: 'petterssons', script: screenplay('Petterssons', 'gap "Elias Pettersson" "Player One"'), publish: true });
        assert.ok('error' in refused && /#048x9 \(VAN, 309\.75 FPts\).*#0ab12 \(VAN, 134 FPts\)/.test(refused.error), JSON.stringify(refused));
        assert.equal(await count(), before, 'an ambiguous episode is never written');
        const saved = apply(await saveEpisodeRecord({ id: null, slug: 'petterssons', script: screenplay('Petterssons', 'gap "Elias Pettersson" #048x9 "Elias Pettersson" #0ab12'), publish: true }));
        const stored = await data.getEpisodeById(saved.id);
        assert.deepEqual(stored?.players?.map(p => [p.id, p.fpts, p.games]), [['048x9', 309.75, null], ['0ab12', 134, null]]);
    });
    await t.test('publishing needs a slug that leads with the episode season year, or no year at all', async () => {
        const before = league.queries();
        const rejected = await saveEpisodeRecord({ id: null, slug: '2026-week-4-recap', script: screenplay('Start year'), publish: true });
        assert.ok('error' in rejected && /2027/.test(rejected.error), JSON.stringify(rejected));
        assert.equal(league.queries(), before, 'a rejected slug never writes');
        apply(await saveEpisodeRecord({ id: null, slug: '2027-week-4-recap', script: screenplay('Season year'), publish: true }));
        apply(await saveEpisodeRecord({ id: null, slug: 'opening-week', script: screenplay('No year'), publish: true }));
        apply(await saveEpisodeRecord({ id: null, slug: '2026-week-5-draft', script: screenplay('Draft') }));
    });
    await t.test('publishing stores the episode module summary, and verify finds and fixes rows that drifted from it', async () => {
        const script = screenplay('Summary check', true);
        const { summary } = episodeFrom(script);
        const saved = apply(await saveEpisodeRecord({ id: null, slug: '2027-week-2-summary', script, publish: true }));
        const stored = await data.getEpisodeById(saved.id);
        assert.deepEqual([stored?.title, stored?.season, stored?.week, stored?.durationMs], ['Summary check', 2027, 2, summary.runtime]);
        assert.deepEqual(await verifyEpisodeSummaries(), [], 'every row was written by the current compiler');

        // as if published by an older compiler
        await client.query('update league.coachs_corner_episodes set duration_ms = 1234, title = $2 where id = $1', [saved.id, 'Old title']);
        const drift = [{ id: saved.id, slug: '2027-week-2-summary', fields: [
            { field: 'title', stored: 'Old title', compiled: 'Summary check' },
            { field: 'runtime', stored: 1234, compiled: summary.runtime },
        ] }];
        assert.deepEqual(await verifyEpisodeSummaries(), drift);
        const others = (await data.getAllEpisodes()).filter(e => e.id !== saved.id);
        assert.deepEqual(await verifyEpisodeSummaries({ fix: true }), drift, 'fix reports what it rewrote');

        const fixed = await data.getEpisodeById(saved.id);
        assert.deepEqual([fixed?.title, fixed?.durationMs], ['Summary check', summary.runtime]);
        assert.deepEqual(fixed?.players, stored?.players, 'the frozen players snapshot stays');
        assert.equal(fixed?.publishedAt, stored?.publishedAt, 'the first air date stays');
        assert.equal(fixed?.updatedAt, stored?.updatedAt, 'a cache repair is not an edit');
        assert.deepEqual((await data.getAllEpisodes()).filter(e => e.id !== saved.id), others, 'up-to-date rows are untouched');
        assert.deepEqual(await verifyEpisodeSummaries({ fix: true }), [], 'running fix twice changes nothing');
    });
    await t.test('the local draft and the published episode show identical player rows for one script and archive', async () => {
        nhlFetch = nhl;
        const { captureArchivedStats } = await import('../coachs-corner/production/archived-stats');
        const { referencePacket } = await import('../coachs-corner/production/facts');
        const { loadLeagueConfig } = await import('../../scripts/db/lib/league-config');
        const { findPlayer } = await import('../coachs-corner/teams');
        const script = screenplay('Agreement', 'gap "Player One" "Elias Pettersson" #048x9 "Elias Pettersson" #0ab12 "Nobody Here"');
        const episode = episodeFrom(script);
        const draft = await captureArchivedStats(referencePacket(loadLeagueConfig(), 2027, await data.getStudioTeams()), episode.playerRefs, { season: episode.statsSeason! });
        const saved = apply(await saveEpisodeRecord({ id: null, slug: 'agreement', script, publish: true }));
        const published = (await data.getEpisodeById(saved.id))?.players ?? [];
        const card = ({ id, name, headshot, nhlTeam, positions, season, fpts, fpg, games }: StudioPlayer) => ({ id, name, headshot, nhlTeam, positions, season, fpts, fpg, games });
        const shown = (players: StudioPlayer[]) => episode.playerRefs.map(ref => card(findPlayer(players, ref)!));
        assert.deepEqual(shown(draft.players), shown(published));
        assert.deepEqual(published.map(card), shown(published), 'the episode stores only the cited players, in order');
        assert.deepEqual(published.map(p => [p.id, p.fpts, p.headshot]), [
            ['p1', 200, 'https://assets.nhle.com/test-player.png'], ['048x9', 309.75, 'https://fantraximg.com/si/headshots/NHL/hs048x9_96_9.png'], ['0ab12', 134, null], [null, null, null],
        ]);
    });
    const teamCue = (cue: string) => screenplay('Teams', cue);
    const errorsAt = (diagnostics: { line: number; severity: string; message: string }[]) =>
        diagnostics.filter(d => d.severity === 'error').map(d => `Line ${d.line}: ${d.message}`).join(' ');
    await t.test('Publish refuses a team cue that is unknown or matches two teams, and leaves the live episode untouched; a draft saves', async () => {
        const live = apply(await saveEpisodeRecord({ id: null, slug: 'team-check', script: teamCue('matchup HH 10 Reapers 9'), publish: true }));
        const stored = async () => (await client.query('select script, teams, published_at from league.coachs_corner_episodes where id = $1', [live.id])).rows[0];
        const before = await stored();
        const unknown = await saveEpisodeRecord({ id: live.id, slug: 'team-check', script: teamCue('matchup HH 10 Reaper 9'), publish: true });
        assert.deepEqual(unknown, { error: 'Line 6: No team matches “Reaper”. Use an abbreviation (PVLS, HH, JAGR, Reapers), an owner’s first name or a team name.' });
        const ambiguous = await saveEpisodeRecord({ id: live.id, slug: 'team-check', script: teamCue('team Nick'), publish: true });
        assert.deepEqual(ambiguous, { error: 'Line 6: “Nick” matches 2 teams: PVLS (Paddyville Lucifers, Nick Green), JAGR (Jagrtown Ice Fellas, Nick Brown). Use the abbreviation of the one you mean.' });
        assert.deepEqual(await stored(), before);
        const draft = apply(await saveEpisodeRecord({ id: null, slug: 'team-draft', script: teamCue('matchup Nick 10 Reaper 9') }));
        assert.equal((await data.getEpisodeById(draft.id))?.teams, null, 'a draft stores no team snapshot');
    });
    await t.test('a published episode keeps the teams it aired with after a rename and new logo, and keeps that logo from being deleted', async () => {
        const { saveTeamIdentity } = await import('./curated-edits');
        const saved = apply(await saveEpisodeRecord({ id: null, slug: 'frozen-teams', script: teamCue('team Reapers "Before the rebrand"'), publish: true }));
        await data.getPublishedEpisode('frozen-teams');
        const expired: string[] = [];
        const renamed = await saveTeamIdentity({ uid: 'owner-9' }, { franchiseId: 9, version: 1, name: 'Carolina Grim', logoUrl: '/team-logos/9/new.webp' },
            { invalidate: tag => { expired.push(tag); } });
        assert.deepEqual(renamed, { ok: true, orphanedLogoUrl: null }, 'the episode still shows the old logo');
        for (const tag of expired) league.expire(tag);
        const episode = (await data.getPublishedEpisode('frozen-teams'))!;
        const carolina = (await data.getEpisodeTeams(episode)).find(team => team.id === 9);
        assert.deepEqual([carolina?.name, carolina?.abbreviation, carolina?.logo], ['Carolina Reapers', 'Reapers', '/team-logos/9/old.webp']);
        assert.equal((await data.getStudioTeams()).find(team => team.id === 9)?.name, 'Carolina Grim', 'the live list has the rename');
        // a logo nothing shows any more is still cleaned up
        assert.deepEqual(await saveTeamIdentity({ uid: 'owner-9' }, { franchiseId: 9, version: 2, name: 'Carolina Grim', logoUrl: '/team-logos/9/newer.webp' }, { invalidate: () => {} }),
            { ok: true, orphanedLogoUrl: '/team-logos/9/new.webp' });
        // republishing freezes the list again
        apply(await saveEpisodeRecord({ id: saved.id, slug: 'frozen-teams', script: teamCue('team Grim "After the rebrand"'), publish: true }));
        assert.equal((await data.getEpisodeTeams((await data.getPublishedEpisode('frozen-teams'))!)).find(team => team.id === 9)?.logo, '/team-logos/9/newer.webp');
    });
    await t.test('an episode published before team snapshots follows the live list', async () => {
        const saved = apply(await saveEpisodeRecord({ id: null, slug: 'legacy-teams', script: teamCue('team Grim'), publish: true }));
        await client.query('update league.coachs_corner_episodes set teams = null where id = $1', [saved.id]);
        league.expire(LEAGUE_TAG);
        const episode = (await data.getPublishedEpisode('legacy-teams'))!;
        assert.equal(episode.teams, null);
        assert.deepEqual(await data.getEpisodeTeams(episode), await data.getStudioTeams());
    });
    await t.test('the bundled pilot shows its own frozen team list', async () => {
        const pilot = data.pilotEpisode();
        assert.ok(pilot.teams && pilot.teams.length >= 10);
        const before = league.queries();
        assert.deepEqual(await data.getEpisodeTeams(pilot), pilot.teams);
        assert.equal(league.queries(), before, 'no database read');
        const compiled = episodeFrom(pilot.script, { slug: pilot.slug, teams: pilot.teams! });
        assert.deepEqual(compiled.diagnostics.filter(d => d.severity === 'error'), [], 'every pilot team cue resolves against its snapshot');
    });
    await t.test('the draft check and Publish report the same team diagnostics, and the packet teams become the team snapshot', async () => {
        const { loadStudioTeams } = await import('../coachs-corner/studio-teams');
        const { referencePacket } = await import('../coachs-corner/production/facts');
        const { checkDraft } = await import('../coachs-corner/production/local-drafts');
        const { loadLeagueConfig } = await import('../../scripts/db/lib/league-config');
        // Hooterville's owner renamed the team; the packet is captured after it
        await client.exec(`insert into league.team_management (franchise_id, name) values (3, 'Hooterville Hooters')`);
        league.expire(LEAGUE_TAG);
        const facts = referencePacket(loadLeagueConfig(), 2027, await loadStudioTeams());
        const script = (cue: string) => `${screenplay('Agreement')}\n>> matchup Hooters 10 ${cue} 9\nRON: And Carolina. [>> team Reapers]`;
        const draftErrors = async (source: string) => errorsAt((await checkDraft({ slug: 'agreement-teams', script: source, facts, pronunciations: [], brief: '', review: '', revision: '' }))
            .diagnostics.filter(d => !/^(Missing asset|Expected a local public asset)/.test(d.message)));
        const broken = script('Nick');
        const published = await saveEpisodeRecord({ id: null, slug: 'agreement-teams', script: broken, publish: true });
        assert.match(await draftErrors(broken), /“Nick” matches 2 teams/);
        assert.deepEqual(published, { error: await draftErrors(broken) });
        const fixed = script('JAGR');
        assert.equal(await draftErrors(fixed), '');
        const saved = apply(await saveEpisodeRecord({ id: null, slug: 'agreement-teams', script: fixed, publish: true }));
        const studio = ({ id, name, abbreviation, owner, ownerFirst, logo, primary, secondary }: StudioTeam) => ({ id, name, abbreviation, owner, ownerFirst, logo, primary, secondary });
        assert.deepEqual((await data.getEpisodeById(saved.id))?.teams, facts.teams.map(studio));
    });
    await t.test("Carolina's current abbreviation passes the draft check, the editor and Publish; its league.yml first abbreviation fails all three alike", async () => {
        const { loadStudioTeams } = await import('../coachs-corner/studio-teams');
        const { referencePacket } = await import('../coachs-corner/production/facts');
        const { draftEpisode } = await import('../coachs-corner/production/local-drafts');
        const { loadLeagueConfig } = await import('../../scripts/db/lib/league-config');
        const config = loadLeagueConfig();
        assert.deepEqual(config.franchises.find(f => f.id === 9)?.eras.at(-1)?.abbreviations, ['Reaper', 'Reapers']);
        const facts = referencePacket(config, 2027, await loadStudioTeams());
        const editorTeams = await data.getStudioTeams();
        for (const [cue, ok] of [['Reapers', true], ['Reaper', false]] as const) {
            const source = teamCue(`team ${cue}`);
            const draft = errorsAt(draftEpisode({ slug: 'carolina', script: source, facts, pronunciations: [], brief: '', review: '', revision: '' }).diagnostics);
            const editor = errorsAt(episodeFrom(source, { teams: editorTeams }).diagnostics);
            const publish = await saveEpisodeRecord({ id: null, slug: `carolina-${cue.toLowerCase()}`, script: source, publish: true });
            assert.equal(draft, editor, cue);
            if (ok) assert.ok(!('error' in publish) && draft === '', cue);
            else assert.deepEqual(publish, { error: draft }, cue);
        }
    });
});
