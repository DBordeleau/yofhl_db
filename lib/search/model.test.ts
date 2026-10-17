import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSearch, parseSearch, searchDirectory, searchHref, type SearchEntry } from './model';

const entries: SearchEntry[] = [
    { kind: 'players', id: 'one', title: 'Patrice Bérgeron', subtitle: 'C', href: '/player/one' },
    { kind: 'teams', id: '1', title: 'New Team', subtitle: 'Franchise', href: '/teams/1', aliases: [{ text: 'Old Team', note: 'Formerly Old Team · 2024–25' }, { text: 'NT' }] },
    { kind: 'teams', id: '2', title: 'Old Team', subtitle: 'Defunct', href: '/teams/2', defunct: true },
    { kind: 'awards', id: 'prime-minister', title: 'Prime Minister’s Trophy', subtitle: 'Top-scoring team', href: "/awards/Prime_Minister's_Trophy" },
    { kind: 'seasons', id: '2020', title: '2019–20', subtitle: 'Playoffs cancelled', href: '/season/2020', aliases: [{ text: '2020' }, { text: '2019-2020' }] },
];
const find = (q: string) => searchDirectory(entries, { q, type: 'all', page: 1 });

test('likely players lead equally good matches without overriding a more specific name', () => {
    const players: SearchEntry[] = [
        ['Aidan McDonough', 10], ['Connor McDavid', 5000], ['Ryan McDonagh', 1700],
        ['Gage Quinney', 2], ['Quinn Hughes', 2400], ['Jack Quinn', 400],
    ].map(([title, points]) => ({ kind: 'players', id: String(title), title: String(title), subtitle: '', href: '/player/test', careerPoints: Number(points) }));
    const results = (q: string) => searchDirectory(players, { q, type: 'players', page: 1 }).groups[0].results;
    assert.deepEqual(results('mcd').map(row => row.title), ['Connor McDavid', 'Ryan McDonagh', 'Aidan McDonough']);
    assert.deepEqual(results('quinn').map(row => row.title), ['Quinn Hughes', 'Jack Quinn', 'Gage Quinney']);
    assert.equal(results('aidan mcd')[0].title, 'Aidan McDonough');
    assert.equal(results('Jack Quinn')[0].title, 'Jack Quinn');
    assert.equal(results('hughes q')[0].title, 'Quinn Hughes');
    assert.equal(results('c. mcd')[0].title, 'Connor McDavid');
    for (const q of ['mcdavd', 'mcdavvid', 'mcdavix', 'mcdvaid', 'connor mcdavd']) assert.equal(results(q)[0].title, 'Connor McDavid', q);
    assert.equal(results('mcdxxid').length, 0, 'two typos are not a useful match');
    assert.equal(results('mxd').length, 0, 'short queries do not expand into unrelated names');
    assert.equal('careerPoints' in results('mcd')[0], false, 'ranking metadata stays in the server directory');
});

test('search handles accents, punctuation, token order, abbreviations, aliases and season end years', () => {
    assert.equal(normalizeSearch('  JEAN O’Neil & co. '), 'jean oneil and co');
    assert.equal(find('bergeron patr').groups[0].results[0].id, 'one');
    assert.equal(find('NT').groups[1].results[0].href, '/teams/1');
    assert.deepEqual(find('old team').groups[1].results.map(row => row.id), ['2', '1'], 'exact title precedes an old alias');
    assert.match(find('old team').groups[1].results[1].subtitle, /Formerly Old Team/);
    assert.equal(find("prime minister's").groups[2].results[0].id, 'prime-minister');
    for (const q of ['2020', '2019-20', '2019–2020']) assert.equal(find(q).groups[3].results[0].id, '2020');
    assert.equal(find('---').total, 0);
    assert.equal(find('p').total, 0);
    assert.equal(find('no matching name').total, 0);
    assert.equal('aliases' in find('NT').groups[1].results[0], false, 'internal directory fields stay server-side');
});

test('group previews and paginated results have bounded output and URL state round-trips', () => {
    const directory = Array.from({ length: 62 }, (_, index) => ({ ...entries[0], id: String(index), title: `Player ${String(index).padStart(2, '0')}` }));
    const all = searchDirectory(directory, { q: 'player', type: 'all', page: 999 });
    assert.equal(all.groups[0].results.length, 5);
    const page = searchDirectory(directory, { q: 'player', type: 'players', page: 999 });
    assert.deepEqual([page.total, page.pages, page.page, page.groups[0].results.length], [62, 3, 3, 12]);
    assert.equal(page.groups[0].results[0].id, '50');
    const state = { q: 'Prime Minister’s Trophy', type: 'awards' as const, page: 2 };
    assert.deepEqual(parseSearch(new URL(searchHref(state), 'https://test.local').searchParams), state);
    assert.equal(parseSearch(new URLSearchParams({ type: 'owners' })).type, 'all');
    const bad = parseSearch(new URLSearchParams({ q: 'x'.repeat(200), type: 'private', page: 'Infinity' }));
    assert.deepEqual([bad.q.length, bad.type, bad.page], [60, 'all', 1]);
});
