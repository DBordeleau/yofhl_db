import assert from 'node:assert/strict';
import test from 'node:test';
import { inRefreshOrder } from './materialized-views';

test('views named out of order are refreshed in dependency order', () => {
    assert.deepEqual(inRefreshOrder(['franchise_records', 'season_results']), ['season_results', 'franchise_records']);
    assert.deepEqual(inRefreshOrder(['franchise_records', 'player_careers', 'season_results']), ['season_results', 'player_careers', 'franchise_records']);
    assert.deepEqual(inRefreshOrder(['player_careers']), ['player_careers']);
});
