import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fantraxMatchupUrl } from './config';

test('deep links use the selected period and the matchup ID returned by Fantrax live scoring', () => {
    // Verified against getLeagueInfo and getLiveScoringStats for the opening 2026 matchup.
    const url = new URL(fantraxMatchupUrl(1, 'e3alkww9mutybt24', '1cbgg930mutybt24')!);
    assert.equal(url.pathname, '/fantasy/league/rf5o9cu2mutybszr/livescoring;period=1;viewType=2');
    assert.equal(url.searchParams.get('matchupId'), 'e3alkww9mutybt24_1cbgg930mutybt24');
    assert.equal(url.searchParams.get('mobileMatchupView'), 'true');
    assert.equal(url.searchParams.get('mainView'), 'MATCHUP');
    assert.match(fantraxMatchupUrl(2, 'e3alkww9mutybt24', '1cbgg930mutybt24')!, /;period=2;/);
});

test('unannounced opponents do not receive a fabricated matchup link', () => {
    assert.equal(fantraxMatchupUrl(1, undefined, '1cbgg930mutybt24'), null);
    assert.equal(fantraxMatchupUrl(1, 'e3alkww9mutybt24', undefined), null);
});
