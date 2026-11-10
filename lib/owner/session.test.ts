import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { disposableLeague } from '../testing/disposable-league';
import { hashCode } from './model';
import { createMemoryIdentity, createMemoryRequest, createMemoryStorage } from './memory-ports';

// Franchise 1 is owned by owner-1, 2 is unclaimed with an open invitation, 3 is owned by owner-3 and folded,
// 4 is unclaimed with an expired invitation.
const OPEN_CODE = 'o'.repeat(32);
const EXPIRED_CODE = 'e'.repeat(32);
const SEED = `
    insert into league.seasons values (2026, '2025–26', 'complete');
    insert into league.franchises (id, display_name, first_season, folded_after_season) values
        (1, 'Owned Club', 2026, null), (2, 'Open Club', 2026, null), (3, 'Folded Club', 2026, 2026), (4, 'Late Club', 2026, null);
    insert into league.team_seasons (id, season_year, franchise_id, name, fantrax_name, abbreviation, division, division_rank, wins, losses, ties, fpts_for, fpts_against, logo_url)
        values (1, 2026, 1, 'Owned Club', 'Owned Club', 'OC', 1, 1, 1, 0, 0, 1, 0, '/history/owned.png');
    insert into league.team_management (franchise_id, owner_uid, owner_email, name, logo_url, version) values
        (1, 'owner-1', 'one@example.test', 'Owned Club', 'https://blob.test/team-logos/1/logo-old.webp', 3),
        (3, 'owner-3', 'three@example.test', null, null, 1);
    insert into league.team_management (franchise_id, invite_hash, invite_expires_at) values
        (2, '${hashCode(OPEN_CODE)}', now() + interval '14 days'),
        (4, '${hashCode(EXPIRED_CODE)}', now() - interval '1 second');
`;

async function owners(t: TestContext) {
    const league = await disposableLeague(t, { app: true, nextCache: true, seed: SEED });
    const { createOwnerSession } = await import('./create-owner-session');
    const identity = createMemoryIdentity();
    const storage = createMemoryStorage();
    const request = createMemoryRequest();
    const session = createOwnerSession({ identity: identity.port, storage: storage.port, request: request.port });
    // Every use case runs as a server action would.
    const act = async <T>(fn: (s: typeof session) => Promise<T>) => (await league.runAsRoute('/owner', () => fn(session))).result;
    const query = async <T>(text: string) => (await league.client.query<T>(text)).rows;
    const signInAs = (uid: string) => act(s => s.signIn(identity.signIn(uid)));
    return { league, identity, storage, request, session, act, query, signInAs };
}

test('a missing or foreign origin is rejected before anything else runs', async t => {
    const { request, identity, act, query, signInAs } = await owners(t);
    await signInAs('owner-1');
    const checks = { session: identity.state.sessionChecks, admin: request.state.adminChecks };
    const [{ count: limitsBefore }] = await query<{ count: number }>('select count(*)::int as count from league.owner_rate_limits');
    for (const origin of [null, 'https://evil.test', 'not a url']) {
        request.state.origin = origin;
        await assert.rejects(act(s => s.preamble('save-team')), { message: 'Please reload the page and try again.' });
    }
    assert.deepEqual({ session: identity.state.sessionChecks, admin: request.state.adminChecks }, checks, 'the actor was not resolved');
    const [{ count: limitsAfter }] = await query<{ count: number }>('select count(*)::int as count from league.owner_rate_limits');
    assert.equal(limitsAfter, limitsBefore, 'the rate limit was not touched');
});

test('the 31st attempt at an action in 15 minutes is rejected', async t => {
    const { act, signInAs } = await owners(t);
    await signInAs('owner-1');
    for (let i = 0; i < 30; i++) assert.equal((await act(s => s.preamble('save-team'))).ok, true);
    await assert.rejects(act(s => s.preamble('save-team')), { message: 'Too many attempts. Please try again in 15 minutes.' });
    assert.equal((await act(s => s.preamble('save-branding'))).ok, true, 'each action has its own limit');
});

test('the preamble resolves the admin or the signed-in owner', async t => {
    const { request, act, signInAs } = await owners(t);
    assert.deepEqual(await act(s => s.preamble('save-team')), { ok: false, reason: 'session-expired' });
    await signInAs('owner-1');
    assert.deepEqual(await act(s => s.preamble('save-team')), { ok: true, actor: { uid: 'owner-1' } });
    request.state.admin = true;
    assert.deepEqual(await act(s => s.preamble('save-team')), { ok: true, actor: { admin: true } });
});

test('a revoked owner session is expired', async t => {
    const { identity, act, signInAs } = await owners(t);
    await signInAs('owner-1');
    identity.state.revoked.add('owner-1');
    assert.deepEqual(await act(s => s.preamble('save-team')), { ok: false, reason: 'session-expired' });
});

test('asked for the team, the preamble returns the owner and the active team they manage', async t => {
    const { request, act, signInAs } = await owners(t);
    assert.deepEqual(await act(s => s.preamble('keepers', { team: true })), { ok: false, reason: 'session-expired' });
    request.state.admin = true;
    assert.deepEqual(await act(s => s.preamble('keepers', { team: true })), { ok: false, reason: 'session-expired' }, 'the admin manages no team');
    request.state.admin = false;
    await signInAs('owner-1');
    const result = await act(s => s.preamble('keepers', { team: true }));
    assert.ok(result.ok);
    assert.deepEqual(result.actor, { uid: 'owner-1' });
    assert.equal(result.team.id, 1);
    await signInAs('owner-3');
    assert.deepEqual(await act(s => s.preamble('keepers', { team: true })), { ok: false, reason: 'no-team' }, 'a folded team is not managed');
});

test('signing in needs a sign-in from the last five minutes and starts a five-day session', async t => {
    const { identity, request, act } = await owners(t);
    await assert.rejects(act(s => s.signIn(identity.signIn('owner-1', 'one@example.test', 301))), { message: 'Please sign in again.' });
    await assert.rejects(act(s => s.signIn(identity.signIn('owner-1', null))), { message: 'Please sign in again.' }, 'an account needs an email');
    assert.equal(request.state.cookies.size, 0);
    await act(s => s.signIn(identity.signIn('owner-1')));
    const cookie = request.state.cookies.get('yofhl_owner');
    assert.equal(cookie?.options?.httpOnly, true);
    assert.equal(cookie?.options?.maxAge, 5 * 24 * 60 * 60);
    assert.deepEqual(await act(s => s.currentOwner()), { uid: 'owner-1', email: 'owner-1@example.test' });
});

test('signing out ends the owner session', async t => {
    const { act, signInAs } = await owners(t);
    await signInAs('owner-1');
    await act(s => s.signOut());
    assert.equal(await act(s => s.currentOwner()), null);
    assert.deepEqual(await act(s => s.preamble('save-team')), { ok: false, reason: 'session-expired' });
});

const claimedBy = async (query: Awaited<ReturnType<typeof owners>>['query'], franchiseId: number) =>
    (await query<{ owner_uid: string | null }>(`select owner_uid from league.team_management where franchise_id = ${franchiseId}`))[0]?.owner_uid ?? null;

test('claiming a team with an open invitation signs the owner in and binds the team', async t => {
    const { identity, act, query } = await owners(t);
    assert.deepEqual(await act(s => s.claimTeam(identity.signIn('new-owner'), OPEN_CODE)), { ok: true, franchiseId: 2 });
    assert.equal(await claimedBy(query, 2), 'new-owner');
    const start = await act(s => s.preamble('keepers', { team: true }));
    assert.equal(start.ok && start.team.id, 2, 'the new owner is signed in and manages the team');
});

test('an identity failure while starting the session leaves the invitation unused', async t => {
    const { identity, act, query } = await owners(t);
    const token = identity.signIn('new-owner');
    identity.state.failing.add('createSession');
    await assert.rejects(act(s => s.claimTeam(token, OPEN_CODE)), { message: 'Firebase is down' });
    assert.equal(await claimedBy(query, 2), null);
    identity.state.failing.clear();
    assert.deepEqual(await act(s => s.claimTeam(token, OPEN_CODE)), { ok: true, franchiseId: 2 }, 'the same code still works');
});

test('a malformed, used or expired invitation code is refused', async t => {
    const { identity, act, query } = await owners(t);
    assert.deepEqual(await act(s => s.claimTeam(identity.signIn('new-owner'), 'too short')), { ok: false, reason: 'invalid-code' });
    assert.deepEqual(await act(s => s.claimTeam(identity.signIn('new-owner'), EXPIRED_CODE)), { ok: false, reason: 'code-unavailable' });
    assert.equal(await claimedBy(query, 4), null);
    await act(s => s.claimTeam(identity.signIn('first'), OPEN_CODE));
    assert.deepEqual(await act(s => s.claimTeam(identity.signIn('second'), OPEN_CODE)), { ok: false, reason: 'code-unavailable' });
    assert.equal(await claimedBy(query, 2), 'first');
});

test('an account that already owns a team cannot claim a second', async t => {
    const { league, identity, act, query } = await owners(t);
    // The claim statement's own guard.
    assert.deepEqual(await act(s => s.claimTeam(identity.signIn('owner-1'), OPEN_CODE)), { ok: false, reason: 'code-unavailable' });
    assert.equal(await claimedBy(query, 2), null);
    // A concurrent claim by the same account trips the unique owner instead.
    league.failNextQuery('update league.team_management', Object.assign(new Error('duplicate key'), { cause: { code: '23505' } }));
    assert.deepEqual(await act(s => s.claimTeam(identity.signIn('racing-owner'), OPEN_CODE)), { ok: false, reason: 'already-owns-team' });
});

test('signing in and claiming are rate limited by client address', async t => {
    const { identity, request, act } = await owners(t);
    for (let i = 0; i < 30; i++) await act(s => s.claimTeam(identity.signIn('guesser'), 'x'.repeat(32)));
    await assert.rejects(act(s => s.claimTeam(identity.signIn('guesser'), OPEN_CODE)), { message: 'Too many attempts. Please try again in 15 minutes.' });
    request.state.ip = '198.51.100.1';
    assert.equal((await act(s => s.claimTeam(identity.signIn('guesser'), OPEN_CODE))).ok, true, 'another address has its own limit');
});

const OLD_LOGO = 'https://blob.test/team-logos/1/logo-old.webp';
const image = (width = 8, height = 8, format: 'png' | 'jpeg' | 'webp' = 'png') =>
    sharp({ create: { width, height, channels: 3, background: '#C8102E' } })[format]().toBuffer().then(bytes => new Blob([new Uint8Array(bytes)]));

/** An owner-1 session with the team's current logo in storage. */
async function ownerOne(t: TestContext) {
    const owner = await owners(t);
    owner.storage.state.files.set(OLD_LOGO, Buffer.from('old'));
    await owner.signInAs('owner-1');
    const identityOf = async (id: number) => (await owner.query<{ name: string | null; logo_url: string | null; version: number }>(
        `select name, logo_url, version from league.team_management where franchise_id = ${id}`))[0];
    return { ...owner, identityOf };
}

test('saving a team stores its new name and logo as a 512-pixel WebP, and cleans up the replaced upload', async t => {
    const { storage, act, identityOf } = await ownerOne(t);
    assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 1, version: 3, name: '  New   Name ', logo: await image(1024, 600) })), { ok: true });
    const saved = await identityOf(1);
    assert.equal(saved.name, 'New Name');
    assert.equal(saved.version, 4);
    assert.match(saved.logo_url!, /^https:\/\/blob\.test\/team-logos\/1\//);
    assert.deepEqual([...storage.state.files.keys()], [saved.logo_url], 'the replaced upload is deleted');
    const stored = await sharp(storage.state.files.get(saved.logo_url!)!).metadata();
    assert.deepEqual([stored.format, stored.width, stored.height], ['webp', 512, 300]);
});

test('a team name outside 2 to 60 characters is refused', async t => {
    const { storage, act, identityOf } = await ownerOne(t);
    for (const name of ['A', 'x'.repeat(61), '', null]) {
        assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 1, version: 3, name, logo: null })), { ok: false, reason: 'invalid-name' }, String(name));
    }
    assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 1, version: 3, name: 'A', logo: new Blob(['x']) })), { ok: false, reason: 'invalid-name' });
    assert.equal(storage.state.files.size, 1);
    assert.equal((await identityOf(1)).name, 'Owned Club');
});

test('an oversized or unreadable logo is refused before any upload', async t => {
    const { storage, act, identityOf } = await ownerOne(t);
    const save = (logo: Blob) => act(async s => s.saveTeam({ franchiseId: 1, version: 3, name: 'New Name', logo }));
    assert.deepEqual(await save(new Blob([new Uint8Array(2 * 1024 * 1024 + 1)])), { ok: false, reason: 'image-too-large' });
    assert.deepEqual(await save(new Blob(['not an image'])), { ok: false, reason: 'image-unreadable' });
    assert.deepEqual(await save(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>'])), { ok: false, reason: 'image-unreadable' }, 'SVG is refused');
    assert.deepEqual(await save(await image(5000, 4000)), { ok: false, reason: 'image-unreadable' }, 'over 16 megapixels');
    assert.deepEqual([...storage.state.files.keys()], [OLD_LOGO]);
    assert.deepEqual(await identityOf(1), { name: 'Owned Club', logo_url: OLD_LOGO, version: 3 });
});

test('JPEG and WebP logos are accepted', async t => {
    const { act } = await ownerOne(t);
    assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 1, version: 3, name: 'New Name', logo: await image(8, 8, 'jpeg') })), { ok: true });
    assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 1, version: 4, name: 'New Name', logo: await image(8, 8, 'webp') })), { ok: true });
});

test('a failed upload leaves the current identity untouched', async t => {
    const { storage, act, identityOf } = await ownerOne(t);
    storage.state.down = true;
    assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 1, version: 3, name: 'New Name', logo: await image() })), { ok: false, reason: 'upload-failed' });
    assert.deepEqual(await identityOf(1), { name: 'Owned Club', logo_url: OLD_LOGO, version: 3 });
});

test('a refused save deletes the logo it just uploaded', async t => {
    const { storage, act, identityOf } = await ownerOne(t);
    assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 2, version: 1, name: 'Not Mine', logo: await image() })), { ok: false, reason: 'not-owner' });
    assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 1, version: 2, name: 'Stale Tab', logo: await image() })), { ok: false, reason: 'stale-version' });
    assert.deepEqual([...storage.state.files.keys()], [OLD_LOGO]);
    assert.deepEqual(await identityOf(1), { name: 'Owned Club', logo_url: OLD_LOGO, version: 3 });
});

test('a database error keeps the new upload, since the save may have committed', async t => {
    const { league, storage, act } = await ownerOne(t);
    league.failNextQuery('update league.team_management', new Error('connection timeout'));
    assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 1, version: 3, name: 'New Name', logo: await image() })), { ok: false, reason: 'save-failed' });
    assert.equal(storage.state.files.size, 2);
    assert.ok(storage.state.files.has(OLD_LOGO));
});

test('a replaced logo outside the team’s upload folder is never deleted', async t => {
    const { storage, act, query } = await ownerOne(t);
    const elsewhere = 'https://blob.test/team-logos/2/logo-shared.webp';
    storage.state.files.set(elsewhere, Buffer.from('other team'));
    for (const logo of [elsewhere, '/logos/checked-in.png']) {
        await query(`update league.team_management set logo_url = '${logo}' where franchise_id = 1`);
        const [{ version }] = await query<{ version: number }>('select version from league.team_management where franchise_id = 1');
        assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 1, version, name: 'New Name', logo: await image() })), { ok: true });
    }
    assert.ok(storage.state.files.has(elsewhere));
});

test('saving without a new logo keeps the current one', async t => {
    const { storage, act, identityOf } = await ownerOne(t);
    assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 1, version: 3, name: 'New Name', logo: new Blob([]) })), { ok: true });
    assert.deepEqual(await identityOf(1), { name: 'New Name', logo_url: OLD_LOGO, version: 4 });
    assert.ok(storage.state.files.has(OLD_LOGO));
});

test('a save with no session or a malformed team is refused', async t => {
    const { act, signInAs } = await owners(t);
    assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 1, version: 3, name: 'New Name' })), { ok: false, reason: 'session-expired' });
    assert.deepEqual(await act(s => s.saveBranding(1, 3, BRANDING)), { ok: false, reason: 'session-expired' });
    await signInAs('owner-1');
    for (const [franchiseId, version] of [[NaN, 3], [1, -1], [1.5, 3], [0, 3]]) {
        assert.deepEqual(await act(async s => s.saveTeam({ franchiseId, version, name: 'New Name' })), { ok: false, reason: 'invalid-team' });
        assert.deepEqual(await act(s => s.saveBranding(franchiseId, version, BRANDING)), { ok: false, reason: 'invalid-team' });
    }
});

const BRANDING = { primary: '#123ABC', secondary: '#D24015', tertiary: '#FFFFFF', treatment: 'stripes' };
const brandingOf = async (query: Awaited<ReturnType<typeof owners>>['query'], id: number) =>
    (await query<{ branding: unknown }>(`select branding from league.team_management where franchise_id = ${id}`))[0]?.branding ?? null;

test('an owner saves their team’s branding, and only theirs', async t => {
    const { act, query, signInAs } = await owners(t);
    await signInAs('owner-1');
    assert.deepEqual(await act(s => s.saveBranding(1, 3, { ...BRANDING, primary: '#123abc' })), { ok: true });
    assert.deepEqual(await brandingOf(query, 1), BRANDING);
    assert.deepEqual(await act(s => s.saveBranding(1, 3, BRANDING)), { ok: false, reason: 'stale-version' });
    assert.deepEqual(await act(s => s.saveBranding(2, 1, BRANDING)), { ok: false, reason: 'not-owner' });
    assert.deepEqual(await act(s => s.saveBranding(1, 4, { ...BRANDING, primary: 'red' })), { ok: false, reason: 'invalid-branding' });
});

test('malformed branding requests count toward the rate limit', async t => {
    const { act, signInAs } = await owners(t);
    await signInAs('owner-1');
    for (let i = 0; i < 30; i++) assert.deepEqual(await act(s => s.saveBranding(1, 3, null)), { ok: false, reason: 'invalid-branding' });
    await assert.rejects(act(s => s.saveBranding(1, 3, BRANDING)), { message: 'Too many attempts. Please try again in 15 minutes.' });
});

test('the admin saves any team’s identity and branding through the same use cases', async t => {
    const { request, storage, act, query } = await owners(t);
    request.state.admin = true;
    assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 3, version: 1, name: 'Refounded', logo: await image() })), { ok: true }, 'a folded team');
    assert.deepEqual(await act(async s => s.saveTeam({ franchiseId: 4, version: 1, name: 'Late Bloomers' })), { ok: true }, 'an unclaimed team');
    assert.deepEqual(await act(s => s.saveBranding(1, 3, BRANDING)), { ok: true }, 'an owned team');
    const [folded] = await query<{ name: string; logo_url: string }>('select name, logo_url from league.team_management where franchise_id = 3');
    assert.equal(folded.name, 'Refounded');
    assert.ok(storage.state.files.has(folded.logo_url));
    assert.deepEqual(await brandingOf(query, 1), BRANDING);
});
