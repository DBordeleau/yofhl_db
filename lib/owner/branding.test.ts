import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTeamColours, type TeamColours } from '../team-branding';

const colours: TeamColours = { primary: '#123ABC', secondary: '#D24015', tertiary: '#FFFFFF', treatment: 'stripes' };

test('branding validates colours and limits signatures to their franchises', () => {
    assert.deepEqual(parseTeamColours({ ...colours, primary: '#123abc' }, 1), colours);
    for (const value of [null, [], {}, { ...colours, primary: 'red' }, { ...colours, secondary: '#fff' }, { ...colours, tertiary: undefined }, { ...colours, primary: 'url(https://example.test)' }, { ...colours, treatment: 'unknown' }]) {
        assert.equal(parseTeamColours(value, 1), null);
    }
    assert.ok(parseTeamColours({ ...colours, treatment: 'horns' }, 1));
    assert.equal(parseTeamColours({ ...colours, treatment: 'horns' }, 2), null);
    assert.equal(parseTeamColours({ ...colours, treatment: 'arcane' }, 1), null);
    assert.ok(parseTeamColours({ ...colours, treatment: 'arcane' }, 4));
    // A colour that happened to be an old demo preset is still a valid owner choice.
    assert.equal(parseTeamColours({ ...colours, primary: '#167A83', secondary: '#ECAFC3' }, 5)?.primary, '#167A83');
    const launch: Record<string, TeamColours> = JSON.parse(readFileSync('league/seed/team-branding.json', 'utf8'));
    assert.equal(Object.keys(launch).length, 10);
    for (const [id, branding] of Object.entries(launch)) assert.deepEqual(parseTeamColours(branding, Number(id)), branding);
});
