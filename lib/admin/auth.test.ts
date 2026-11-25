import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSameOrigin } from '../owner/same-origin';
import { disposableLeague } from '../testing/disposable-league';

test('checkCredentials requires configuration and validates exact username/password pairs', async t => {
    const prevUser = process.env.ADMIN_USERNAME;
    const prevPass = process.env.ADMIN_PASSWORD;
    t.after(() => {
        if (prevUser === undefined) delete process.env.ADMIN_USERNAME; else process.env.ADMIN_USERNAME = prevUser;
        if (prevPass === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = prevPass;
    });

    const { checkCredentials } = await import('./auth');
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    assert.equal(checkCredentials('', ''), false);

    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';
    assert.equal(checkCredentials('admin', 'wrong'), false);
    assert.equal(checkCredentials('wrong', 'correct-horse-battery-staple'), false);
    assert.equal(checkCredentials('admin', 'correct-horse-battery-staple'), true);
});

test('safeAdminNext permits only /admin or /admin/... paths', async () => {
    const { safeAdminNext } = await import('./auth');
    assert.equal(safeAdminNext('/admin'), '/admin');
    assert.equal(safeAdminNext('/admin/teams'), '/admin/teams');
    assert.equal(safeAdminNext('/admin/seasons/2026'), '/admin/seasons/2026');
    for (const bad of ['', '/adminfoo', '//evil.com', 'https://evil.com', '/owner', 'admin/teams']) {
        assert.equal(safeAdminNext(bad), '/admin', bad);
    }
});

test('isAdminLoginAllowed and recordAdminLoginFailure enforce failure-only per-IP 15-minute limits without a global bucket', async t => {
    const league = await disposableLeague(t, { app: true });
    const auth = await import('./auth');
    const { ADMIN_LOGIN_IP_LIMIT, isAdminLoginAllowed, recordAdminLoginFailure } = auth;

    assert.equal('ADMIN_LOGIN_GLOBAL_LIMIT' in auth, false, 'global login limit must be removed');

    const countRows = async () =>
        (await league.client.query<{ count: number }>('select count(*)::int as count from league.owner_rate_limits')).rows[0].count;
    const totalAttempts = async () =>
        (await league.client.query<{ total: number }>('select coalesce(sum(attempts), 0)::int as total from league.owner_rate_limits')).rows[0].total;

    assert.equal(await isAdminLoginAllowed('192.0.2.1'), true);
    assert.equal(await isAdminLoginAllowed('192.0.2.1'), true);
    assert.equal(await countRows(), 0, 'read-only allowance checks must not create rate-limit rows');

    for (let i = 0; i < ADMIN_LOGIN_IP_LIMIT - 1; i++) {
        assert.equal(await recordAdminLoginFailure('192.0.2.1'), true, `IP 1 failure ${i + 1}`);
        assert.equal(await isAdminLoginAllowed('192.0.2.1'), true);
    }
    assert.equal(await recordAdminLoginFailure('192.0.2.1'), false, 'IP 1 hits limit on 10th failure');
    assert.equal(await isAdminLoginAllowed('192.0.2.1'), false, 'IP 1 is blocked after per-IP limit');
    assert.equal(await isAdminLoginAllowed('192.0.2.1'), false);
    assert.equal(await totalAttempts(), ADMIN_LOGIN_IP_LIMIT, 'repeated blocked checks must not increment attempts');

    // Exhausting multiple IPs well past the old global limit (30) must never lock out another IP
    for (let ipIndex = 2; ipIndex <= 5; ipIndex++) {
        const ip = `192.0.2.${ipIndex}`;
        for (let i = 0; i < ADMIN_LOGIN_IP_LIMIT - 1; i++) {
            assert.equal(await recordAdminLoginFailure(ip), true);
        }
        assert.equal(await recordAdminLoginFailure(ip), false);
    }
    assert.equal(await isAdminLoginAllowed('192.0.2.250'), true, 'fresh IP is never blocked by other IPs');

    // Expiring the 15-minute window unblocks the IP immediately and resets on the next failure
    await league.client.query("update league.owner_rate_limits set resets_at = now() - interval '1 second'");
    assert.equal(await isAdminLoginAllowed('192.0.2.1'), true);
    assert.equal(await recordAdminLoginFailure('192.0.2.1'), true);
});

test('attemptAdminLogin handles origin mismatch cleanly, counts only failures, and locks out per IP', async t => {
    const prevUser = process.env.ADMIN_USERNAME;
    const prevPass = process.env.ADMIN_PASSWORD;
    t.after(() => {
        if (prevUser === undefined) delete process.env.ADMIN_USERNAME; else process.env.ADMIN_USERNAME = prevUser;
        if (prevPass === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = prevPass;
    });
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';

    const league = await disposableLeague(t, { app: true });
    const { ADMIN_LOGIN_IP_LIMIT, attemptAdminLogin } = await import('./auth');

    const countRows = async () =>
        (await league.client.query<{ count: number }>('select count(*)::int as count from league.owner_rate_limits')).rows[0].count;
    const totalAttempts = async () =>
        (await league.client.query<{ total: number }>('select coalesce(sum(attempts), 0)::int as total from league.owner_rate_limits')).rows[0].total;

    let sessionsIssued = 0;
    const ports = (ip: string, origin: string | null = 'https://yofhl.test') => ({
        checkOrigin: async () => assertSameOrigin(origin, 'yofhl.test'),
        clientIp: async () => ip,
        issueSession: async () => { sessionsIssued++; },
        slowDown: async () => {},
    });

    // Origin mismatch returns { ok: false, error } without throwing, issuing a session, or touching rate limits
    for (const badOrigin of [null, 'https://evil.test', 'not-a-url']) {
        const res = await attemptAdminLogin(
            { username: 'admin', password: 'wrong', next: '/admin' },
            ports('192.0.2.10', badOrigin),
        );
        assert.deepEqual(res, { ok: false, error: 'Please reload the page and try again.' });
    }
    assert.equal(sessionsIssued, 0);
    assert.equal(await countRows(), 0, 'origin mismatch does not touch rate limits');

    // Non-origin errors from checkOrigin are still propagated
    await assert.rejects(
        attemptAdminLogin(
            { username: 'admin', password: 'wrong', next: '/admin' },
            { ...ports('192.0.2.10'), checkOrigin: async () => { throw new Error('unexpected header failure'); } },
        ),
        { message: 'unexpected header failure' },
    );

    // Valid logins never consume or increment rate-limit attempts
    for (let i = 0; i < ADMIN_LOGIN_IP_LIMIT + 5; i++) {
        const res = await attemptAdminLogin(
            { username: 'admin', password: 'correct-horse-battery-staple', next: i === 0 ? '/admin/teams' : '//evil.com' },
            ports('192.0.2.10'),
        );
        assert.deepEqual(res, { ok: true, redirectTo: i === 0 ? '/admin/teams' : '/admin' });
    }
    assert.equal(sessionsIssued, ADMIN_LOGIN_IP_LIMIT + 5);
    assert.equal(await countRows(), 0, 'valid logins never create rate-limit rows');

    // Failed logins increment per-IP failures; valid login before the limit succeeds without adding an attempt
    for (let i = 0; i < ADMIN_LOGIN_IP_LIMIT - 1; i++) {
        const res = await attemptAdminLogin(
            { username: 'admin', password: 'wrong', next: '/admin' },
            ports('192.0.2.11'),
        );
        assert.deepEqual(res, { ok: false, error: 'That username and password combination is incorrect.' });
    }
    const validAfterNineFailures = await attemptAdminLogin(
        { username: 'admin', password: 'correct-horse-battery-staple', next: '/admin' },
        ports('192.0.2.11'),
    );
    assert.deepEqual(validAfterNineFailures, { ok: true, redirectTo: '/admin' });
    assert.equal(await totalAttempts(), ADMIN_LOGIN_IP_LIMIT - 1, 'valid login after failures does not increment counter');

    // 10th failure reaches the limit; 11th attempt (even with valid credentials) is blocked without incrementing
    const tenthFailure = await attemptAdminLogin(
        { username: 'admin', password: 'wrong', next: '/admin' },
        ports('192.0.2.11'),
    );
    assert.deepEqual(tenthFailure, { ok: false, error: 'That username and password combination is incorrect.' });

    const sessionsBeforeBlocked = sessionsIssued;
    const blockedAttempt = await attemptAdminLogin(
        { username: 'admin', password: 'correct-horse-battery-staple', next: '/admin' },
        ports('192.0.2.11'),
    );
    assert.deepEqual(blockedAttempt, { ok: false, error: 'Too many sign-in attempts. Please try again in 15 minutes.' });
    assert.equal(sessionsIssued, sessionsBeforeBlocked, 'blocked attempt must not issue a session');
    assert.equal(await totalAttempts(), ADMIN_LOGIN_IP_LIMIT, 'blocked attempt must not increment counter');

    // Another IP is unaffected
    const otherIp = await attemptAdminLogin(
        { username: 'admin', password: 'correct-horse-battery-staple', next: '/admin' },
        ports('192.0.2.12'),
    );
    assert.deepEqual(otherIp, { ok: true, redirectTo: '/admin' });
});
