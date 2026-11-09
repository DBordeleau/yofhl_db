import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fantraxLeagueUrl, fantraxMatchupUrl } from './config';

const LEAGUE = 'rf5o9cu2mutybszr';

test('deep links use the selected week and the matchup ID returned by Fantrax live scoring', () => {
    // Verified against getLeagueInfo and getLiveScoringStats for the opening 2026 matchup.
    const url = new URL(fantraxMatchupUrl(LEAGUE, 1, 'e3alkww9mutybt24', '1cbgg930mutybt24')!);
    assert.equal(url.pathname, '/fantasy/league/rf5o9cu2mutybszr/livescoring;period=1;viewType=2');
    assert.equal(url.searchParams.get('matchupId'), 'e3alkww9mutybt24_1cbgg930mutybt24');
    assert.equal(url.searchParams.get('mobileMatchupView'), 'true');
    assert.equal(url.searchParams.get('mainView'), 'MATCHUP');
    assert.match(fantraxMatchupUrl(LEAGUE, 2, 'e3alkww9mutybt24', '1cbgg930mutybt24')!, /;period=2;/);
});

test('links follow the live season\'s Fantrax league', () => {
    assert.equal(fantraxLeagueUrl('nextleague123'), 'https://www.fantrax.com/fantasy/league/nextleague123/home');
    assert.match(fantraxMatchupUrl('nextleague123', 1, 'a', 'h')!, /\/league\/nextleague123\/livescoring;/);
});

test('without a known league, the league link falls back to Fantrax itself', () => {
    assert.equal(fantraxLeagueUrl(null), 'https://www.fantrax.com/');
});

test('unannounced opponents do not receive a fabricated matchup link', () => {
    assert.equal(fantraxMatchupUrl(LEAGUE, 1, undefined, '1cbgg930mutybt24'), null);
    assert.equal(fantraxMatchupUrl(LEAGUE, 1, 'e3alkww9mutybt24', undefined), null);
});
