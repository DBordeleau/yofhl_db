import assert from 'node:assert/strict';
import test from 'node:test';
import { exploreLinks } from './explore';
import { isPrivateRoute } from './navigation';

test('Explore next omits unavailable, duplicate, external and self links and caps the module at four', () => {
    const link = (href: string) => ({ href, title: href, reason: 'Related archive' });
    const result = exploreLinks([null, false, link('/here'), link('/one'), link('/one'), link('https://elsewhere.test'), link('//elsewhere.test'), ...[2, 3, 4, 5].map(id => link(`/item/${id}`))], '/here');
    assert.deepEqual(result.map(row => row.href), ['/one', '/item/2', '/item/3', '/item/4']);
    for (const path of ['/admin', '/admin/login', '/owner', '/owner/branding']) assert.equal(isPrivateRoute(path), true);
    for (const path of ['/', '/search', '/teams/1', '/compare/players']) assert.equal(isPrivateRoute(path), false);
});
