import assert from 'node:assert/strict';
import test from 'node:test';
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

test('consumeAdminLoginAttempt enforces per-IP and global 15-minute limits in the database', async t => {
    await disposableLeague(t, { app: true });
    const {
        ADMIN_LOGIN_GLOBAL_LIMIT, ADMIN_LOGIN_IP_LIMIT, consumeAdminLoginAttempt,
    } = await import('./auth');

    for (let i = 0; i < ADMIN_LOGIN_IP_LIMIT; i++) {
        assert.equal(await consumeAdminLoginAttempt('192.0.2.1'), true, `IP 1 attempt ${i + 1}`);
    }
    assert.equal(await consumeAdminLoginAttempt('192.0.2.1'), false, 'IP 1 is blocked after per-IP limit');

    // Blocking IP 1 on its 11th try must not exhaust the global bucket for other IPs
    assert.equal(await consumeAdminLoginAttempt('192.0.2.2'), true);

    // Exhaust the global limit across fresh IPs (10 + 1 used so far = 11)
    let remaining = ADMIN_LOGIN_GLOBAL_LIMIT - (ADMIN_LOGIN_IP_LIMIT + 1);
    let ipIndex = 3;
    while (remaining > 0) {
        const ip = `192.0.2.${ipIndex++}`;
        const batch = Math.min(ADMIN_LOGIN_IP_LIMIT, remaining);
        for (let i = 0; i < batch; i++) {
            assert.equal(await consumeAdminLoginAttempt(ip), true);
            remaining--;
        }
    }
    assert.equal(await consumeAdminLoginAttempt('192.0.2.250'), false, 'fresh IP is blocked once global limit is reached');
});
