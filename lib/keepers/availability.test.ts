import test from 'node:test';
import assert from 'node:assert/strict';
import { saveKeeperSelection, refreshKeeperRoster } from '../../app/owner/keepers/actions';
import { reviewRookie } from '../../app/admin/keepers/actions';
import { KEEPERS_ENABLED } from './model';

test('disabled keeper actions reject access before authentication or data access', async () => {
    assert.equal(KEEPERS_ENABLED, false);
    const unavailable = { error: 'Keeper submissions are currently unavailable.' };
    assert.deepEqual(await saveKeeperSelection({ version: 0, rosterFingerprint: '', keptIds: [], rookieId: null, rookieDeclared: false }), unavailable);
    assert.deepEqual(await refreshKeeperRoster(), unavailable);
    assert.deepEqual(await reviewRookie(new FormData()), unavailable);
});
